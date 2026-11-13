import type { OfficeAppearance, OfficeEvent, OfficeScene, OfficeActor, OfficeFloor } from './office-types'
import type { TeamAgentRow, TeamSnapshot } from './team-types'
import { buildTeamView, describeActivity, isWorking, type TeamScope } from './team-model'

export const officeKey = (sessionId: string, agentId: string): string => JSON.stringify([sessionId, agentId])

export function assignOfficeIdentities(keys: readonly string[], previous: ReadonlyMap<string, number> = new Map()): Map<string, number> {
  const result = new Map<string, number>(), used = new Set<number>()
  const allKeys = [...new Set([...previous.keys(), ...keys])].sort()
  // Keep valid persisted claims in key order so corrupt duplicate slots resolve consistently.
  for (const key of allKeys) {
    const slot = previous.get(key)
    if (Number.isSafeInteger(slot) && slot! >= 0 && !used.has(slot!)) { result.set(key, slot!); used.add(slot!) }
  }
  let next = 0
  for (const key of allKeys) if (!result.has(key)) {
    while (used.has(next)) next++
    result.set(key, next); used.add(next++)
  }
  return result
}

const looks: OfficeAppearance[] = ['#613b28','#292124','#a54f29','#d6aa59','#453126','#713d36','#252e39'].map((hair, slot) => ({
  slot, kind: 'human', hair, skin: ['#f2c6a0','#bb805c','#dfaa82','#f6d5b5'][slot % 4],
  shirt: ['#df8845','#7a9b61','#648fa7','#ac7197','#e4bb66','#637a9b','#bc6d58'][slot], pants: '#485264',
  cut: ['bun','crop','bob','curly','ponytail','spike','long'][slot], gear: slot % 3 === 0 ? 'glasses' : '',
}))
export function officeAppearance(slot: number): OfficeAppearance {
  const safe = Number.isSafeInteger(slot) && slot >= 0 ? slot : 0
  const base = looks[safe % looks.length]
  return { ...base, slot: safe, ...(safe >= 7 ? { shirt: `hsl(${safe * 137.508 % 360} 42% 57%)` } : {}) }
}

const activeInOffice = (agent: TeamAgentRow) => isWorking(agent.status) || agent.status === 'waiting_approval' || agent.status === 'waiting_input'
function quiet(snapshot: TeamSnapshot): boolean {
  return !snapshot.agents.some(a => activeInOffice(a) || a.status === 'failed')
}
const floorColors = ['#f3a45b', '#66bd83', '#6da9d8', '#b18ad0', '#d6ae52', '#c57b83', '#5db7ad']
const runtimeNames = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini', copilot: 'Copilot', cursor: 'Cursor' }
const teamColor = (id: string) => floorColors[[...id].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7) % floorColors.length]

