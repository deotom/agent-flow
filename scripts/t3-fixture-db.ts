import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const T3_HOME = path.resolve(os.homedir(), '.t3')

function folded(value: string): string {
  const resolved = path.resolve(value).replace(/[\\/]+$/, '')
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

export function assertFixturePath(target: string): string {
  if (!target) throw new Error('A fixture database path is required.')
  const resolved = path.resolve(target)
  const home = folded(T3_HOME), candidate = folded(resolved)
  let canonical = candidate, canonicalHome = home
  try { canonical = folded(path.join(fs.realpathSync.native(path.dirname(resolved)), path.basename(resolved))) } catch {}
  try { canonicalHome = folded(fs.realpathSync.native(T3_HOME)) } catch {}
  if (candidate === home || candidate.startsWith(`${home}${path.sep}`)
    || canonical === canonicalHome || canonical.startsWith(`${canonicalHome}${path.sep}`)) {
    throw new Error('Refusing to create or mutate a fixture under the T3 data directory.')
  }
  return resolved
}

const schemas = [
  `CREATE TABLE projection_projects(project_id TEXT PRIMARY KEY,title TEXT NOT NULL,workspace_root TEXT NOT NULL,scripts_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT,default_model_selection_json TEXT,default_thread_env_mode TEXT,favicon_path TEXT,auto_pull INTEGER NOT NULL DEFAULT 0,project_icon_json TEXT,pinned_at TEXT,archived_at TEXT)`,
  `CREATE TABLE orchestration_v2_projection_threads(thread_id TEXT PRIMARY KEY,project_id TEXT NOT NULL,title TEXT NOT NULL,default_provider TEXT NOT NULL,runtime_mode TEXT NOT NULL,interaction_mode TEXT NOT NULL,active_provider_thread_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,archived_at TEXT,deleted_at TEXT,payload_json TEXT NOT NULL,provider_instance_id TEXT)`,
  `CREATE TABLE orchestration_v2_projection_subagents(subagent_id TEXT PRIMARY KEY,thread_id TEXT NOT NULL,run_id TEXT,parent_node_id TEXT NOT NULL,provider TEXT NOT NULL,provider_thread_id TEXT,child_thread_id TEXT,origin TEXT NOT NULL,status TEXT NOT NULL,started_at TEXT,completed_at TEXT,updated_at TEXT NOT NULL,payload_json TEXT NOT NULL,driver TEXT,provider_instance_id TEXT,completion_delivery_state TEXT)`,
  `CREATE TABLE orchestration_v2_projection_runs(run_id TEXT PRIMARY KEY,thread_id TEXT NOT NULL,ordinal INTEGER NOT NULL,provider TEXT NOT NULL,provider_thread_id TEXT,status TEXT NOT NULL,requested_at TEXT NOT NULL,completed_at TEXT,payload_json TEXT NOT NULL,provider_instance_id TEXT)`,
  `CREATE TABLE orchestration_v2_projection_provider_threads(provider_thread_id TEXT PRIMARY KEY,thread_id TEXT,owner_node_id TEXT,provider TEXT NOT NULL,provider_session_id TEXT,status TEXT NOT NULL,first_run_ordinal INTEGER,last_run_ordinal INTEGER,updated_at TEXT NOT NULL,payload_json TEXT NOT NULL,driver TEXT,provider_instance_id TEXT)`,
  `CREATE TABLE orchestration_v2_projection_runtime_requests(runtime_request_id TEXT PRIMARY KEY,thread_id TEXT NOT NULL,node_id TEXT NOT NULL,provider_turn_id TEXT,kind TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,resolved_at TEXT,payload_json TEXT NOT NULL)`,
  `CREATE TABLE orchestration_v2_projection_nodes(node_id TEXT PRIMARY KEY,thread_id TEXT NOT NULL,run_id TEXT,parent_node_id TEXT,root_node_id TEXT NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL,provider_thread_id TEXT,provider_turn_id TEXT,runtime_request_id TEXT,checkpoint_scope_id TEXT,started_at TEXT,completed_at TEXT,payload_json TEXT NOT NULL)`,
  `CREATE TABLE orchestration_v2_projection_turn_items(turn_item_id TEXT PRIMARY KEY,thread_id TEXT NOT NULL,run_id TEXT,node_id TEXT,provider_thread_id TEXT,provider_turn_id TEXT,parent_item_id TEXT,ordinal INTEGER NOT NULL,type TEXT NOT NULL,status TEXT NOT NULL,updated_at TEXT NOT NULL,payload_json TEXT NOT NULL)`,
]

export function createT3Fixture(target: string): string {
  const file = assertFixturePath(target)
  if (fs.existsSync(file)) throw new Error('Refusing to overwrite an existing fixture database.')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite')
  const db = new DatabaseSync(file)
  try {
    db.exec(schemas.join(';'))
    const now = '2026-11-08T03:00:00.000Z', later = '2026-11-08T03:05:00.000Z'
    db.prepare(`INSERT INTO projection_projects(project_id,title,workspace_root,scripts_json,created_at,updated_at) VALUES(?,?,?,?,?,?)`)
      .run('fixture-project', 'Agent Flow fixture', process.cwd(), '{}', now, later)
    const thread = db.prepare(`INSERT INTO orchestration_v2_projection_threads(thread_id,project_id,title,default_provider,runtime_mode,interaction_mode,active_provider_thread_id,created_at,updated_at,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?)`)
    thread.run('solo', 'fixture-project', 'Solo lead', 'claudeAgent', 'local', 'default', 'pt-solo', now, later, '{}')
    thread.run('team', 'fixture-project', 'Parallel team', 'claudeAgent', 'local', 'default', 'pt-team', now, later, '{}')
    thread.run('worker-codex', 'fixture-project', 'Codex worker', 'codex', 'local', 'default', 'pt-codex', now, later, JSON.stringify({ lineage: { parentThreadId: 'team', relationshipToParent: 'subagent' } }))
    thread.run('worker-context', 'fixture-project', 'Claude context worker', 'claudeAgent', 'local', 'default', 'pt-context', now, later, JSON.stringify({ lineage: { parentThreadId: 'team', relationshipToParent: 'subagent' } }))
    thread.run('worker-long', 'fixture-project', `Worker ${'with a deliberately long uncapped display name '.repeat(4)}`, 'codex', 'local', 'default', 'pt-long', now, later, JSON.stringify({ lineage: { parentThreadId: 'team', relationshipToParent: 'subagent' } }))
    thread.run('nested', 'fixture-project', 'Nested sub-worker', 'codex', 'local', 'default', 'pt-nested', now, later, JSON.stringify({ lineage: { parentThreadId: 'worker-context', relationshipToParent: 'subagent' } }))

    const run = db.prepare(`INSERT INTO orchestration_v2_projection_runs(run_id,thread_id,ordinal,provider,provider_thread_id,status,requested_at,completed_at,payload_json) VALUES(?,?,?,?,?,?,?,?,?)`)
    run.run('run-team', 'team', 1, 'claude', 'pt-team', 'running', now, null, '{}')
    run.run('run-codex', 'worker-codex', 1, 'codex', 'pt-codex', 'completed', now, later, '{}')
    run.run('run-context', 'worker-context', 1, 'claude', 'pt-context', 'completed', now, later, '{}')
    run.run('run-long', 'worker-long', 1, 'codex', 'pt-long', 'running', now, null, '{}')
    run.run('run-nested', 'nested', 1, 'codex', 'pt-nested', 'running', now, null, '{}')

    const provider = db.prepare(`INSERT INTO orchestration_v2_projection_provider_threads(provider_thread_id,thread_id,provider,status,first_run_ordinal,last_run_ordinal,updated_at,payload_json,driver) VALUES(?,?,?,?,?,?,?,?,?)`)
    provider.run('pt-solo', 'solo', 'claude', 'idle', 1, 1, later, '{}', 'claudeAgent')
    provider.run('pt-team', 'team', 'claude', 'running', 1, 1, later, '{}', 'claudeAgent')
    provider.run('pt-codex', 'worker-codex', 'codex', 'completed', 1, 1, later, '{}', 'codex')
    provider.run('pt-context', 'worker-context', 'claude', 'completed', 1, 1, later, JSON.stringify({ contextUsage: { usedTokens: 42000, maxTokens: 200000 } }), 'claudeAgent')
    provider.run('pt-long', 'worker-long', 'codex', 'running', 1, 1, later, '{}', 'codex')
    provider.run('pt-nested', 'nested', 'codex', 'running', 1, 1, later, '{}', 'codex')

    const node = db.prepare(`INSERT INTO orchestration_v2_projection_nodes(node_id,thread_id,run_id,parent_node_id,root_node_id,kind,status,provider_thread_id,started_at,completed_at,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    node.run('node-team', 'team', 'run-team', null, 'node-team', 'lead', 'running', 'pt-team', now, null, '{}')
    node.run('node-context', 'worker-context', 'run-context', 'node-team', 'node-team', 'subagent', 'completed', 'pt-context', now, later, '{}')

    const subagent = db.prepare(`INSERT INTO orchestration_v2_projection_subagents(subagent_id,thread_id,run_id,parent_node_id,provider,provider_thread_id,child_thread_id,origin,status,started_at,completed_at,updated_at,payload_json,driver,completion_delivery_state) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    const taskPayload = (title: string, model: string, result?: string, observedByRunId?: string) => JSON.stringify({ title, model, prompt: `Synthetic task for ${title}`, result, completionDelivery: observedByRunId ? { observedByRunId } : {} })
    subagent.run('sa-delivered', 'team', 'run-team', 'node-team', 'codex', 'pt-codex', 'worker-codex', 'delegation', 'completed', now, later, later, taskPayload('Codex worker', 'gpt-fixture', 'Delivered result'), 'codex', 'delivered')
    subagent.run('sa-ack', 'team', 'run-team', 'node-team', 'claude', 'pt-context', 'worker-context', 'delegation', 'completed', now, later, later, taskPayload('Claude context worker', 'claude-fixture', 'Acknowledged result', 'run-team'), 'claudeAgent', 'acknowledged')
    subagent.run('sa-long', 'team', 'run-team', 'node-team', 'codex', 'pt-long', 'worker-long', 'delegation', 'running', now, null, later, taskPayload(`Worker ${'with a deliberately long uncapped display name '.repeat(4)}`, 'gpt-fixture'), 'codex', 'pending')
    subagent.run('sa-nested', 'worker-context', 'run-context', 'node-context', 'codex', 'pt-nested', 'nested', 'delegation', 'running', now, null, later, taskPayload('Nested sub-worker', 'gpt-fixture'), 'codex', 'claimed')
    subagent.run('sa-disposed', 'team', 'run-team', 'node-team', 'claude', null, null, 'delegation', 'completed', now, later, later, taskPayload('Disposed native worker', 'claude-fixture', 'Discarded result'), 'claudeAgent', 'disposed')
    subagent.run('sa-failed', 'team', 'run-team', 'node-team', 'codex', null, null, 'delegation', 'failed', now, later, later, taskPayload('Failed native worker', 'gpt-fixture', 'Synthetic failure'), 'codex', null)

    db.prepare(`INSERT INTO orchestration_v2_projection_turn_items(turn_item_id,thread_id,run_id,node_id,provider_thread_id,ordinal,type,status,updated_at,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .run('item-unknown', 'worker-long', 'run-long', null, 'pt-long', 1, 'dynamic_tool', 'running', later, JSON.stringify({ toolName: 'fixture_unknown_tool', title: 'Synthetic unknown tool' }))
    db.prepare(`INSERT INTO orchestration_v2_projection_runtime_requests(runtime_request_id,thread_id,node_id,kind,status,created_at,payload_json) VALUES(?,?,?,?,?,?,?)`)
      .run('request-approval', 'worker-long', 'node-team', 'approval', 'open', later, '{}')
  } finally { db.close() }
  return file
}

export function advanceT3Fixture(target: string): void {
  const file = assertFixturePath(target)
  if (!fs.existsSync(file)) throw new Error('Fixture database does not exist.')
  const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite')
  const db = new DatabaseSync(file)
  try {
    const changed = new Date().toISOString()
    db.prepare(`UPDATE orchestration_v2_projection_runtime_requests SET status='resolved', resolved_at=? WHERE runtime_request_id='request-approval'`).run(changed)
    db.prepare(`UPDATE orchestration_v2_projection_runs SET status='completed', completed_at=? WHERE run_id IN ('run-long','run-nested')`).run(changed)
    db.prepare(`UPDATE orchestration_v2_projection_turn_items SET status='completed', updated_at=? WHERE turn_item_id='item-unknown'`).run(changed)
    db.prepare(`UPDATE orchestration_v2_projection_subagents SET status='completed', completed_at=?, updated_at=?, completion_delivery_state='delivered' WHERE subagent_id IN ('sa-long','sa-nested')`).run(changed, changed)
    db.prepare(`UPDATE orchestration_v2_projection_threads SET updated_at=? WHERE thread_id IN ('team','worker-long','nested')`).run(changed)
  } finally { db.close() }
}

if (require.main === module) {
  const mutate = process.argv.includes('--advance')
  const target = process.argv.slice(2).find(arg => arg !== '--advance') || ''
  try {
    if (mutate) advanceT3Fixture(target)
    else createT3Fixture(target)
    console.log(mutate ? 'Advanced T3 fixture.' : 'Created T3 fixture.')
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unable to create T3 fixture.')
    process.exitCode = 1
  }
}
