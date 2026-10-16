import {
  type Agent,
  type TimelineEntry,
  emptyContextBreakdown,
} from '@/lib/agent-types'
import { COLORS } from '@/lib/colors'
import { formatAgentName } from '@/lib/utils'
import { handleSubagentReturn } from './handle-subagent-events'
import { AGENT_SPAWN_DISTANCE } from '@/lib/canvas-constants'
import { pushTimelineBlock, type ProcessEventContext, type MutableEventState } from './process-event'
import { edgeId, asString, asBoolean } from './types'

export function handleAgentSpawn(
  payload: Record<string, unknown>,
  currentTime: number,
  state: MutableEventState,
  ctx: ProcessEventContext,
): void {
  const name = asString(payload.name)
  const parentId = typeof payload.parent === 'string' ? payload.parent : undefined
  const isMain = asBoolean(payload.isMain)
  const task = typeof payload.task === 'string' ? payload.task : undefined
  const model = typeof payload.model === 'string' ? payload.model : state.timelineEntries.get(name)?.model
  const runtime = payload.runtime === 'codex' ? 'codex' as const : undefined

  // If the agent already exists (e.g. session resuming after inactivity),
  // reactivate it instead of replacing — preserves accumulated stats.
  const existing = state.agents.get(name)
  if (existing) {
    if (existing.parentId) state.particles = state.particles.filter(particle => particle.edgeId !== edgeId(existing.parentId!, name))
    const nextParent = parentId ?? existing.parentId
    state.agents.set(name, {
      ...existing,
      state: 'idle',
      parentId: nextParent,
      completeTime: undefined,
      returnStartedAt: undefined,
      ...(task ? { task } : {}),
      ...(model && model !== existing.model ? { model, tokensMax: ctx.getContextWindowSize(model) } : {}),
      ...(runtime ? { runtime } : {}),
    })
    const entry = state.timelineEntries.get(name)
    if (entry) state.timelineEntries.set(name, { ...entry, endTime: undefined })
    if (nextParent && !state.edges.some(edge => edge.type === 'parent-child' && edge.from === nextParent && edge.to === name)) {
      state.edges = state.edges.filter(edge => !(edge.type === 'parent-child' && edge.to === name))
      state.edges.push({ id: edgeId(nextParent, name), from: nextParent, to: name, type: 'parent-child', opacity: 0 })
    }
    return
  }

  let x = 0, y = 0
  if (parentId) {
    const parent = state.agents.get(parentId)
    if (parent) {
      // Collect angles of existing siblings so we can avoid spawning too close
      const siblingAngles: number[] = []
      for (const a of state.agents.values()) {
        if (a.parentId === parentId && a.id !== name) {
          siblingAngles.push(Math.atan2(a.y - parent.y, a.x - parent.x))
        }
      }

      let angle: number
      if (siblingAngles.length === 0) {
        // First child: use hash-based angle
        const hash = name.split('').reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0), 0)
        angle = (Math.abs(hash) % 360) * (Math.PI / 180)
      } else {
        // Find the largest angular gap between existing siblings and place in the middle
        siblingAngles.sort((a, b) => a - b)
        let bestGap = 0
        let bestMid = 0
        for (let i = 0; i < siblingAngles.length; i++) {
          const next = i + 1 < siblingAngles.length ? siblingAngles[i + 1] : siblingAngles[0] + Math.PI * 2
          const gap = next - siblingAngles[i]
          if (gap > bestGap) {
            bestGap = gap
            bestMid = siblingAngles[i] + gap / 2
          }
        }
        angle = bestMid
      }

      x = parent.x + Math.cos(angle) * AGENT_SPAWN_DISTANCE
      y = parent.y + Math.sin(angle) * AGENT_SPAWN_DISTANCE
    }
  }

  const agent: Agent = {
    id: name, name: formatAgentName(name), state: 'idle',
    parentId: parentId || null,
    tokensUsed: 0, tokensMax: ctx.getContextWindowSize(model),
    contextBreakdown: emptyContextBreakdown(),
    toolCalls: 0, timeAlive: 0,
    x, y, vx: 0, vy: 0,
    pinned: false, isMain,
    ...(runtime ? { runtime } : {}),
    ...(model ? { model } : {}),
    task,
    spawnTime: currentTime,
    opacity: 0, scale: 0.3,
    messageBubbles: [],
  }
  state.agents.set(name, agent)

  if (parentId) {
    state.edges.push({ id: edgeId(parentId, name), from: parentId, to: name, type: 'parent-child', opacity: 0 })
  }

  const timelineEntry: TimelineEntry = {
    id: `timeline-${name}`,
    agentId: name,
    agentName: agent.name,
    model,
    startTime: currentTime,
    blocks: [],
  }
  pushTimelineBlock(timelineEntry, currentTime, { type: 'idle', label: 'Starting', color: COLORS.idle }, ctx)
  const previousEntry = state.timelineEntries.get(name)
  state.timelineEntries.set(name, previousEntry ? { ...previousEntry, model, endTime: undefined } : timelineEntry)

  if (!state.conversations.has(name)) state.conversations.set(name, [])

  if (!ctx.skipForceSync) {
    setTimeout(() => ctx.syncForceSimulation(state.agents, state.edges), 0)
  }
}

