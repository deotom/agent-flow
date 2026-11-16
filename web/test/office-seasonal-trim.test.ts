import {it} from 'node:test'
import assert from 'node:assert/strict'
import {drawOfficeSeasonalRooms} from '../components/agent-visualizer/office/office-seasonal-art'
import type {OfficeScene} from '../lib/office-types'
it('adds broad clipped seasonal wall trim to every workroom and private room without repainting project themes',()=>{
  const scene:OfficeScene={width:450,height:900,actors:[],quietTeams:[],totalAgents:0,finishedCount:0,floors:[{id:'work',kind:'team',sessionId:'s',title:'Work',subtitle:'',color:'#a44422',y:250,height:250,actorKeys:[]},{id:'private-z',kind:'break',annexOf:'work',sessionId:'s',title:'Private',subtitle:'',color:'#336655',y:500,height:250,actorKeys:[]}]}
  const all:string[]=[]
  for(const month of [3,6,10]){
    let clips=0
    const broad:{x:number;y:number;w:number;h:number;color:unknown}[]=[]
    const state:Record<string,unknown>={}
    const c=new Proxy(state,{get(t,k){if(k in t)return t[String(k)];return (...a:number[])=>{if(k==='clip')clips++;if(k==='fillRect'&&a[2]>200)broad.push({x:a[0],y:a[1],w:a[2],h:a[3],color:t.fillStyle})}},set(t,k,v){t[String(k)]=v;return true}})
    const before=JSON.stringify(scene)
    drawOfficeSeasonalRooms(c as unknown as CanvasRenderingContext2D,scene,new Date(2026,month,9,12),0)
    assert.equal(clips,2)
    assert.equal(broad.length,2,'each room gets a thin ceiling trim beyond the shelf')
    assert.equal(broad[0].color,broad[1].color,'private trim uses its parent team palette')
    assert.ok(broad.every(r=>r.h<=5&&r.x>=450*.025&&r.x+r.w<=450*.875))
    assert.equal(JSON.stringify(scene),before)
    all.push(JSON.stringify(broad))
  }
  assert.equal(new Set(all).size,3)
})
