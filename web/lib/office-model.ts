import type { OfficeAppearance, OfficeEvent, OfficeScene, OfficeActor, OfficeFloor, OfficeBoard, OfficeBoardItem, OfficeBreakRoom } from './office-types'
import type { TeamAgentRow, TeamSnapshot } from './team-types'
import { buildTeamView, describeActivity, isWorking, type TeamScope } from './team-model'
import { agentWorkStation } from './office-stations'
import { officeLeisureForSpot } from './office-leisure'

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
  const outfits=['jacket','hoodie','overalls','vest','coat','poncho','striped','shirt'] as const
  const gears=['glasses','cap','headphones','beanie','goggles','earrings','headset','scarf','none']
  return { ...base, slot: safe,
    hair:['#402d26','#192d39','#bd713b','#e0bd78','#744341','#503e71','#e4e0d3','#a38c74','#24252a','#327a79','#994f75','#b9a0c8'][safe%12],
    skin:['#f4c6a2','#d7a078','#a66b48','#edbb91','#714934','#deb08b','#f2d8bd'][Math.floor(safe/2)%7],
    outfit:outfits[safe%outfits.length],face:(['round','square','oval'] as const)[Math.floor(safe/3)%3],
    gear:gears[(safe*3+Math.floor(safe/7))%gears.length],
    ...(safe >= 7 ? { shirt: `hsl(${safe * 137.508 % 360} 42% 57%)` } : {}) }
}

const activeInOffice = (agent: TeamAgentRow) => isWorking(agent.status) || agent.status === 'waiting_approval' || agent.status === 'waiting_input'
function quiet(snapshot: TeamSnapshot): boolean {
  return !snapshot.agents.some(activeInOffice)
}
const floorColors = ['#f3a45b', '#66bd83', '#6da9d8', '#b18ad0', '#d6ae52', '#c57b83', '#5db7ad']
const runtimeNames = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini', copilot: 'Copilot', cursor: 'Cursor' }
const teamColor = (id: string) => floorColors[[...id].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7) % floorColors.length]

// Coordinates measured against the supplied source artwork, as fractions of its full bounds.
export const OFFICE_SLOTS = {
  'room-stations': {chairs:[[.13,.79],[.35,.79],[.57,.79],[.79,.79]],monitors:[[.13,.55],[.35,.55],[.57,.55],[.79,.55]],aspect:864/1536},
  'room-stations-large': {chairs:[[.13,.72],[.35,.72],[.57,.72],[.79,.72],[.13,.79],[.35,.79],[.57,.79],[.79,.79]],monitors:[[.13,.55],[.35,.55],[.57,.55],[.79,.55]],aspect:.75},
  'room-a': { chairs: [[.19,.68],[.365,.68],[.595,.68],[.783,.68]], monitors: [[.223,.48],[.394,.48],[.624,.48],[.807,.48]], aspect: 864/1536 },
  'room-b-lead': { chairs: [[.31,.69],[.542,.69],[.682,.69],[.84,.69]], monitors: [[.287,.425],[.54,.465],[.685,.465],[.833,.465]], aspect: 864/1536 },
  'room-c-big': { chairs: [[.162,.55],[.378,.55],[.601,.55],[.815,.55],[.148,.765],[.375,.765],[.603,.765],[.826,.765]], monitors: [[.172,.421],[.386,.421],[.602,.421],[.815,.421],[.153,.622],[.382,.622],[.607,.622],[.832,.622]], aspect: 1 },
} as const
export const LOUNGE_CAP = 4
/** A team seen finishing celebrates on the surface for this long, then goes home. */
export const OFFICE_PARTY_MS = 15 * 60_000
type BreakSpot = readonly [x: number, y: number, standing: 0 | 1]
/**
 * Break-room decor variants and their spots as [x, y, standing] fractions of each art
 * (feet points, checked against the images with artifacts.local/office-concept/seat-check.py).
 */
