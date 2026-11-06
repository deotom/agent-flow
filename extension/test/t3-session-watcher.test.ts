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
  t.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }) })
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE projection_projects(project_id TEXT, workspace_root TEXT, deleted_at TEXT);
    INSERT INTO projection_projects VALUES('p','D:/Project/TH',NULL);
    CREATE TABLE orchestration_v2_projection_threads(thread_id TEXT,project_id TEXT,title TEXT,default_provider TEXT,worktree_path TEXT,created_at TEXT,updated_at TEXT,archived_at TEXT,deleted_at TEXT,payload_json TEXT);
    INSERT INTO orchestration_v2_projection_threads VALUES('root','p','Team','claudeAgent',NULL,'2026-11-06T01:00:00Z','2026-11-06T01:01:00Z',NULL,NULL,'{}');
    CREATE TABLE orchestration_v2_projection_subagents(subagent_id TEXT,thread_id TEXT,child_thread_id TEXT,parent_node_id TEXT,provider_thread_id TEXT,status TEXT,driver TEXT,started_at TEXT,completed_at TEXT,updated_at TEXT,payload_json TEXT);
    CREATE TABLE orchestration_v2_projection_runs(run_id TEXT,thread_id TEXT,ordinal INTEGER,status TEXT,provider_thread_id TEXT,payload_json TEXT);
    INSERT INTO orchestration_v2_projection_runs VALUES('r','root',1,'running',NULL,'{}');
    CREATE TABLE orchestration_v2_projection_provider_threads(provider_thread_id TEXT,thread_id TEXT,driver TEXT,payload_json TEXT);
    CREATE TABLE orchestration_v2_projection_runtime_requests(thread_id TEXT,status TEXT,payload_json TEXT);
    CREATE TABLE orchestration_v2_projection_nodes(node_id TEXT,thread_id TEXT,provider_thread_id TEXT,payload_json TEXT);
    CREATE TABLE orchestration_v2_projection_turn_items(turn_item_id TEXT,thread_id TEXT,run_id TEXT,provider_thread_id TEXT,type TEXT,status TEXT,payload_json TEXT);
    INSERT INTO orchestration_v2_projection_turn_items VALUES('t','root','r',NULL,'dynamic_tool','running','{"toolName":"delegate_task","output":"PRIVATE_TOOL_OUTPUT"}');`)
  const hash = () => createHash('sha256').update(fs.readFileSync(file)).update(fs.readFileSync(`${file}-wal`)).digest('hex')
  const before = hash()
  const watcher = new T3SessionWatcher(['D:/Project/TH'], file)
  t.after(() => watcher.dispose())
  const events: AgentEvent[] = [], lifecycle: string[] = []
  watcher.onEvent(event => events.push(event))
  watcher.onSessionLifecycle(event => lifecycle.push(event.type))
  watcher.poll()
  assert.equal(watcher.getActiveSessions().length, 1)
  assert.equal(events.length, 1)
  assert.equal(hash(), before, 'Read-only polling must not write the main DB or WAL')
  assert.ok(!JSON.stringify(events).includes('PRIVATE_TOOL_OUTPUT'))
  watcher.poll()
  assert.equal(events.length, 1, 'Idle polling must not duplicate graph snapshots')
  const replay: AgentEvent[] = []
  watcher.replaySessionStart(undefined, { onSnapshot: e => replay.push(e) })
  assert.equal(replay.length, 1)
  assert.equal(events.length, 1, 'Reconnect replay stays local to its recipient')
  db.exec("UPDATE orchestration_v2_projection_runs SET status='completed'; UPDATE orchestration_v2_projection_turn_items SET status='completed'")
  watcher.poll()
  assert.equal(events.length, 2)
  assert.equal(watcher.isActive(), false)
  db.exec('ALTER TABLE orchestration_v2_projection_nodes RENAME TO saved_nodes')
  watcher.poll()
  assert.match(watcher.diagnostic, /unavailable or incompatible/)
  assert.equal(watcher.getActiveSessions().length, 0, 'A stale active team must not survive a broken data source')
  assert.ok(lifecycle.includes('ended'))
  db.exec('ALTER TABLE saved_nodes RENAME TO orchestration_v2_projection_nodes')
  watcher.poll()
  assert.equal(watcher.getActiveSessions().length, 1)
  assert.equal(watcher.diagnostic, 'T3 local teams (read-only)')
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
