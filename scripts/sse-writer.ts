/** One accepted frame may be large; never send another until its drain. */
export interface SSESink {
 write(value:string):unknown
 writableLength?:number
 writableEnded?:boolean
 end?():unknown
 destroy?():unknown
 once?(event:string,listener:()=>void):unknown
 removeListener?(event:string,listener:()=>void):unknown
}
interface Options {maxQueuedBytes?:number;maxQueuedFrames?:number;maxFrameBytes?:number;drainTimeoutMs?:number;onDrop?:(reason:string)=>void}
interface Frame {encode:()=>string;bytes:number;key?:string}

/** Latest state is held by reference and serialized only when writable. This
 * avoids duplicating all current snapshots in every client's string backlog.
 * Native incremental JSON keeps its bounded FIFO; neither kind can grow forever. */
export class SSEWriter {
 private queue:Frame[]=[]
 private latest=new Map<string,Frame>()
 private queuedBytes=0
 private waiting=false
 private closed=false
 private timer?:ReturnType<typeof setTimeout>
 private flushing=false
 private readonly onClose=()=>this.dispose()
 private readonly onError=()=>this.drop('stream-error')
 private readonly onDrain=()=>{this.clearDrain();this.flush()}
 constructor(private readonly sink:SSESink,private readonly options:Options={}){
  sink.once?.('close',this.onClose);sink.once?.('error',this.onError)
 }
 get stats(){return {queuedFrames:this.queue.length,queuedBytes:this.queuedBytes,blocked:this.waiting,closed:this.closed}}
 sendData(data:string,key?:string):void {
  this.enqueue({encode:()=>data,bytes:key?0:Buffer.byteLength(data)+8,key})
 }
 sendValue(value:unknown,key?:string):void {
  this.enqueue({encode:()=>JSON.stringify(value)??'null',bytes:0,key})
 }
 private enqueue(frame:Frame):void {
  if(this.closed)return
  if(this.sink.writableEnded){this.dispose();return}
  const existing=frame.key?this.latest.get(frame.key):undefined
  if(existing){this.queuedBytes-=existing.bytes;existing.encode=frame.encode;existing.bytes=frame.bytes}
  else{this.queue.push(frame);if(frame.key)this.latest.set(frame.key,frame)}
  this.queuedBytes+=frame.bytes
  this.flush()
  // Small native events should reach the byte budget before a tight count cap.
  if(!this.closed&&(this.queuedBytes>(this.options.maxQueuedBytes??4*1024*1024)||this.queue.length>(this.options.maxQueuedFrames??16_384)))this.drop('queue-limit')
 }
 private flush():void {
  if(this.closed||this.waiting||this.flushing)return
  this.flushing=true
  try{
   // This detects unmanaged/pre-existing backlog, not the one large frame our
   // own pump just accepted. A valid write(false) always enters the drain path.
   if((this.sink.writableLength??0)>(this.options.maxQueuedBytes??4*1024*1024)){this.drop('preexisting-buffer');return}
   while(this.queue.length&&!this.closed){
    if(this.sink.writableEnded){this.dispose();return}
    const frame=this.queue.shift()!;this.queuedBytes-=frame.bytes
    if(frame.key)this.latest.delete(frame.key)
    let wire:string
    try{wire=`data: ${frame.encode()}\n\n`}catch{this.drop('serialize-failed');return}
    if(Buffer.byteLength(wire)>(this.options.maxFrameBytes??32*1024*1024)){this.drop('frame-limit');return}
    let accepted:unknown
    try{accepted=this.sink.write(wire)}catch{this.drop('write-failed');return}
    if(this.closed||this.sink.writableEnded){this.dispose();return}
    if(accepted===false){
     this.waiting=true;this.sink.once?.('drain',this.onDrain)
     this.timer=setTimeout(()=>this.drop('drain-timeout'),this.options.drainTimeoutMs??15_000)
     this.timer.unref?.();return
    }
    if((this.sink.writableLength??0)>(this.options.maxQueuedBytes??4*1024*1024)){this.drop('invalid-backpressure');return}
   }
  }finally{this.flushing=false}
 }
 private clearDrain():void {
  this.waiting=false;clearTimeout(this.timer);this.timer=undefined
  this.sink.removeListener?.('drain',this.onDrain)
 }
 dispose():void {
  if(this.closed)return
  this.closed=true;this.clearDrain();this.queue.length=0;this.latest.clear();this.queuedBytes=0
  this.sink.removeListener?.('close',this.onClose);this.sink.removeListener?.('error',this.onError)
 }
 private drop(reason:string):void {
  if(this.closed)return
  this.dispose()
  try{this.options.onDrop?.(reason)}catch{/* A failed observer cannot break other clients. */}
  try{if(this.sink.destroy)this.sink.destroy();else this.sink.end?.()}catch{/* Already closed. */}
 }
}
