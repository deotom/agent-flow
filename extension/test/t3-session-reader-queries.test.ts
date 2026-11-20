import {test} from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {T3SessionWatcher} from '../src/t3-session-watcher'
import {projectT3Teams, type T3Projection} from '../src/t3-projection'
const {DatabaseSync}=require('node:sqlite')
test('reads referenced parent nodes only and resolves latest-run items without a per-item correlated run lookup',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'agent-flow-reader-')),file=path.join(dir,'state.sqlite'),db=new DatabaseSync(file)
 let watcher:T3SessionWatcher|undefined
 t.after(()=>{watcher?.dispose();db.close();fs.rmSync(dir,{recursive:true,force:true})})
 db.exec(`CREATE TABLE projection_projects(project_id TEXT,title TEXT,workspace_root TEXT,deleted_at TEXT,archived_at TEXT);
 INSERT INTO projection_projects VALUES('p','Project','D:/work',NULL,NULL);
 CREATE TABLE orchestration_v2_projection_threads(thread_id TEXT,project_id TEXT,title TEXT,default_provider TEXT,active_provider_thread_id TEXT,created_at TEXT,updated_at TEXT,archived_at TEXT,deleted_at TEXT,payload_json TEXT);
 INSERT INTO orchestration_v2_projection_threads VALUES('root','p','Team','codex',NULL,'2026-11-01','2026-11-16',NULL,NULL,'{}');
 CREATE TABLE orchestration_v2_projection_subagents(subagent_id TEXT,thread_id TEXT,run_id TEXT,parent_node_id TEXT,provider TEXT,provider_thread_id TEXT,child_thread_id TEXT,status TEXT,started_at TEXT,completed_at TEXT,updated_at TEXT,driver TEXT,completion_delivery_state TEXT,payload_json TEXT);
 INSERT INTO orchestration_v2_projection_subagents VALUES('task','root','old','wanted','codex','native',NULL,'completed','2026-11-01','2026-11-02','2026-11-02','codex','observed','{"role":"review"}');
 CREATE TABLE orchestration_v2_projection_runs(run_id TEXT,thread_id TEXT,ordinal INTEGER,status TEXT,provider_thread_id TEXT,completed_at TEXT,payload_json TEXT);
 INSERT INTO orchestration_v2_projection_runs VALUES('old','root',1,'running',NULL,NULL,'{}'),('new','root',2,'cancelled',NULL,'2026-11-16','{}');
 CREATE TABLE orchestration_v2_projection_provider_threads(provider_thread_id TEXT,thread_id TEXT,provider TEXT,driver TEXT,updated_at TEXT,payload_json TEXT);
 CREATE TABLE orchestration_v2_projection_runtime_requests(runtime_request_id TEXT,thread_id TEXT,node_id TEXT,kind TEXT,status TEXT,created_at TEXT,resolved_at TEXT);
 CREATE TABLE orchestration_v2_projection_nodes(node_id TEXT PRIMARY KEY,thread_id TEXT,parent_node_id TEXT,provider_thread_id TEXT,started_at TEXT,completed_at TEXT);
 INSERT INTO orchestration_v2_projection_nodes VALUES('wanted','root',NULL,NULL,NULL,NULL);
 CREATE TABLE orchestration_v2_projection_turn_items(turn_item_id TEXT,thread_id TEXT,run_id TEXT,provider_thread_id TEXT,type TEXT,status TEXT,updated_at TEXT,payload_json TEXT);
 INSERT INTO orchestration_v2_projection_turn_items VALUES('old-tool','root','old',NULL,'dynamic_tool','running','2026-11-16','{}'),('new-tool','root','new',NULL,'dynamic_tool','completed','2026-11-16','{"toolName":"archived","title":"Unused completed output"}'),('pending-tool','root','new',NULL,'dynamic_tool','running','2026-11-16','{"toolName":"inspect","title":"Current work"}');
 CREATE INDEX item_thread_run ON orchestration_v2_projection_turn_items(thread_id,run_id);
 CREATE INDEX run_thread_ordinal ON orchestration_v2_projection_runs(thread_id,ordinal);`)
 const insert=db.prepare('INSERT INTO orchestration_v2_projection_nodes VALUES(?,?,NULL,NULL,NULL,NULL)')
 db.exec('BEGIN')
 for(let i=0;i<1000;i++)insert.run(`history-${i}`,'root')
 db.exec('COMMIT')
 db.exec(`INSERT INTO orchestration_v2_projection_runs VALUES('duplicate','root',2,'completed',NULL,NULL,'{}'),('null-ordinal','root',NULL,'completed',NULL,NULL,'{}');
 INSERT INTO orchestration_v2_projection_turn_items VALUES('excluded-duplicate','root','duplicate',NULL,'dynamic_tool','running','2026-11-19','{}'),('excluded-null','root','null-ordinal',NULL,'dynamic_tool','running','2026-11-19','{}'),('completed-compaction','root','new',NULL,'compaction','completed','2026-11-17','{}')`)
 const completed=db.prepare('INSERT INTO orchestration_v2_projection_turn_items VALUES(?,?,?, ?,?,?,?,?)')
 db.exec('BEGIN')
 for(let i=0;i<1000;i++)completed.run(`completed-${i}`,'root','new',i%2?'native':null,'dynamic_tool',i%3?'completed':null,i===999?'November 18, 2026':'2026-11-17','{"output":"unused"}')
 db.exec('COMMIT')
 const observed:{sql:string;args:unknown[];rows:number;values:any[]}[]=[],original=DatabaseSync.prototype.prepare
 t.mock.method(DatabaseSync.prototype,'prepare',function(this:unknown,sql:string){
  const statement=original.call(this,sql),all=statement.all.bind(statement)
  statement.all=(...args:unknown[])=>{const rows=all(...args);observed.push({sql,args,rows:rows.length,values:rows});return rows}
  return statement
 })
 const now=Date.parse('2026-11-19T12:00:00Z');t.mock.method(Date,'now',()=>now)
 watcher=new T3SessionWatcher(null,file);watcher.poll()
 assert.equal(watcher.sourceHealth?.state,'ok')
 assert.equal(observed.find(q=>/FROM orchestration_v2_projection_nodes/.test(q.sql))?.rows,1,'unreferenced historical nodes must not enter the projection')
 const itemQuery=observed.find(q=>/FROM orchestration_v2_projection_turn_items i/.test(q.sql))!
 assert.ok(itemQuery)
 assert.ok(itemQuery.rows<10,'completed history must be summarized instead of materializing every historical tool row')
 assert.deepEqual(JSON.parse(itemQuery.values.find(row=>row.turn_item_id==='pending-tool').payload_json),{toolName:'inspect',title:'Current work'},'active tool details must remain available')
 const plan=original.call(db,'EXPLAIN QUERY PLAN '+itemQuery.sql).all(...itemQuery.args)
 assert.ok(!plan.some((row:{detail:string})=>/CORRELATED/i.test(row.detail)),'latest run is resolved once per thread, not once per tool item')
 const root=watcher.getActiveSessions()[0];assert.equal(root.status,'active','older running run still wins in the projector')
 const replay:any[]=[];watcher.replaySessionStart(undefined,{onSnapshot:e=>replay.push(e)})
 assert.equal(replay[0].payload.team.agents.find((agent:any)=>!agent.hasThread).taskRole,'review','explicit source role survives the read-only query')
 assert.equal(replay[0].payload.agents[1].toolCalls,500,'native-provider historical counts survive summarization even when latest app run is different')
 assert.equal(replay[0].payload.team.updatedAt,Date.parse('November 18, 2026'),'timestamp reduction retains Date.parse semantics rather than lexical MAX')
 // Compare against the previous unaggregated reader shape, not an aggregate
 // helper, including NULL status, native providers and compaction timestamps.
 const rows=(table:string)=>observed.find(q=>q.sql.includes(`FROM ${table}`))!.values
 const rawItems=original.call(db,`SELECT turn_item_id,thread_id,run_id,provider_thread_id,type,status,updated_at,
 CASE WHEN status IN ('running','starting','queued','pending','in_progress') THEN
 json_object('toolName',json_extract(payload_json,'$.toolName'),'title',json_extract(payload_json,'$.title')) ELSE '{}' END AS payload_json
 FROM orchestration_v2_projection_turn_items WHERE thread_id='root' AND run_id='new'
 AND type IN ('command_execution','dynamic_tool','file_change','web_search','mcp_tool_call','compaction')`).all()
 const baseline:T3Projection={projects:rows('projection_projects'),threads:rows('orchestration_v2_projection_threads'),subagents:rows('orchestration_v2_projection_subagents'),runs:rows('orchestration_v2_projection_runs'),providerThreads:rows('orchestration_v2_projection_provider_threads'),requests:rows('orchestration_v2_projection_runtime_requests'),nodes:rows('orchestration_v2_projection_nodes'),items:rawItems}
 assert.deepEqual(replay,projectT3Teams(baseline,null,now).map(team=>team.event),'aggregation preserves the complete published snapshot')
 db.exec("UPDATE orchestration_v2_projection_runs SET status='completed' WHERE run_id='old'; UPDATE orchestration_v2_projection_runs SET status='running' WHERE run_id='new'")
 watcher.poll()
 const current:any[]=[];watcher.replaySessionStart(undefined,{onSnapshot:e=>current.push(e)})
 assert.equal(current[0].payload.agents[0].toolCalls,502,'app-thread tool counts include completed summaries but exclude native providers and compactions')
 assert.deepEqual(current[0].payload.agents[0].tools,[{callId:'pending-tool',tool:'inspect',args:'Current work'}],'active details retain their original order and values')
 baseline.runs=original.call(db,'SELECT * FROM orchestration_v2_projection_runs').all()
 assert.deepEqual(current,projectT3Teams(baseline,null,now).map(team=>team.event),'current-run snapshots also remain identical')
})
