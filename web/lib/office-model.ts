import type { OfficeAppearance, OfficeEvent, OfficeScene, OfficeActor, OfficeFloor } from './office-types'
import type { TeamSnapshot, TeamTaskRow } from './team-types'
import { buildTeamView, describeActivity, isTerminal, isWorking, statusText, type TeamScope } from './team-model'

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

const looks: OfficeAppearance[] = [
  { slot: 0, kind: 'human', hair: '#713c24', skin: '#f2bd91', shirt: '#e87532', pants: '#354c70', cut: 'bun', gear: 'headset' },
  { slot: 1, kind: 'human', hair: '#34251f', skin: '#c98d64', shirt: '#54a65d', pants: '#344c6a', cut: 'crop', gear: 'glasses' },
  { slot: 2, kind: 'robot', hair: '#b9d4dc', skin: '#b9d4dc', shirt: '#4b9ed0', pants: '#405d78', cut: 'antenna', gear: 'visor' },
  { slot: 3, kind: 'raccoon', hair: '#504b54', skin: '#c3a890', shirt: '#9563c4', pants: '#42404b', cut: 'mask', gear: 'satchel' },
  { slot: 4, kind: 'owl', hair: '#b17a32', skin: '#ead9b1', shirt: '#d5a33c', pants: '#61513a', cut: 'feathers', gear: 'round-glasses' },
  { slot: 5, kind: 'fox', hair: '#a84435', skin: '#edb58e', shirt: '#9a4051', pants: '#483b50', cut: 'ears', gear: 'scarf' },
  { slot: 6, kind: 'alien', hair: '#37a99a', skin: '#90d9c1', shirt: '#36a99b', pants: '#345c5c', cut: 'antenna', gear: 'earpiece' },
]
export function officeAppearance(slot: number): OfficeAppearance {
  const safe = Number.isSafeInteger(slot) && slot >= 0 ? slot : 0
  const base = looks[safe % looks.length]
  if (safe < looks.length) return { ...base }
  const variant = Math.floor(safe / looks.length)
  const hue = ((variant * 137.508 + safe % 7 * 41) % 360).toFixed(3)
  return { ...base, slot: safe, shirt: `hsl(${hue} 64% 54%)`, pants: `hsl(${hue} 28% 27%)`,
    gear: ['headset', 'glasses', 'visor', 'satchel', 'scarf', 'earpiece'][variant % 6] }
}

function latestTasks(snapshot: TeamSnapshot): Map<string, TeamTaskRow> {
  const map = new Map<string, TeamTaskRow>()
  for (const task of snapshot.tasks) {
    const old = map.get(task.childId)
    if (!old || (task.updatedAt ?? 0) > (old.updatedAt ?? 0) || ((task.updatedAt ?? 0) === (old.updatedAt ?? 0) && task.id.localeCompare(old.id) > 0)) map.set(task.childId, task)
  }
  return map
}
function quiet(snapshot: TeamSnapshot): boolean {
  const tasks = latestTasks(snapshot)
  return !snapshot.agents.some(a => isWorking(a.status) || a.status === 'waiting_approval' || a.status === 'waiting_input')
    && !snapshot.agents.some(a => (a.status === 'done' || a.status === 'failed') && !['delivered', 'received', 'discarded'].includes(tasks.get(a.id)?.delivery ?? 'none'))
}
const floorColors = ['#f3a45b', '#66bd83', '#6da9d8', '#b18ad0', '#d6ae52', '#c57b83', '#5db7ad']
const runtimeNames = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini', copilot: 'Copilot', cursor: 'Cursor' }
const teamColor = (id: string) => floorColors[[...id].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7) % floorColors.length]

