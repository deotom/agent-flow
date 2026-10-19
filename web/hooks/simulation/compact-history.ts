import type { SimulationState } from './types'

export function compactHistory(state: SimulationState, stored: SimulationState, through: number): SimulationState {
  const recent = [...state.conversations.values()].flat().sort((a, b) => (b.sourceSequence ?? 0) - (a.sourceSequence ?? 0)).slice(0, 500)
  const keep = new Set(recent.map(message => message.id))
  const conversations = new Map([...state.conversations].map(([id, messages]) => [id, messages.filter(message => keep.has(message.id) || (message.sourceSequence ?? Infinity) > through).map(message =>
    (message.sourceSequence ?? Infinity) <= through ? { ...message, content: message.content.slice(0, 1600), inputData: undefined, archived: true } : message)]))
  const toolCalls = new Map([...state.toolCalls].map(([id, tool]) => {
    const saved = stored.toolCalls.get(id)
    return [id, saved && saved.result === tool.result && saved.inputData === tool.inputData ? { ...tool, archived: true, inputsArchived: true,
      args: tool.args.slice(0, 1600), result: tool.result?.slice(0, 1600), inputData: tool.inputData ? {
        file_path: tool.inputData.file_path, file_paths: tool.inputData.file_paths,
      } : undefined } : tool]
  }))
  const allTasks = [...state.delegations.values()]
  const recentTasks = new Set(allTasks.slice(-200).map(task => task.id))
  const tasks = allTasks.filter(task => recentTasks.has(task.id) || (!task.archived && stored.delegations.get(task.id)?.summary !== task.summary))
  const delegations = new Map(tasks.map(task => {
    const saved = stored.delegations.get(task.id)
    return [task.id, saved?.summary === task.summary ? { ...task, archived: true, taskArchived: true, summary: task.summary.slice(0, 1600), task: task.task.slice(0, 1600) } : task]
  }))
  const recentAgents = new Set([...tasks.map(task => task.child), ...[...conversations].filter(([, messages]) => messages.length).map(([id]) => id)])
  const timelineEntries = new Map([...state.timelineEntries].filter(([id, entry]) => entry.agentSummary || state.agents.has(id) || recentAgents.has(id)).map(([id, entry]) => [id, { ...entry,
    blocks: state.agents.has(id) || recentAgents.has(id) ? entry.blocks.slice(-200) : [] }]))
  let removed = 0
  while (removed < state.eventIndex && (state.eventLog[removed]?.sequence ?? Infinity) <= through) removed++
  return { ...state, conversations, toolCalls, delegations, timelineEntries,
    eventLog: state.eventLog.slice(removed), eventIndex: state.eventIndex - removed }
}