export const BREAK_ROOMS: Readonly<Record<OfficeBreakRoom, readonly BreakSpot[]>> = {
  // Cozy lounge: sofas, coffee bar, ping-pong, beanbags.
  'room-break': [[.275,.6,0],[.415,.6,0],[.70,.6,0],[.84,.6,0],[.15,.74,1],[.54,.75,1],[.66,.75,1],[.235,.67,0],[.48,.67,0]],
  // Game room: sofa, beanbags, foosball, arcade.
  'room-break-game': [[.22,.62,0],[.36,.62,0],[.50,.69,0],[.63,.70,0],[.73,.79,1],[.86,.79,1],[.09,.72,1]],
  // Greenhouse: wicker chairs, hammock, bench, potting table, fountain.
  'room-break-garden': [[.22,.64,0],[.31,.64,0],[.475,.60,0],[.615,.63,0],[.70,.63,0],[.09,.72,1],[.84,.73,1]],
  // Fireside reading nook: chesterfield, armchairs, fireplace, tea cart, globe.
  'room-break-reading': [[.29,.645,0],[.40,.645,0],[.16,.66,0],[.77,.66,0],[.48,.79,1],[.07,.74,1],[.87,.75,1]],
}
const BREAK_VARIANTS = Object.keys(BREAK_ROOMS) as OfficeBreakRoom[]
/** Stable decor per team so its break room looks the same every time. */
export const officeBreakRoom = (sessionId: string): OfficeBreakRoom =>
  BREAK_VARIANTS[[...sessionId].reduce((hash, char) => (hash * 33 + char.charCodeAt(0)) >>> 0, 5381) % BREAK_VARIANTS.length]