export function buildOfficeScene(snapshots: readonly TeamSnapshot[], scope: TeamScope, showQuiet: boolean, identities: ReadonlyMap<string, number>): OfficeScene {
  const sorted = [...new Map([...snapshots].sort((a,b) => a.sessionId.localeCompare(b.sessionId)).map(s => [s.sessionId, s])).values()]
  const quietTeams = sorted.filter(quiet)
  const included = sorted.filter(s => showQuiet || !quiet(s))
  const floors: OfficeFloor[] = [], actors: OfficeActor[] = []
  let index = 0
  const addFloor = (sessionId: string | null, title: string, subtitle: string, kind: 'team'|'lounge', keys: string[], color: string, identity: string) => {
    const floorIndex = index++, id = JSON.stringify([kind, sessionId, identity])
    floors.push({ id, sessionId, title, subtitle, color, y: 40 + 72 * floorIndex, actorKeys: keys, kind })
    return { id, y: floors[floorIndex].y }
  }
  const xs = [20, 64, 107]
  const teamActors: OfficeActor[] = [], lounge: OfficeActor[] = []
  for (const snap of included) {
    const view = buildTeamView(snap, scope)
    const rows = view.rows
    const agents = new Map(snap.agents.map(a => [a.id, a]))
    const childIds = new Set(snap.agents.filter(a => a.parentId && agents.has(a.parentId)).map(a => a.parentId!))
    const roots = new Map<string, typeof rows>()
    const groupRoot = (id: string): string => {
      let cur = agents.get(id), last = cur?.id ?? id, seen = new Set<string>()
      if (cur && (cur.role === 'lead' || childIds.has(cur.id))) return cur.id
      while (cur && cur.parentId && agents.has(cur.parentId) && !seen.has(cur.id)) {
        seen.add(cur.id); const parent = agents.get(cur.parentId)!; if (parent.role === 'lead' || childIds.has(parent.id)) return parent.id; last = parent.id; cur = parent
      }
      return last
    }
    for (const row of rows) { const root = groupRoot(row.agent.id); const arr = roots.get(root) ?? []; arr.push(row); roots.set(root, arr) }
    const groups = [...roots.entries()].sort(([a],[b]) => a.localeCompare(b))
    for (const [rootId, group] of groups) {
      group.sort((a,b) => Number(b.agent.id === rootId) - Number(a.agent.id === rootId) || (a.agent.startedAt ?? 0) - (b.agent.startedAt ?? 0) || a.agent.id.localeCompare(b.agent.id))
      for (const row of group) {
        if (isTerminal(row.agent.status)) {
          const key=officeKey(snap.sessionId,row.agent.id), parent=row.agent.parentId && row.agent.parentId !== row.agent.id && agents.has(row.agent.parentId) ? officeKey(snap.sessionId,row.agent.parentId) : null
          lounge.push({ key, sessionId:snap.sessionId, agent:row.agent, task:row.task, parentKey:parent, appearance:officeAppearance(identities.get(key) ?? 0), floorId:'', zone:'lounge', x:0,y:0,
            activity:row.statusText,runtimeName:row.agent.runtime ? runtimeNames[row.agent.runtime] : 'Unknown AI' })
        }
      }
      const deskGroup=group.filter(row=>!isTerminal(row.agent.status))
      for (let start=0; start<deskGroup.length; start+=3) {
        const chunk = deskGroup.slice(start,start+3)
        const floor = addFloor(snap.sessionId, snap.title, [snap.project, agents.get(rootId)?.name].filter(Boolean).join(' · '), 'team', chunk.map(r => officeKey(snap.sessionId,r.agent.id)), teamColor(snap.sessionId), JSON.stringify([rootId,start/3]))
        chunk.forEach((row, i) => {
          const key = officeKey(snap.sessionId,row.agent.id), slot = identities.get(key) ?? 0
          const parent = row.agent.parentId && row.agent.parentId !== row.agent.id && agents.has(row.agent.parentId) ? officeKey(snap.sessionId,row.agent.parentId) : null
          const current = row.agent.activities.at(-1)
          teamActors.push({ key, sessionId:snap.sessionId, agent:row.agent, task:row.task, parentKey:parent, appearance:officeAppearance(slot), floorId:floor.id, zone:'desk', x:xs[i], y:floor.y+61,
            activity: current && row.agent.status === 'running' ? describeActivity(current).label : row.statusText, runtimeName:row.agent.runtime ? runtimeNames[row.agent.runtime] : 'Unknown AI' })
        })
      }
    }
  }
  for (let start=0; start<Math.max(1,lounge.length); start+=3) {
    const chunk=lounge.slice(start,start+3), floor=addFloor(null,'Shared lounge','Finished agents','lounge',chunk.map(a=>a.key),'#a88b70',String(start/3))
    chunk.forEach((a,i)=>actors.push({...a,floorId:floor.id,x:xs[i],y:floor.y+61}))
  }
  actors.push(...teamActors)
  return { width:200, height:Math.max(116, floors.length * 72 + 76), floors, actors, quietTeams, totalAgents:sorted.reduce((n,s)=>n+s.agents.length,0), finishedCount:sorted.reduce((n,s)=>n+s.agents.filter(a=>isTerminal(a.status)).length,0) }
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
