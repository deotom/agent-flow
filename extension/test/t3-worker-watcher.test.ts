import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Worker } from 'node:worker_threads'
import { once } from 'node:events'
import { buildSync } from 'esbuild'
import * as path from 'node:path'
import { T3WorkerWatcher } from '../src/t3-worker-watcher'

test('a blocked source poll leaves relay callbacks responsive and disposal terminates it', async t => {
  let worker: Worker | undefined
  const watcher = new T3WorkerWatcher([], undefined, () => {
    worker = new Worker(`const { parentPort } = require('node:worker_threads');
      parentPort.on('message', () => { parentPort.postMessage('reading'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0); });`, { eval: true })
    return worker
  })
  t.after(() => watcher.dispose())
  watcher.start()
  worker!.ref() // The test has no HTTP server to keep the relay host alive.
  await once(worker!, 'message')
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.equal(watcher.sourceHealth, null, 'relay can service a callback while SQLite is blocked')
  const exited = once(worker!, 'exit')
  watcher.dispose()
  watcher.dispose()
  await exited
  assert.deepEqual(watcher.getActiveSessions(), [])
})

test('forwards ordered events, caches reconnect state and reports fatal worker exit without losing teams', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let worker: Worker | undefined
  let starts = 0
  const watcher = new T3WorkerWatcher([], undefined, () => {
    starts++
    if (starts > 1) {
      worker = new Worker(`const { parentPort } = require('node:worker_threads');
        parentPort.once('message', () => parentPort.postMessage([
          {kind:'lifecycle',value:{type:'started',sessionId:'t3:a',label:'Team'}},
          {kind:'lifecycle',value:{type:'started',sessionId:'t3:b',label:'New team'}},
          {kind:'sessions',value:[{id:'t3:a',label:'Team',status:'active'},{id:'t3:b',label:'New team',status:'active'}]},
          {kind:'health',value:{source:'t3',state:'ok',checkedAt:2,lastSuccessAt:2,lastChangeAt:null,pollIntervalMs:2000,reason:null}}
        ]));
        parentPort.on('message', () => { if (++globalThis.polls > 1) parentPort.postMessage([
          {kind:'sessions',value:[]},
          {kind:'health',value:{source:'t3',state:'ok',checkedAt:2,lastSuccessAt:2,lastChangeAt:null,pollIntervalMs:2000,reason:null}}
        ]); }); globalThis.polls=0;`, { eval: true })
      return worker
    }
    worker = new Worker(`const { parentPort } = require('node:worker_threads');
      parentPort.once('message', () => parentPort.postMessage([
        { kind: 'lifecycle', value: {type:'started',sessionId:'t3:a',label:'Team'} },
        { kind: 'lifecycle', value: {type:'started',sessionId:'t3:c',label:'Old team'} },
        { kind: 'event', value: {type:'team_snapshot',time:0,sessionId:'t3:a',payload:{agents:[]}} },
        { kind: 'sessions', value: [{id:'t3:a',label:'Team',status:'active'},{id:'t3:c',label:'Old team',status:'active'}] },
        { kind: 'projects', value: [{id:'p',title:'Project',root:'D:/P',current:true}] },
        { kind: 'replies', value: [{sessionId:'t3:a',text:'Done',at:null,streaming:false}] },
        { kind: 'health', value: {source:'t3',state:'ok',checkedAt:1,lastSuccessAt:1,lastChangeAt:1,pollIntervalMs:2000,reason:null} }
      ]));`, { eval: true })
    return worker
  })
  t.after(() => watcher.dispose())
  const order: string[] = []
  const lifecycle: string[] = []
  watcher.onSessionLifecycle(value => { order.push('lifecycle'); lifecycle.push(`${value.type}:${value.sessionId}`) })
  watcher.onEvent(() => order.push('event'))
  const healthy = new Promise<void>(resolve => watcher.onSourceHealth(h => { if (h.state === 'ok') resolve() }))
  watcher.start(); watcher.start()
  worker!.ref()
  await healthy
  assert.equal(starts, 1)
  assert.deepEqual(order, ['lifecycle', 'lifecycle', 'event'])
  assert.equal(watcher.getActiveSessions()[0].id, 't3:a')
  assert.equal(watcher.projects[0].title, 'Project')
  assert.equal(watcher.replies[0].text, 'Done')
  const replay: unknown[] = []
  watcher.replaySessionStart(undefined, { onSnapshot: event => replay.push(event) })
  assert.equal(replay.length, 1)
  assert.deepEqual(order, ['lifecycle', 'lifecycle', 'event'], 'reconnect snapshots stay private')
  const failed = new Promise<void>(resolve => watcher.onSourceHealth(h => { if (h.state === 'unavailable') resolve() }))
  await worker!.terminate()
  await failed
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.equal(watcher.getActiveSessions().length, 2)
  assert.equal(starts, 1, 'fatal exit does not immediately spin up another worker')
  assert.match(watcher.diagnostic, /unavailable/)
  const recovered = new Promise<void>(resolve => watcher.onSourceHealth(h => { if (h.state === 'ok') resolve() }))
  t.mock.timers.tick(1999)
  assert.equal(starts, 1)
  t.mock.timers.tick(1)
  assert.equal(starts, 2)
  worker!.ref()
  await recovered
  assert.equal(watcher.diagnostic, 'T3 local teams (read-only)')
  assert.deepEqual(lifecycle, ['started:t3:a', 'started:t3:c', 'ended:t3:c', 'updated:t3:a', 'started:t3:b'], 'worker recreation ends missing sessions before updating retained sessions and starting new ones')
  const emptied = new Promise<void>(resolve => watcher.onSessionsChanged(sessions => { if (!sessions.length) resolve() }))
  t.mock.timers.tick(2000)
  await emptied
  assert.deepEqual(lifecycle.slice(-2), ['ended:t3:a', 'ended:t3:b'], 'a replacement baseline reconciles ended sessions')
  assert.deepEqual(watcher.getActiveSessions(), [], 'an empty recovery baseline replaces the old worker cache')
  const afterRecovery: unknown[] = []
  watcher.replaySessionStart(undefined, { onSnapshot: event => afterRecovery.push(event) })
  assert.deepEqual(afterRecovery, [], 'removed sessions do not survive in reconnect snapshots')
  watcher.dispose()
  assert.deepEqual(watcher.projects, [])
  assert.deepEqual(watcher.replies, [])
})

