import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { createHash } from 'node:crypto'
import { T3SessionWatcher } from '../src/t3-session-watcher'
import type { AgentEvent } from '../src/protocol'

const { DatabaseSync } = require('node:sqlite')
test('reads committed WAL changes without modifying T3, replays teams and recovers from schema errors', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't3-flow-'))
  const file = path.join(dir, 'statev2.sqlite')
  const db = new DatabaseSync(file)
  let writerClosed = false
  t.after(() => { if (!writerClosed) db.close(); fs.rmSync(dir, { recursive: true, force: true }) })
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE projection_projects(project_id TEXT, workspace_root TEXT, deleted_at TEXT);
    INSERT INTO projection_projects VALUES('p','D:/Project/TH',NULL);
    CREATE TABLE orchestration_v2_projection_threads(thread_id TEXT,project_id TEXT,title TEXT,default_provider TEXT,active_provider_thread_id TEXT,created_at TEXT,updated_at TEXT,archived_at TEXT,deleted_at TEXT,payload_json TEXT);
    INSERT INTO orchestration_v2_projection_threads VALUES('root','p','Team','claudeAgent',NULL,'2026-11-06T01:00:00Z','2026-11-06T01:01:00Z',NULL,NULL,'{}');
    CREATE TABLE orchestration_v2_projection_subagents(subagent_id TEXT,thread_id TEXT,run_id TEXT,parent_node_id TEXT,provider TEXT,child_thread_id TEXT,provider_thread_id TEXT,status TEXT,driver TEXT,started_at TEXT,completed_at TEXT,updated_at TEXT,completion_delivery_state TEXT,payload_json TEXT);
    CREATE TABLE orchestration_v2_projection_runs(run_id TEXT,thread_id TEXT,ordinal INTEGER,provider TEXT,status TEXT,provider_thread_id TEXT,completed_at TEXT,payload_json TEXT);
    INSERT INTO orchestration_v2_projection_runs VALUES('r','root',1,'claude','running',NULL,NULL,'{}');
    CREATE TABLE orchestration_v2_projection_provider_threads(provider_thread_id TEXT,thread_id TEXT,provider TEXT,driver TEXT,updated_at TEXT,payload_json TEXT);
    CREATE TABLE orchestration_v2_projection_runtime_requests(runtime_request_id TEXT,thread_id TEXT,node_id TEXT,kind TEXT,status TEXT,created_at TEXT,resolved_at TEXT,payload_json TEXT);
    CREATE TABLE orchestration_v2_projection_nodes(node_id TEXT,thread_id TEXT,parent_node_id TEXT,provider_thread_id TEXT,started_at TEXT,completed_at TEXT,payload_json TEXT);
    CREATE TABLE orchestration_v2_projection_turn_items(turn_item_id TEXT,thread_id TEXT,run_id TEXT,provider_thread_id TEXT,type TEXT,status TEXT,updated_at TEXT,payload_json TEXT);
    INSERT INTO orchestration_v2_projection_turn_items VALUES('t','root','r',NULL,'dynamic_tool','running','2026-11-06T01:01:00Z','{"toolName":"delegate_task","output":"PRIVATE_TOOL_OUTPUT"}');`)
  const hash = () => createHash('sha256').update(fs.readFileSync(file)).update(fs.readFileSync(`${file}-wal`)).digest('hex')
  const before = hash()
  const watcher = new T3SessionWatcher(['D:/Project/TH'], file)
  t.after(() => watcher.dispose())
  const events: AgentEvent[] = [], lifecycle: string[] = []
  const health: Array<{ state: string; checkedAt: number; lastSuccessAt: number | null; lastChangeAt: number | null }> = []
  watcher.onEvent(event => events.push(event))
  watcher.onSessionLifecycle(event => lifecycle.push(event.type))
  watcher.onSourceHealth(value => health.push(value))
  let teamSerializations = 0
  const stringify = JSON.stringify
  t.mock.method(JSON, 'stringify', (value: any, replacer?: any, space?: any) => {
    if (value?.session && value?.payload) teamSerializations++
    return stringify(value, replacer, space)
  })
  // A successful heartbeat is fresh when it is published, even when reading/
  // delivering a large all-project snapshot takes longer than the warning age.
  let clock = 100_000
  const dateNow = t.mock.method(Date, 'now', () => clock)
  const slowDelivery = watcher.onEvent(() => { clock = 112_000 })
  watcher.poll()
  assert.equal(health.at(-1)?.checkedAt, 112_000)
  assert.equal(health.at(-1)?.lastSuccessAt, 112_000)
  slowDelivery.dispose()
  dateNow.mock.restore()
  assert.equal(watcher.getActiveSessions().length, 1)
  assert.deepEqual(watcher.projects, [{ id: 'p', title: 'TH', root: 'D:/Project/TH', current: true }], 'Older schemas fall back to the folder name')
  assert.equal(events.length, 1)
  assert.equal(health.at(-1)?.state, 'ok')
  assert.ok(health.at(-1)?.lastSuccessAt)
  assert.ok(health.at(-1)?.lastChangeAt)
  assert.equal(hash(), before, 'Read-only polling must not write the main DB or WAL')
  assert.ok(!JSON.stringify(events).includes('PRIVATE_TOOL_OUTPUT'))
  let projectionReads = 0
  const prepare = DatabaseSync.prototype.prepare
  t.mock.method(DatabaseSync.prototype, 'prepare', function(this: unknown, sql: string) {
    if (sql.includes('FROM orchestration_v2_projection_threads')) projectionReads++
    return prepare.call(this, sql)
  })
  watcher.poll()
  assert.equal(events.length, 1, 'Idle polling must not duplicate graph snapshots')
  assert.equal(teamSerializations, 1, 'identical complete input reuses projected teams and their fingerprints')
  assert.equal(projectionReads, 1, 'fresh connections read every snapshot without assuming a cross-connection revision contract')
  const replay: AgentEvent[] = []
  watcher.replaySessionStart(undefined, { onSnapshot: e => replay.push(e) })
  assert.equal(replay.length, 1)
  assert.equal(events.length, 1, 'Reconnect replay stays local to its recipient')
  const commitDuringRead = watcher.onEvent(() => db.exec("UPDATE orchestration_v2_projection_threads SET title='Concurrent commit'"))
  db.exec("UPDATE orchestration_v2_projection_runs SET status='completed'; UPDATE orchestration_v2_projection_turn_items SET status='completed'")
  watcher.poll()
  assert.equal(events.length, 2)
  assert.equal(projectionReads, 2, 'a WAL commit is visible without a main database mtime change')
  commitDuringRead.dispose()
  watcher.poll()
  assert.equal(projectionReads, 3, 'a commit during snapshot delivery remains visible next poll')
  assert.equal(teamSerializations, 3, 'a changed source input invalidates the projection cache')
  assert.equal(watcher.getActiveSessions()[0].label, 'T3 · Concurrent commit')
  assert.equal(watcher.isActive(), false)
  db.exec('ALTER TABLE orchestration_v2_projection_nodes RENAME TO saved_nodes')
  watcher.poll()
  assert.match(watcher.diagnostic, /unavailable or incompatible/)
  assert.equal(watcher.getActiveSessions().length, 1, 'A failed poll keeps the last known team')
  assert.equal(health.at(-1)?.state, 'unavailable')
  assert.equal(health.length, 5, 'Health is emitted after every poll')
  assert.equal(lifecycle.includes('ended'), false)
  db.exec('ALTER TABLE saved_nodes RENAME TO orchestration_v2_projection_nodes')
  watcher.poll()
  assert.equal(watcher.getActiveSessions().length, 1)
  assert.deepEqual(watcher.projects, [{ id: 'p', title: 'TH', root: 'D:/Project/TH', current: true }], 'Older schemas fall back to the folder name')
  assert.equal(watcher.diagnostic, 'T3 local teams (read-only)')
  db.close(); writerClosed = true
  fs.renameSync(file, `${file}.moving`)
  fs.renameSync(`${file}.moving`, file)
  watcher.poll()
  assert.equal(watcher.sourceHealth?.state, 'ok', 'T3 can replace its database between polls without a retained reader handle')
  watcher.dispose()
  watcher.poll()
  assert.equal(watcher.getActiveSessions().length, 0)
})
test('does not create a missing database or fall back to native session logs', () => {
  const file = path.join(os.tmpdir(), `missing-t3-${process.pid}-${Date.now()}.sqlite`)
  const watcher = new T3SessionWatcher(['D:/Project/TH'], file)
  watcher.poll()
  assert.equal(fs.existsSync(file), false)
  assert.match(watcher.diagnostic, /not found/)
  assert.deepEqual(watcher.getActiveSessions(), [])
  watcher.dispose()
})

test('reads only the lead\'s latest reply text, cleaned and capped, for the local orb caption', async t => {
  const { replyText } = await import('../src/t3-session-watcher')
  assert.equal(replyText('**Done.** See [the PR](https://x/y) and run `npm test`.\n\n```sh\nsecret --token\n```'), 'Done. See the PR and run npm test.')
  assert.equal(replyText(null), '')
  const long = replyText('word '.repeat(200))
  assert.ok(long.length <= 280 && long.endsWith('…'))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't3-reply-'))
  const file = path.join(dir, 'statev2.sqlite')
  const db = new DatabaseSync(file)
  db.exec(`CREATE TABLE projection_projects(project_id TEXT, workspace_root TEXT, deleted_at TEXT);
    INSERT INTO projection_projects VALUES('p','D:/Project/TH',NULL);
    CREATE TABLE orchestration_v2_projection_threads(thread_id TEXT,project_id TEXT,title TEXT,default_provider TEXT,active_provider_thread_id TEXT,created_at TEXT,updated_at TEXT,archived_at TEXT,deleted_at TEXT,payload_json TEXT);
    INSERT INTO orchestration_v2_projection_threads VALUES('root','p','Team','claudeAgent',NULL,'2026-11-06T01:00:00Z','2026-11-06T01:01:00Z',NULL,NULL,'{}');
    CREATE TABLE orchestration_v2_projection_subagents(subagent_id TEXT,thread_id TEXT,run_id TEXT,parent_node_id TEXT,provider TEXT,child_thread_id TEXT,provider_thread_id TEXT,status TEXT,driver TEXT,started_at TEXT,completed_at TEXT,updated_at TEXT,completion_delivery_state TEXT,payload_json TEXT);
    CREATE TABLE orchestration_v2_projection_runs(run_id TEXT,thread_id TEXT,ordinal INTEGER,provider TEXT,status TEXT,provider_thread_id TEXT,completed_at TEXT,payload_json TEXT);
    INSERT INTO orchestration_v2_projection_runs VALUES('r','root',1,'claude','completed',NULL,NULL,'{}');
    CREATE TABLE orchestration_v2_projection_provider_threads(provider_thread_id TEXT,thread_id TEXT,provider TEXT,driver TEXT,updated_at TEXT,payload_json TEXT);
    CREATE TABLE orchestration_v2_projection_runtime_requests(runtime_request_id TEXT,thread_id TEXT,node_id TEXT,kind TEXT,status TEXT,created_at TEXT,resolved_at TEXT,payload_json TEXT);
    CREATE TABLE orchestration_v2_projection_nodes(node_id TEXT,thread_id TEXT,parent_node_id TEXT,provider_thread_id TEXT,started_at TEXT,completed_at TEXT,payload_json TEXT);
    CREATE TABLE orchestration_v2_projection_turn_items(turn_item_id TEXT,thread_id TEXT,run_id TEXT,provider_thread_id TEXT,type TEXT,status TEXT,updated_at TEXT,payload_json TEXT);
    INSERT INTO orchestration_v2_projection_turn_items VALUES('a1','root','r',NULL,'assistant_message','completed','2026-11-06T01:00:30Z','{"text":"Old reply"}');
    INSERT INTO orchestration_v2_projection_turn_items VALUES('a2','root','r',NULL,'assistant_message','completed','2026-11-06T01:01:00Z','{"text":"Shipped the **fix**."}');
    INSERT INTO orchestration_v2_projection_turn_items VALUES('u1','root','r',NULL,'user_message','completed','2026-11-06T01:02:00Z','{"text":"PRIVATE_USER_TEXT"}');
    INSERT INTO orchestration_v2_projection_turn_items VALUES('c1','root','r',NULL,'command_execution','completed','2026-11-06T01:02:00Z','{"output":"PRIVATE_TOOL_OUTPUT"}');`)
  db.exec('BEGIN')
  for (let i = 0; i < 19; i++) {
    db.prepare(`INSERT INTO orchestration_v2_projection_threads SELECT ?,project_id,title,default_provider,active_provider_thread_id,created_at,updated_at,archived_at,deleted_at,payload_json FROM orchestration_v2_projection_threads WHERE thread_id='root'`).run(`other-${i}`)
    const insert = db.prepare('INSERT INTO orchestration_v2_projection_turn_items VALUES(?,?,NULL,NULL,?,?,?,?)')
    insert.run(`reply-${i}`, `other-${i}`, 'assistant_message', 'completed', null, '{"text":"First null timestamp"}')
    insert.run(`tie-${i}`, `other-${i}`, 'assistant_message', 'completed', null, '{"text":"Second null timestamp"}')
  }
  db.exec('COMMIT')
  db.exec(`CREATE INDEX reply_latest ON orchestration_v2_projection_turn_items(thread_id,type,updated_at DESC); BEGIN`)
  const historical = db.prepare('INSERT INTO orchestration_v2_projection_turn_items VALUES(?,?,NULL,NULL,?,?,?,?)')
  for (let i = 0; i < 100; i++) historical.run(`history-${i}`, 'root', 'assistant_message', 'completed', '2026-01-01', '{"text":"Historical reply"}')
  db.exec(`COMMIT;
    ALTER TABLE orchestration_v2_projection_turn_items RENAME TO reply_items;
    CREATE VIEW orchestration_v2_projection_turn_items AS SELECT turn_item_id,thread_id,run_id,provider_thread_id,type,status,updated_at,
      count_reply_payload(payload_json) AS payload_json FROM reply_items`)
  let replyQueries = 0
  let payloadReads = 0, replyPayloadReads = 0, decodeReads = 0, replyDecodeReads = 0
  const decoder = new DatabaseSync(':memory:')
  t.after(() => decoder.close())
  const extract = decoder.prepare('SELECT json_extract(?,?) AS value')
  const registered = new WeakSet<object>()
  const prepare = DatabaseSync.prototype.prepare
  t.mock.method(DatabaseSync.prototype, 'prepare', function(this: unknown, sql: string) {
    if (!registered.has(this as object)) {
      (this as any).function('count_reply_payload', (value: string) => { payloadReads++; return value })
      ;(this as any).function('count_reply_decode', (value: string, selector: string) => {
        decodeReads++
        return extract.get(value, selector)?.value ?? null
      })
      registered.add(this as object)
    }
    const reply = sql.includes("type = 'assistant_message'")
    const measured = reply ? sql.replaceAll('json_extract(payload_json,', 'count_reply_decode(payload_json,') : sql
    const statement = prepare.call(this, measured), all = statement.all.bind(statement)
    statement.all = (...args: unknown[]) => {
      if (reply) { replyQueries++; payloadReads = 0; decodeReads = 0 }
      const result = all(...args)
      if (reply) { replyPayloadReads = payloadReads; replyDecodeReads = decodeReads }
      return result
    }
    return statement
  })
  const watcher = new T3SessionWatcher(['D:/Project/TH'], file)
  t.after(() => { watcher.dispose(); db.close(); fs.rmSync(dir, { recursive: true, force: true }) })
  const fired: unknown[] = []
  watcher.onRepliesChanged(list => fired.push(list))
  watcher.poll()
  assert.equal(watcher.replies.length, 20)
  assert.equal(watcher.replies.find(reply => reply.sessionId === 't3:root')?.text, 'Shipped the fix.')
  assert.ok(watcher.replies.filter(reply => reply.sessionId !== 't3:root').every(reply => reply.text === 'First null timestamp'))
  assert.equal(replyQueries, 1, 'twenty lead captions share one statement')
  assert.ok(replyPayloadReads <= 40, `indexed latest-reply reads must stop at winners, not materialize old payloads (${replyPayloadReads} reads)`)
  assert.ok(!JSON.stringify(watcher.replies).includes('PRIVATE'))
  watcher.poll()
  assert.equal(fired.length, 1, 'An unchanged reply is not sent again')
  const previous = watcher.replies
  // The real T3 schema need not have a timestamp-sorted assistant-message index.
  db.exec("DROP INDEX reply_latest; DELETE FROM reply_items WHERE thread_id='root' AND type='assistant_message'; BEGIN")
  const unordered = db.prepare('INSERT INTO reply_items VALUES(?,?,NULL,NULL,?,?,?,?)')
  for (let i = 0; i < 100; i++) unordered.run(`scan-${i}`, 'root', 'assistant_message', 'completed', new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(), '{"text":"Historical reply"}')
  unordered.run('a1', 'root', 'assistant_message', 'completed', '2026-11-06T01:00:30Z', '{"text":"Old reply"}')
  unordered.run('a2', 'root', 'assistant_message', 'completed', '2026-11-06T01:01:00Z', '{"text":"Shipped the **fix**."}')
  db.exec('COMMIT')
  watcher.poll()
  assert.ok(replyDecodeReads <= 40, `only winners may be decoded even without the sorted index (${replyDecodeReads} decodes)`)
  assert.deepEqual(watcher.replies, previous)
  db.exec("UPDATE reply_items SET payload_json='{' WHERE turn_item_id='a2'")
  watcher.poll()
  assert.equal(watcher.sourceHealth?.state, 'ok', 'optional reply failures do not break team monitoring')
  assert.deepEqual(watcher.replies, previous, 'a malformed winning reply retains the previous optional caption list')
  assert.equal(fired.length, 1)
  db.exec(`UPDATE reply_items SET payload_json='{"text":"Updated reply"}' WHERE turn_item_id='a2'`)
  watcher.poll()
  assert.equal(watcher.replies.find(reply => reply.sessionId === 't3:root')?.text, 'Updated reply', 'reply-only source changes are read even when the team projection input is unchanged')
  assert.equal(fired.length, 2)
})


test('waits for the poll interval after a slow read instead of immediately catching up missed polls', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 0 })
  const watcher = new T3SessionWatcher([])
  let polls = 0
  t.mock.method(watcher, 'poll', () => {
    polls++
    // Simulate a synchronous database read crossing several timer deadlines.
    if (polls === 2) t.mock.timers.setTime(7000)
  })
  t.after(() => watcher.dispose())
  watcher.start()
  assert.equal(polls, 1)
  t.mock.timers.tick(2000)
  assert.equal(polls, 2, 'a slow read must not trigger catch-up polling')
  t.mock.timers.tick(1999)
  assert.equal(polls, 2)
  t.mock.timers.tick(1)
  assert.equal(polls, 3)
  watcher.dispose()
  t.mock.timers.tick(10_000)
  assert.equal(polls, 3, 'disposal cancels the next read')
})


test('keeps the next poll scheduled when a health listener throws during start or a timer callback', t => {
  let pending: { callback: () => void; delay: number | undefined } | undefined
  const handle = { unref() {} }
  t.mock.method(globalThis, 'setTimeout', ((callback: () => void, delay?: number) => {
    pending = { callback, delay }
    return handle
  }) as unknown as typeof setTimeout)
  t.mock.method(globalThis, 'clearTimeout', () => { pending = undefined })
  t.mock.method(console, 'warn', () => {})
  const missing = path.join(os.tmpdir(), `agent-flow-poll-guard-missing-${process.pid}.sqlite`)
  assert.equal(fs.existsSync(missing), false)
  const watcher = new T3SessionWatcher([], missing)
  t.after(() => watcher.dispose())
  let notifications = 0
  watcher.onSourceHealth(() => {
    notifications++
    if (notifications <= 2) throw new Error('health listener failed')
  })
  const runNext = () => {
    assert.equal(pending?.delay, 2000, 'poll waits for its normal interval')
    const next = pending!
    pending = undefined
    next.callback()
  }
  // Exercise the actual emitter and poll finally, not a replacement poll method.
  assert.throws(() => watcher.start(), /health listener failed/)
  assert.equal(notifications, 1)
  assert.throws(runNext, /health listener failed/)
  assert.equal(notifications, 2)
  runNext()
  assert.equal(notifications, 3, 'a caught observer error does not silently disable future polling')
  watcher.dispose()
  assert.equal(pending, undefined, 'disposal cancels the next read')
})
