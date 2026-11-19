import {test} from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import * as http from 'node:http'
import {SSEWriter} from './sse-writer'

class Sink extends EventEmitter {
 writableLength=0;writableEnded=false;blocked=true;writes:string[]=[];ended=0
 write(value:string){this.writes.push(value);this.writableLength=this.blocked?this.writableLength+Buffer.byteLength(value):0;return !this.blocked}
 end(){this.ended++;this.writableEnded=true;this.emit('close')}
 destroy(){this.end()}
 drain(){this.blocked=false;this.writableLength=0;this.emit('drain')}
}
test('does not strand an accepted frame when drain is synchronous or already empty',()=>{
 for(const emitDrain of [true,false]){
  const sink=new Sink();sink.write=value=>{sink.writes.push(value);sink.writableLength=0;if(emitDrain)sink.emit('drain');return false}
  const writer=new SSEWriter(sink)
  writer.sendData('first');writer.sendData('second')
  assert.deepEqual(sink.writes,['data: first\n\n','data: second\n\n'])
  assert.equal(writer.stats.blocked,false)
  assert.equal(sink.listenerCount('drain'),0)
  writer.dispose()
 }
})
test('resumes after an accepted write callback completes even if HTTP omits drain',async()=>{
 const sink=new Sink();let finished!:()=>void,callbacks=0
 const done=new Promise<void>(resolve=>{finished=resolve})
 sink.write=(value:string,callback?:(error?:Error|null)=>void)=>{
  sink.writes.push(value);sink.writableLength=1
  setImmediate(()=>{callback?.();sink.writableLength=0;if(++callbacks===2)finished()})
  return false
 }
 const writer=new SSEWriter(sink),timer=setTimeout(()=>finished(),300)
 try{
  writer.sendData('first');writer.sendData('second');await done
  await new Promise<void>(resolve=>setImmediate(resolve))
  assert.equal(callbacks,2,'accepted callbacks must release the stalled pump without resending')
  assert.deepEqual(sink.writes,['data: first\n\n','data: second\n\n'])
  assert.equal(writer.stats.blocked,false)
 }finally{clearTimeout(timer);writer.dispose()}
})
test('real HTTP drains a cold mixed-size baseline through repeated low-watermark transitions',async()=>{
 let writer:SSEWriter|undefined
 const reasons:string[]=[]
 const server=http.createServer({highWaterMark:16*1024},(_req,res)=>{
  res.writeHead(200,{'Content-Type':'text/event-stream'})
  writer=new SSEWriter(res,{drainTimeoutMs:200,onDrop:reason=>reasons.push(reason)})
  // An async source completes after the HTTP handler; its large first frame is
  // followed by enough small lifecycle/state frames to cross another watermark.
  setImmediate(()=>{
   writer!.sendValue({i:-1,padding:'x'.repeat(1024*1024)})
   for(let i=0;i<100;i++)writer!.sendValue({i,padding:'x'.repeat(400)})
   writer!.sendValue({final:true})
  })
 })
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
 try{
  const count=await new Promise<number>((resolve,reject)=>{
   let text='',count=0
   const request=http.get(`http://127.0.0.1:${(server.address() as {port:number}).port}`,res=>{
    res.setEncoding('utf8');res.on('data',chunk=>{text+=chunk;let end:number;while((end=text.indexOf('\n\n'))>=0){const message=JSON.parse(text.slice(6,end));text=text.slice(end+2);if(message.final){clearTimeout(timer);resolve(count);request.destroy()}else count++}})
    res.on('error',error=>{clearTimeout(timer);reject(error)})
    res.on('end',()=>{clearTimeout(timer);reject(Error('Cold stream ended early'))})
   })
   const timer=setTimeout(()=>{request.destroy();reject(Error('Cold stream deadline'))},2000)
   request.on('error',error=>{clearTimeout(timer);reject(error)})
  })
  assert.equal(count,101);assert.deepEqual(reasons,[])
 }finally{writer?.dispose();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}
})
test('accepts each frame once and waits for drain, including a current-state replay larger than 4 MiB',()=>{
 const sink=new Sink(),writer=new SSEWriter(sink)
 writer.sendValue({type:'source-health'},'health')
 let encodes=0
 for(let i=0;i<6;i++)writer.sendValue({get padding(){encodes++;return 'x'.repeat(1024*1024)}},`team:${i}`)
 assert.equal(sink.writes.length,1);assert.equal(encodes,0)
 assert.equal(writer.stats.queuedFrames,6)
 sink.drain()
 assert.equal(sink.writes.length,7);assert.equal(encodes,6);assert.equal(sink.ended,0)
 writer.dispose()
})
test('keeps only the newest queued team state without serializing replaced snapshots',()=>{
 const sink=new Sink(),writer=new SSEWriter(sink);writer.sendData('{}')
 let encodes=0
 for(let i=0;i<100;i++)writer.sendValue({get revision(){encodes++;return i}},'team:a')
 assert.equal(writer.stats.queuedFrames,1);assert.equal(encodes,0)
 sink.drain();assert.equal(encodes,1);assert.ok(sink.writes[1].includes('99'));writer.dispose()
})
test('interleaved T3 sessions retain their own latest state and cannot replace another team',()=>{
 const sink=new Sink(),writer=new SSEWriter(sink);writer.sendData('{}')
 const expected=new Map<string,number>()
 for(let revision=0;revision<12;revision++)for(const id of ['t3:a','t3:b','t3:c']){
  const value=revision+(id==='t3:b'?100:0);expected.set(id,value)
  writer.sendValue({type:'agent-event',event:{sessionId:id,payload:{team:{sessionId:id,revision:value}}}},`team:${id}`)
 }
 assert.equal(writer.stats.queuedFrames,3);sink.drain()
 const actual=new Map(sink.writes.slice(1).map(wire=>{const message=JSON.parse(wire.slice(6));assert.equal(message.event.sessionId,message.event.payload.team.sessionId);return [message.event.sessionId,message.event.payload.team.revision]}))
 assert.deepEqual(actual,expected);writer.dispose()
})
test('bounds native FIFO and state-key counts while a healthy peer keeps receiving',()=>{
 const slow=new Sink(),healthy=new Sink();healthy.blocked=false
 const reasons:string[]=[],a=new SSEWriter(slow,{maxQueuedBytes:32,onDrop:r=>reasons.push(r)}),b=new SSEWriter(healthy)
 a.sendData('{}')
 for(const value of ['one','two','x'.repeat(40)]){a.sendData(value);b.sendData(value)}
 assert.equal(slow.ended,1);assert.deepEqual(reasons,['queue-limit']);assert.equal(a.stats.queuedFrames,0)
 assert.equal(healthy.writes.length,3);assert.equal(healthy.ended,0)
 const limited=new SSEWriter(new Sink(),{maxQueuedFrames:2});limited.sendData('{}')
 for(let i=0;i<3;i++)limited.sendValue({i},`team:${i}`)
 assert.equal(limited.stats.closed,true);b.dispose()
})
test('close and error release pending values, drain listeners and timers',()=>{
 for(const event of ['close','error']){
  const sink=new Sink(),writer=new SSEWriter(sink);writer.sendData('{}');writer.sendValue({text:'pending'},'team:a')
  sink.emit(event)
  assert.equal(writer.stats.closed,true);assert.equal(writer.stats.queuedFrames,0)
  assert.equal(sink.listenerCount('drain'),0);assert.equal(sink.listenerCount('close'),0);assert.equal(sink.listenerCount('error'),0)
 }
})
test('a large T3 replay can drain ahead of thousands of small native events without losing FIFO order',()=>{
 const sink=new Sink(),writer=new SSEWriter(sink)
 writer.sendValue({type:'snapshot',padding:'x'.repeat(2*1024*1024)},'team:a')
 writer.sendValue({type:'snapshot',revision:1},'team:b')
 for(let i=0;i<4000;i++)writer.sendData(JSON.stringify({type:'agent-event',i}))
 assert.equal(writer.stats.closed,false)
 sink.drain()
 assert.equal(sink.ended,0);assert.equal(sink.writes.length,4002)
 assert.deepEqual(sink.writes.slice(2).map(wire=>JSON.parse(wire.slice(6)).i),Array.from({length:4000},(_,i)=>i))
 writer.dispose()
})
test('a close during write cannot register a late drain listener',()=>{
 const sink=new Sink();sink.write=()=>{sink.end();return false}
 const writer=new SSEWriter(sink);writer.sendData('{}')
 assert.equal(writer.stats.closed,true);assert.equal(sink.listenerCount('drain'),0)
})
test('times out only a stalled client and rejects a single frame beyond its explicit budget',async()=>{
 const sink=new Sink(),reasons:string[]=[],writer=new SSEWriter(sink,{drainTimeoutMs:10,onDrop:r=>reasons.push(r)})
 writer.sendData('{}');await new Promise(resolve=>setTimeout(resolve,30))
 assert.deepEqual(reasons,['drain-timeout']);assert.equal(sink.ended,1)
 const large=new Sink(),tooLarge=new SSEWriter(large,{maxFrameBytes:64});tooLarge.sendData('x'.repeat(100))
 assert.equal(large.writes.length,0);assert.equal(large.ended,1)
})
test('real HTTP receives all large replay frames and a subsequent live frame without a server close',async()=>{
 let writer:SSEWriter|undefined,serverEnded=false
 const server=http.createServer((_req,res)=>{
  res.writeHead(200,{'Content-Type':'text/event-stream'});writer=new SSEWriter(res)
  for(let i=0;i<6;i++)writer.sendValue({type:'snapshot',i,padding:'x'.repeat(1024*1024)},`team:${i}`)
  writer.sendValue({type:'source-health'},'health')
  res.on('finish',()=>{serverEnded=true})
 })
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
 const port=(server.address() as {port:number}).port
 try{
  const received=await new Promise<number[]>((resolve,reject)=>{
   const seen:number[]=[],request=http.get(`http://127.0.0.1:${port}/events`,res=>{
    let text='';res.setEncoding('utf8')
    res.on('data',chunk=>{text+=chunk;let end:number;while((end=text.indexOf('\n\n'))>=0){const frame=JSON.parse(text.slice(6,end));text=text.slice(end+2);if(frame.type==='snapshot')seen.push(frame.i);else if(frame.type==='source-health'){clearTimeout(timer);resolve(seen);request.destroy()}}})
    res.on('end',()=>reject(Error('SSE ended before live health arrived')))
   })
   const timer=setTimeout(()=>{request.destroy();reject(Error('SSE test deadline'))},3000)
   request.on('error',error=>{clearTimeout(timer);reject(error)})
  })
  assert.deepEqual(received,[0,1,2,3,4,5]);assert.equal(serverEnded,false)
 }finally{writer?.dispose();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}
})
test('multiple HTTP clients and a reconnect each receive all sessions and their latest revisions',async()=>{
 const writers:SSEWriter[]=[],padding='x'.repeat(768*1024)
 let revision=0
 const server=http.createServer((_req,res)=>{
  res.writeHead(200,{'Content-Type':'text/event-stream'})
  const writer=new SSEWriter(res);writers.push(writer)
  for(let pass=0;pass<2;pass++)for(let i=0;i<8;i++){
   const id=`t3:${i}`
   writer.sendValue({type:'agent-event',event:{type:'session_snapshot',sessionId:id,payload:{source:'t3',team:{sessionId:id,revision:revision+pass,padding}}}},`team:${id}`)
  }
  writer.sendValue({type:'source-health',final:true},'health')
 })
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
 const port=(server.address() as {port:number}).port
 const read=(pause:boolean)=>new Promise<Map<string,number>>((resolve,reject)=>{
  const latest=new Map<string,number>()
  const request=http.get(`http://127.0.0.1:${port}/events`,res=>{
   if(pause){res.pause();setTimeout(()=>res.resume(),40)}
   let text='';res.setEncoding('utf8')
   res.on('data',chunk=>{text+=chunk;let end:number;while((end=text.indexOf('\n\n'))>=0){const message=JSON.parse(text.slice(6,end));text=text.slice(end+2)
    if(message.event){assert.equal(message.event.sessionId,message.event.payload.team.sessionId);latest.set(message.event.sessionId,message.event.payload.team.revision)}
    else if(message.final){clearTimeout(timer);resolve(latest);request.destroy()}
   }})
   res.on('end',()=>reject(Error('Stream ended before latest state')))
  })
  const timer=setTimeout(()=>{request.destroy();reject(Error('Multi-client deadline'))},5000)
  request.on('error',error=>{clearTimeout(timer);reject(error)})
 })
 try{
  const results=await Promise.all([read(false),read(false),read(true)])
  for(const result of results){assert.equal(result.size,8);assert.ok([...result.values()].every(value=>value===1))}
  revision=2
  const reconnected=await read(false)
  assert.equal(reconnected.size,8);assert.ok([...reconnected.values()].every(value=>value===3))
 }finally{for(const writer of writers)writer.dispose();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}
})