test('a hung poll is terminated after thirty seconds and disposal cancels watchdog and retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let worker: Worker | undefined, starts = 0
  const watcher = new T3WorkerWatcher([], undefined, () => {
    starts++
    worker = new Worker(`const { parentPort } = require('node:worker_threads');
      parentPort.on('message', () => { parentPort.postMessage('reading'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0); });`, { eval: true })
    return worker
  })
  const healthStates: string[] = []
  watcher.onSourceHealth(health => healthStates.push(health.state))
  t.after(() => watcher.dispose())
  watcher.start(); worker!.ref()
  await once(worker!, 'message')
  t.mock.timers.tick(29_999)
  assert.equal(watcher.sourceHealth, null, 'slow healthy reads get a generous allowance')
  const exited = once(worker!, 'exit')
  t.mock.timers.tick(1)
  assert.deepEqual(healthStates, ['unavailable'])
  await exited
  assert.equal(starts, 1, 'a timeout cannot immediately restart in a loop')
  watcher.dispose()
  t.mock.timers.tick(120_000)
  assert.equal(starts, 1, 'disposal cancels delayed recovery')
})

test('bundled production worker forwards missing-source health and stops cleanly', async t => {
  const bundle = buildSync({ entryPoints: [path.resolve(__dirname, '../src/t3-poll-worker.ts')],
    bundle: true, platform: 'node', format: 'cjs', write: false })
  let worker: Worker | undefined
  const rawMessages: any[] = []
  const watcher = new T3WorkerWatcher([], undefined, () => {
    worker = new Worker(bundle.outputFiles[0].text, { eval: true,
      workerData: { workspaces: [], databasePath: path.join(__dirname, `missing-${process.pid}.sqlite`) } })
    worker.on('message', value => rawMessages.push(...value))
    return worker
  })
  t.after(() => watcher.dispose())
  const health = new Promise<void>(resolve => watcher.onSourceHealth(() => resolve()))
  watcher.start(); worker!.ref()
  await health
  assert.equal(watcher.sourceHealth?.state, 'unavailable')
  assert.match(watcher.diagnostic, /not found/)
  assert.ok(rawMessages.every(message => message.kind !== 'timing'), 'default-off worker must not collect or transfer diagnostics')
  const exited = once(worker!, 'exit')
  watcher.dispose()
  await exited
})