// Coordinates measured against the supplied source artwork, as fractions of its full bounds.
export const OFFICE_SLOTS = {
  'room-a': { chairs: [[.19,.68],[.365,.68],[.595,.68],[.783,.68]], monitors: [[.223,.48],[.394,.48],[.624,.48],[.807,.48]], aspect: 864/1536 },
  'room-b-lead': { chairs: [[.31,.69],[.542,.69],[.682,.69],[.84,.69]], monitors: [[.287,.425],[.54,.465],[.685,.465],[.833,.465]], aspect: 864/1536 },
  'room-c-big': { chairs: [[.162,.55],[.378,.55],[.601,.55],[.815,.55],[.148,.765],[.375,.765],[.603,.765],[.826,.765]], monitors: [[.172,.421],[.386,.421],[.602,.421],[.815,.421],[.153,.622],[.382,.622],[.607,.622],[.832,.622]], aspect: 1 },
} as const
export const LOUNGE_CAP = 4
export function buildOfficeScene(snapshots: readonly TeamSnapshot[], scope: TeamScope, showQuiet: boolean, identities: ReadonlyMap<string, number>, width = 450): OfficeScene {
  const priority = (s: TeamSnapshot) => s.agents.some(a => a.status.startsWith('waiting_')) ? 0 : quiet(s) ? 2 : 1
  const sorted = [...new Map(snapshots.map(s => [s.sessionId, s])).values()].sort((a,b) => priority(a)-priority(b) || a.sessionId.localeCompare(b.sessionId))
  const quietTeams = sorted.filter(quiet), floors: OfficeFloor[] = [], actors: OfficeActor[] = [], resting: OfficeActor[] = []
  const surfaceHeight = width * 864/1536
  const lounge: OfficeFloor = { id:'lounge', sessionId:null, title:'Surface lounge', subtitle:'', color:'#a88b70', y:0, height:surfaceHeight, actorKeys:[], kind:'lounge' }
  floors.push(lounge)
  let y = surfaceHeight * .90
  for (const snap of sorted) {
    const agents = new Map(snap.agents.map(a => [a.id,a]))
    // Team view provides safe display names and ancestry order, including orphan/cycle handling.
    const rows = buildTeamView(snap, 'session').rows
    const ordered = [...rows].sort((a,b) => Number(b.agent.role === 'lead' && !b.agent.parentId)-Number(a.agent.role === 'lead' && !a.agent.parentId))
    const done = (a: TeamAgentRow) => a.status === 'done' || a.status === 'cancelled'
    // Limited desks go to whoever most needs to be seen: root lead, waiting, failed, working, then idle.
    const rank = (r: (typeof ordered)[number]) => r.agent.role === 'lead' && !r.agent.parentId ? 0 : r.agent.status.startsWith('waiting_') ? 1 : r.agent.status === 'failed' ? 2 : isWorking(r.agent.status) ? 3 : 4
    const desks = ordered.filter(r => !done(r.agent)).sort((a,b) => rank(a)-rank(b))
    const room = desks.length > 4 ? 'room-c-big' : desks.some(r => r.agent.role === 'lead' && !r.agent.parentId) ? 'room-b-lead' : 'room-a'
    const slots = OFFICE_SLOTS[room], height = width * slots.aspect
    const id = JSON.stringify(['team',snap.sessionId]), included = showQuiet || !quiet(snap)
    const working = snap.agents.filter(a => isWorking(a.status)).length, waiting = snap.agents.filter(a => a.status.startsWith('waiting_')).length
    const clean = (v: string) => v.replace(/(?:[A-Za-z]:[\\/]|\/root\/|\/Users\/|\/home\/)[^ ·]+/g, '').trim()
    const project = clean(snap.project ?? ''), title = [project, clean(snap.title)].filter((v,i,a) => v && a.indexOf(v)===i).join(' · ') || 'Team'
    if (included) floors.push({ id, sessionId:snap.sessionId, title, subtitle:[working ? `${working} working` : '', waiting ? `${waiting} needs you` : ''].filter(Boolean).join(' · '), working, waiting, overflow:Math.max(0,desks.length-slots.chairs.length), color:teamColor(snap.sessionId), y, height, room, actorKeys:desks.map(r => officeKey(snap.sessionId,r.agent.id)), kind:'team' })
    for (const row of ordered) {
      const terminal = done(row.agent), slot = desks.indexOf(row), key = officeKey(snap.sessionId,row.agent.id)
      if (!terminal && !included) continue
      const chair = slots.chairs[Math.max(0,slot) % slots.chairs.length], monitor = slots.monitors[Math.max(0,slot) % slots.monitors.length]
      const activity = row.agent.activities.at(-1)
      const actor: OfficeActor = { key, sessionId:snap.sessionId, agent:row.agent, task:row.task,
        parentKey:row.agent.parentId && agents.has(row.agent.parentId) ? officeKey(snap.sessionId,row.agent.parentId) : null,
        appearance:officeAppearance(identities.get(key) ?? 0), floorId:id, zone:terminal ? 'lounge' : 'desk',
        x:chair[0]*width, y:y+chair[1]*height, monitor:{x:monitor[0]*width,y:y+monitor[1]*height},
        hidden:!terminal && slot>=slots.chairs.length, pod:snap.agents.some(a=>a.parentId===row.agent.id),
        activity:activity && row.agent.status === 'running' ? describeActivity(activity).label : row.statusText,
        runtimeName:row.agent.runtime ? runtimeNames[row.agent.runtime] : 'Unknown AI', team:{ title, color:teamColor(snap.sessionId) } }
      if (terminal) resting.push(actor); else actors.push(actor)
    }
    if (included) y += height * .90
  }
  if (quietTeams.length) { floors.push({id:'quiet',sessionId:null,title:`${quietTeams.length} quiet teams`,subtitle:'',color:'#aa9168',y,height:34,actorKeys:[],kind:'quiet'}); y+=34 }
  const seats = [[.338,.61],[.495,.61],[.64,.57],[.78,.58]]
  resting.forEach((actor,i) => { const seat=seats[i%seats.length]; actors.push({...actor, floorId:'lounge',monitor:undefined,x:seat[0]*width,y:seat[1]*surfaceHeight,hidden:i>=LOUNGE_CAP}); lounge.actorKeys.push(actor.key) })
  lounge.overflow=Math.max(0,resting.length-LOUNGE_CAP)
  return { width, height:y+width/3, floors, actors, quietTeams, totalAgents:sorted.reduce((n,s)=>n+s.agents.length,0), finishedCount:resting.length }
}

export function officeEvents(previous: readonly TeamSnapshot[] | null, next: readonly TeamSnapshot[], now: number): OfficeEvent[] {
  if (!previous) return []
  const oldTeams = new Map(previous.map(s=>[s.sessionId,s])), seenTasks=new Set<string>(), events:OfficeEvent[]=[]
  for (const current of [...next].sort((a,b)=>a.sessionId.localeCompare(b.sessionId))) {
    const prior=oldTeams.get(current.sessionId); if (!prior || prior.agents.length === 0) continue
    const oldTasks=new Map(prior.tasks.map(t=>[t.id,t]))
    for (const t of current.tasks) {
      if (seenTasks.has(`${current.sessionId}\0${t.id}`)) continue
      seenTasks.add(`${current.sessionId}\0${t.id}`)
      const old=oldTasks.get(t.id), agent=current.agents.find(a=>a.id===t.childId)
      if (!agent) continue
      if (!old && t.startedAt !== null && prior.updatedAt !== null && t.startedAt < prior.updatedAt) continue
      let kind:OfficeEvent['kind']|null=null
      if (!old && t.status === 'working') kind='assigned'
      else if (!old) continue
      else if (old.status !== 'working' && t.status === 'working') kind='assigned'
      else if (old.status === 'working' && t.status !== 'working') kind='finished'
      if (old && old.delivery !== t.delivery && t.delivery === 'delivered') kind='sent'
      if (old && old.delivery !== t.delivery && t.delivery === 'received') kind='received'
      if (!kind) continue
      const parentValid=t.parentId === agent.parentId && t.parentId !== agent.id && current.agents.some(a=>a.id===t.parentId)
      const parentKey=parentValid?officeKey(current.sessionId,t.parentId):null
      const at=now
      events.push({id:JSON.stringify([current.sessionId,t.id,kind,t.status,t.delivery,t.updatedAt ?? t.completedAt ?? t.startedAt ?? 0]),kind,actorKey:officeKey(current.sessionId,agent.id),parentKey,at})
    }
    // Status changes without a task are intentionally not reported as task events.
  }
  return events
}