export function handleAgentComplete(
  payload: Record<string, unknown>,
  currentTime: number,
  state: MutableEventState,
  ctx: ProcessEventContext,
): void {
  const name = asString(payload.name)
  const agent = state.agents.get(name)
  if (agent && agent.state !== 'complete') {
    if (!agent.isMain && agent.parentId && !payload.aborted) {
      handleSubagentReturn({ child: name, parent: agent.parentId, summary: 'Result returned' }, currentTime, state)
    }
    state.agents.set(name, { ...state.agents.get(name)!, state: 'complete', completeTime: currentTime })

    const entry = state.timelineEntries.get(name)
    if (entry) {
      pushTimelineBlock(entry, currentTime, { type: 'complete', label: 'Done', color: COLORS.complete, endTime: currentTime }, ctx)
      entry.endTime = currentTime
    }

    const agentsToComplete = [name]
    for (let index = 0; index < agentsToComplete.length; index++) {
      for (const [childId, childAgent] of state.agents) {
        if (childAgent.parentId === agentsToComplete[index] && !agentsToComplete.includes(childId)) {
          state.agents.set(childId, { ...childAgent, state: 'complete', completeTime: currentTime })
          agentsToComplete.push(childId)
          const childEntry = state.timelineEntries.get(childId)
          if (childEntry) {
            pushTimelineBlock(childEntry, currentTime, { type: 'complete', label: 'Done', color: COLORS.complete, endTime: currentTime }, ctx)
            childEntry.endTime = currentTime
          }
        }
      }
    }

    for (const [tcId, tc] of state.toolCalls) {
      if (agentsToComplete.includes(tc.agentId) && tc.state === 'running') {
        state.toolCalls.set(tcId, { ...tc, state: 'complete', completeTime: currentTime })
      }
    }
  }
}

export function handlePermissionRequested(
  payload: Record<string, unknown>,
  currentTime: number,
  state: MutableEventState,
  ctx: ProcessEventContext,
): void {
  const agentName = asString(payload.agent, 'Orchestrator')
  const agent = state.agents.get(agentName)
  if (agent && agent.state !== 'complete') {
    state.agents.set(agentName, {
      ...agent,
      state: 'waiting_permission',
      waitingForInput: false,
    })

    const entry = state.timelineEntries.get(agentName)
    if (entry) {
      pushTimelineBlock(entry, currentTime, { type: 'idle', label: 'Permission', color: COLORS.waiting_permission }, ctx)
    }
  }
}

export function handleAgentIdle(
  payload: Record<string, unknown>,
  state: MutableEventState,
  currentTime: number,
  ctx: ProcessEventContext,
): void {
  const idleName = asString(payload.name)
  const idleAgent = state.agents.get(idleName)
  if (idleAgent && payload.state === 'idle' && idleAgent.state !== 'complete') {
    state.agents.set(idleName, { ...idleAgent, state: 'idle', currentTool: undefined })
    const entry = state.timelineEntries.get(idleName)
    if (entry) pushTimelineBlock(entry, currentTime, { type: 'idle', label: 'Waiting for next turn', color: COLORS.idle }, ctx)
    return
  }
  if (idleAgent && (idleAgent.state === 'tool_calling' || idleAgent.state === 'waiting_permission')) {
    state.agents.set(idleName, { ...idleAgent, state: 'thinking', currentTool: undefined })
  }
}

export function handleAgentThinking(
  payload: Record<string, unknown>, currentTime: number,
  state: MutableEventState, ctx: ProcessEventContext,
): void {
  const name = asString(payload.name)
  const agent = state.agents.get(name)
  if (!agent || agent.state === 'thinking') return
  state.agents.set(name, { ...agent, state: 'thinking', currentTool: undefined, completeTime: undefined })
  const entry = state.timelineEntries.get(name)
  if (entry) {
    entry.endTime = undefined
    pushTimelineBlock(entry, currentTime, { type: 'thinking', label: 'Thinking...', color: COLORS.thinking }, ctx)
  }
}

export function handleModelDetected(
  payload: Record<string, unknown>,
  state: MutableEventState,
  ctx: ProcessEventContext,
): void {
  const agentName = asString(payload.agent)
  const model = asString(payload.model)
  const agent = state.agents.get(agentName)
  const entry = state.timelineEntries.get(agentName)
  if (entry) state.timelineEntries.set(agentName, { ...entry, model })
  if (agent) {
    state.agents.set(agentName, {
      ...agent,
      model,
      tokensMax: ctx.getContextWindowSize(model),
    })
  }
}

export function handleInputRequested(payload: Record<string, unknown>, state: MutableEventState): void {
  const name = asString(payload.agent, 'Orchestrator')
  const agent = state.agents.get(name)
  const id = asString(payload.callId)
  if (!agent || !id) return
  const pendingInputs = [...(agent.pendingInputs ?? []).filter(input => input.id !== id), { id, blocking: payload.blocking === true }]
  state.agents.set(name, { ...agent, pendingInputs, ...(payload.blocking === true ? { state: 'waiting_permission', waitingForInput: true } : {}) })
}

export function handleInputResolved(payload: Record<string, unknown>, state: MutableEventState): void {
  const name = asString(payload.agent, 'Orchestrator')
  const agent = state.agents.get(name)
  if (!agent) return
  const pendingInputs = (agent.pendingInputs ?? []).filter(input => input.id !== payload.callId)
  const waitingForInput = pendingInputs.some(input => input.blocking)
  state.agents.set(name, { ...agent, pendingInputs, waitingForInput,
    ...(agent.waitingForInput && !waitingForInput && agent.state === 'waiting_permission' ? { state: 'thinking', currentTool: undefined } : {}) })
}