test('recovery waits for native worker termination before starting a replacement', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let worker: Worker | undefined, starts = 0
  let release!: () => void
  let stopOriginal: (() => Promise<number>) | undefined
  const watcher = new T3WorkerWatcher([], undefined, () => {
    starts++
    worker = new Worker(`const { parentPort } = require('node:worker_threads');
      parentPort.on('message', () => { parentPort.postMessage('reading'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0); });`, { eval: true })
    if (starts === 1) {
      stopOriginal = worker.terminate.bind(worker)
      t.mock.method(worker, 'terminate', () => new Promise<number>(resolve => { release = () => resolve(0) }))
    }
    return worker
  })
  t.after(async () => { watcher.dispose(); await stopOriginal?.() })
  watcher.start(); worker!.ref()
  await once(worker!, 'message')
  t.mock.timers.tick(30_000)
  assert.equal(watcher.sourceHealth?.state, 'unavailable')
  t.mock.timers.tick(120_000)
  assert.equal(starts, 1, 'a native call delaying termination cannot accumulate replacement workers')
  await stopOriginal!()
  release()
  await new Promise<void>(resolve => setImmediate(resolve))
  t.mock.timers.tick(1999)
  assert.equal(starts, 1)
  t.mock.timers.tick(1)
  assert.equal(starts, 2, 'retry starts only after termination and its normal delay')
  watcher.dispose()
})


test('opt-in timings cross the real bundled worker boundary and observer errors cannot stop polling', async t => {
 const bundle=buildSync({entryPoints:[path.resolve(__dirname,'../src/t3-poll-worker.ts')],bundle:true,platform:'node',format:'cjs',write:false})
 let worker:Worker|undefined
 const timings:any[]=[]
 const watcher=new T3WorkerWatcher([],undefined,()=>{
  worker=new Worker(bundle.outputFiles[0].text,{eval:true,workerData:{workspaces:[],databasePath:path.join(__dirname,'private-missing.sqlite'),timing:true}})
  return worker
 },value=>{timings.push(value);throw Error('diagnostic consumer failed')})
 t.after(()=>watcher.dispose())
 const next=()=>new Promise<void>(resolve=>watcher.onSourceHealth(()=>resolve()))
 let health=next();watcher.start();worker!.ref();await health
 await new Promise<void>(resolve=>setImmediate(resolve))
 assert.equal(timings.length,1,'a requested diagnostic must be forwarded once per completed poll')
 const timing=timings[0]
 assert.deepEqual(Object.keys(timing).sort(),['closeMs','deliveryMs','finishedAt','projectMs','readMs','repliesMs','startedAt','timerLateMs','totalMs','transferMs'].sort())
 for(const number of Object.values(timing))assert.ok(typeof number==='number'&&Number.isFinite(number)&&number>=0)
 assert.ok(timing.finishedAt>=timing.startedAt)
 health=next();await health
 assert.equal(watcher.sourceHealth?.state,'unavailable','a diagnostic throw must not stop later polls')
})
