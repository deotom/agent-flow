import { COLORS } from '@/lib/colors'
import type { MutableEventState } from './process-event'
import { edgeId, asString, LABEL_LEN_SHORT } from './types'

export function handleSubagentDispatch(
  payload: Record<string, unknown>,
  currentTime: number,
  state: MutableEventState,
): void {
  const parentName = asString(payload.parent)
  const childName = asString(payload.child)
  const eid = edgeId(parentName, childName)
  const task = asString(payload.task)

  state.particles.push({
    id: `p-disp-${currentTime}-${eid}`,
    edgeId: eid, progress: 0,
    type: payload.notification === true ? 'message' : 'dispatch', color: COLORS.dispatch,
    size: 6, trailLength: 0.2,
    label: task.slice(0, LABEL_LEN_SHORT),
  })
}

export function handleSubagentReturn(
  payload: Record<string, unknown>,
  currentTime: number,
  state: MutableEventState,
): void {
  const childName = asString(payload.child)
  const child = state.agents.get(childName)
  if (!child || child.returnStartedAt !== undefined) return
  const parentName = child.parentId || asString(payload.parent)
  if (!state.agents.has(parentName)) return
  const eid = edgeId(parentName, childName)
  const summary = asString(payload.summary)

  state.agents.set(childName, { ...child, returnStartedAt: currentTime, opacity: 1, scale: 1 })
  if (!state.edges.some(edge => edge.id === eid)) {
    state.edges.push({ id: eid, from: parentName, to: childName, type: 'parent-child', opacity: 1 })
  }

  state.particles.push({
    id: `p-ret-${currentTime}-${eid}`,
    edgeId: eid, progress: 1,
    type: 'return', color: COLORS.return,
    size: 5, trailLength: 0.2,
    label: summary.slice(0, LABEL_LEN_SHORT),
  })
}