/** The same team keeps its office decor even when other teams enter or leave. */
export const officeWorkRoom = (_sessionId: string, desks: number): keyof typeof OFFICE_SLOTS => desks>4?'room-stations-large':'room-stations'
/** Spots in the default cozy break room. */
export const BREAK_SEATS = BREAK_ROOMS['room-break']
export const BREAK_ASPECT = 864/1536
/** Failed work is terminal history; only current work or a live request keeps a room open. */
export const officeTeamQuiet = (snapshot: TeamSnapshot) => quiet(snapshot)
/** Replace recognizable filesystem tokens, preserving URLs and ordinary slash-separated names. */
export function officeDisplayName(name: string): string {
  const paths = /\b[a-z][a-z\d+.-]*:\/\/[^\s·]+|(?:^|(?<=[\s("']))(?:[A-Za-z]:[\\/](?:[^\\/\r\n·<>"|?*]+[\\/])*[^\s\\/·<>"|?*]*|\\\\[^\s\\/]+[\\/][^\s·]+|~\/(?:[^\s·]+)|\/(?:root|home|Users|tmp|var|mnt|opt|srv|workspace|usr|etc|private)(?:\/[^\s·]*)?)(?=$|[\s)"'·])/gi
  return name.replace(paths, match => /^[a-z][a-z\d+.-]*:\/\//i.test(match) ? match : match.split(/[\\/]/).filter(Boolean).pop() ?? '').replace(/\s+/g, ' ').trim() || 'Agent'
}
/**
 * Where people go:
 * - finished and failed workers of an active team rest in that team's own break room,
 *   directly below its office (a failed root lead keeps its desk);
 * - quiet teams go home, except teams in `parties` (seen finishing by the viewer), which
 *   celebrate on the surface lawn first.
 */
export function buildOfficeScene(snapshots: readonly TeamSnapshot[], scope: TeamScope, showQuiet: boolean, identities: ReadonlyMap<string, number>, width = 450, parties: ReadonlySet<string> = new Set()): OfficeScene {
  const priority = (s: TeamSnapshot) => s.agents.some(a => a.status.startsWith('waiting_')) ? 0 : quiet(s) ? 2 : 1
  const sorted = [...new Map(snapshots.map(s => [s.sessionId, s])).values()].sort((a,b) => priority(a)-priority(b) || a.sessionId.localeCompare(b.sessionId))
  const quietTeams = sorted.filter(s => quiet(s) && !(parties.has(s.sessionId) && s.agents.some(a => a.status === 'done'))), floors: OfficeFloor[] = [], actors: OfficeActor[] = [], resting: OfficeActor[] = [], guests: OfficeActor[] = []
  const partyTitles: string[] = []
  const clean = (v: string) => v.replace(/(?:[A-Za-z]:[\\/]|\/root\/|\/Users\/|\/home\/)[^ ·]+/g, '').trim()
  const surfaceHeight = width * 864/1536
  const lounge: OfficeFloor = { id:'lounge', sessionId:null, title:'Surface lounge', subtitle:'', color:'#a88b70', y:0, height:surfaceHeight, actorKeys:[], kind:'lounge' }
  floors.push(lounge)
  let y = surfaceHeight * .90
  for (const snap of sorted) {
    const agents = new Map(snap.agents.map(a => [a.id,a]))
    // Team view provides safe display names and ancestry order, including orphan/cycle handling.
    const rows = buildTeamView(snap, scope).rows
    const ordered = [...rows].sort((a,b) => Number(b.agent.role === 'lead' && !b.agent.parentId)-Number(a.agent.role === 'lead' && !a.agent.parentId))
    const rootLead = (a: TeamAgentRow) => a.role === 'lead' && !a.parentId
    const done = (a: TeamAgentRow) => a.status === 'done' || a.status === 'cancelled' || ((a.status === 'failed' || a.status === 'idle') && !rootLead(a))
    const teamQuiet = quiet(snap)
    const partying = teamQuiet && parties.has(snap.sessionId) && snap.agents.some(a => a.status === 'done')
    if (partying) partyTitles.push(clean(snap.title) || 'Team')
    // Limited desks go to whoever most needs to be seen: root lead, waiting, failed, working, then idle.
    const rank = (r: (typeof ordered)[number]) => r.agent.role === 'lead' && !r.agent.parentId ? 0 : r.agent.status.startsWith('waiting_') ? 1 : r.agent.status === 'failed' ? 2 : isWorking(r.agent.status) ? 3 : 4
    const desks = ordered.filter(r => !done(r.agent)).sort((a,b) => rank(a)-rank(b))
    const room = officeWorkRoom(snap.sessionId, desks.length)
    const slots = OFFICE_SLOTS[room], height = width * slots.aspect
    const id = JSON.stringify(['team',snap.sessionId]), included = showQuiet || !quiet(snap)
    const working = snap.agents.filter(a => isWorking(a.status)).length, waiting = snap.agents.filter(a => a.status.startsWith('waiting_')).length
    const project = clean(snap.project ?? ''), title = [project, clean(snap.title)].filter((v,i,a) => v && a.indexOf(v)===i).join(' · ') || 'Team'
    if (included) floors.push({ id, sessionId:snap.sessionId, title, board:officeBoard(snap, clean(snap.title) || title, clean), subtitle:[working ? `${working} working` : '', waiting ? `${waiting} needs you` : ''].filter(Boolean).join(' · '), working, waiting, overflow:Math.max(0,desks.length-slots.chairs.length), color:teamColor(snap.sessionId), y, height, room, actorKeys:desks.map(r => officeKey(snap.sessionId,r.agent.id)), kind:'team' })
    const teamResting: OfficeActor[] = []
    for (const row of ordered) {
      const terminal = done(row.agent), slot = desks.indexOf(row), key = officeKey(snap.sessionId,row.agent.id)
      if (!terminal && !included) continue
      const chair = slots.chairs[Math.max(0,slot) % slots.chairs.length]
      const activity = row.agent.activities.at(-1), station=agentWorkStation(row.agent)
      const actor: OfficeActor = { key, sessionId:snap.sessionId, agent:{ ...row.agent, name:officeDisplayName(row.agent.name) }, task:row.task,
        parentKey:row.agent.parentId && agents.has(row.agent.parentId) ? officeKey(snap.sessionId,row.agent.parentId) : null,
        appearance:officeAppearance(identities.get(key) ?? 0), floorId:id, zone:terminal ? 'lounge' : 'desk',
        // Stable staging spots are independent of tool changes. Motion owns the trip to a station.
        x:chair[0]*width,y:y+chair[1]*height,
        monitor:undefined, workStation:terminal?undefined:station,stand:!terminal,
        hidden:!terminal && slot>=slots.chairs.length, pod:snap.agents.some(a=>a.parentId===row.agent.id),
        activity:activity && row.agent.status === 'running' ? describeActivity(activity).label : row.statusText,
        runtimeName:row.agent.runtime ? runtimeNames[row.agent.runtime] : 'Unknown AI', team:{ title, color:teamColor(snap.sessionId) } }
      // Active teams rest in their own break room; quiet teams go home unless they are celebrating.
      if (terminal) { if (!teamQuiet) teamResting.push(actor); else if (partying) guests.push({ ...actor, party:true }) }
      else actors.push(actor)
    }
    if (included) y += height * .90
    // The team's own break room hangs directly below its office, only while someone rests there.
    if (included && teamResting.length) {
      const breakHeight = width * BREAK_ASPECT, breakId = JSON.stringify(['break', snap.sessionId])
      const decor = officeBreakRoom(snap.sessionId), spots = BREAK_ROOMS[decor]
      const breakFloor: OfficeFloor = { id:breakId, sessionId:snap.sessionId, title:`☕ ${clean(snap.title) || 'Team'} · Break room`, subtitle:`${teamResting.length} resting`,
        color:teamColor(snap.sessionId), y, height:breakHeight, room:decor, actorKeys:[], kind:'break', overflow:Math.max(0, teamResting.length - spots.length) }
      floors.push(breakFloor)
      teamResting.forEach((actor, i) => {
        const [sx, sy, stand] = spots[i % spots.length]
        actors.push({ ...actor, floorId:breakId, monitor:undefined, x:sx*width, y:y+sy*breakHeight, stand:stand === 1, objectAction:officeLeisureForSpot(decor,i), hidden:i >= spots.length })
        breakFloor.actorKeys.push(actor.key)
      })
      resting.push(...teamResting)
      y += breakHeight * .90
    }
  }
  if (quietTeams.length) { floors.push({id:'quiet',sessionId:null,title:`${quietTeams.length} ${quietTeams.length === 1 ? 'team' : 'teams'} at home`,subtitle:'',color:'#aa9168',y,height:34,actorKeys:[],kind:'quiet'}); y+=34 }
  // The surface lawn is the party garden.
  const seats = [[.338,.61],[.495,.61],[.64,.57],[.78,.58]]
  if (partyTitles.length) lounge.party = partyTitles
  guests.forEach((actor,i) => { const seat=seats[i%seats.length]; actors.push({...actor, floorId:'lounge',monitor:undefined,x:seat[0]*width,y:seat[1]*surfaceHeight,stand:i%4===1||i%4===3,objectAction:(['snack','music','snack','coffee'] as const)[i%4],hidden:i>=LOUNGE_CAP}); lounge.actorKeys.push(actor.key) })
  lounge.overflow=Math.max(0,guests.length-LOUNGE_CAP)
  return { width, height:y+width/3, floors, actors, quietTeams, totalAgents:sorted.reduce((n,s)=>n+s.agents.length,0), finishedCount:resting.length + guests.length }
}

/**
 * Blackboard summary: the team goal, task progress and up to three items in priority
 * order (needs you, failed, in progress, recently done).
 * Privacy: items show agent display names only. TaskRow.task is the delegated prompt and
 * may hold secrets, so it is never shown passively; it stays behind deliberate inspection.
 * Results, tool output and transcripts are never used.
 */
export function officeBoard(snap: TeamSnapshot, goal: string, clean: (value: string) => string = v => v): OfficeBoard {
  const tasks = snap.tasks.filter(task => task.status !== 'cancelled')
  const names = new Map(snap.agents.map(agent => [agent.id, officeDisplayName(agent.name)]))
  const label = (task: TeamSnapshot['tasks'][number]) => (clean(names.get(task.childId) ?? task.name).replace(/\s+/g, ' ').trim() || 'Agent').slice(0, 60)
  const items: OfficeBoardItem[] = [
    ...snap.agents.filter(agent => agent.status.startsWith('waiting_')).map(agent => ({ label: `${officeDisplayName(agent.name)} needs you`, state: 'waiting' as const })),
    ...tasks.filter(task => task.status === 'failed').map(task => ({ label: label(task), state: 'failed' as const })),
    ...tasks.filter(task => task.status === 'working').map(task => ({ label: label(task), state: 'working' as const })),
    ...tasks.filter(task => task.status === 'done').sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)).map(task => ({ label: label(task), state: 'done' as const })),
  ]
  return { goal, done: tasks.filter(task => task.status === 'done').length, total: tasks.length, items: items.slice(0, 3) }
}

/** Board for a (possibly held) floor, always taken from the current scene; null once the team is gone. */
export function currentOfficeBoard(floor: OfficeFloor, current: OfficeScene): OfficeBoard | null {
  return current.floors.find(f => f.kind === 'team' && f.sessionId === floor.sessionId)?.board ?? null
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
