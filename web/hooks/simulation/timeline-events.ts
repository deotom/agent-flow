import type { TimelineEvent } from '@/lib/agent-types'
import type { ConversationMessage } from './types'

/** Derive from the selected session, including capped/replaced message arrays. */
export function buildTimelineEvents(conversations: Map<string, ConversationMessage[]>): TimelineEvent[] {
  return Array.from(conversations).flatMap(([agentId, messages]) => messages.map(message => ({
    id: `event-${message.id}`,
    type: message.type === 'tool_call' ? 'tool_call' as const : message.type === 'tool_result' ? 'tool_result' as const : 'message' as const,
    label: message.content.slice(0, 20), timestamp: message.timestamp, nodeId: agentId,
  }))).sort((a, b) => a.timestamp - b.timestamp)
}
