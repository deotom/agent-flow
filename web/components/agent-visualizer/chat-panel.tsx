'use client'

import { CARD, Z, type AgentState } from '@/lib/agent-types'
import { COLORS, getStateColor } from '@/lib/colors'
import { TranscriptMessage } from './transcript-message'
import type { ConversationMessage } from '@/hooks/simulation/types'
import { PanelHeader, SlidingPanel, stopPropagationHandlers } from './shared-ui'
import { useArchivePage } from '@/hooks/use-archive-page'
import type { MessageRow } from '@/lib/history-archive'
import { useAutoScroll } from '@/hooks/use-auto-scroll'

interface ChatPanelProps {
  sessionId?: string | null
  agentId?: string | null
  round?: number
  visible: boolean
  agentName: string
  agentState: AgentState
  conversation: ConversationMessage[]
  runtime?: 'claude' | 'codex'
  onClose: () => void
}

export function AgentChatPanel({
  sessionId, agentId, round,
  visible,
  agentName,
  agentState,
  conversation: recentConversation,
  runtime,
  onClose,
}: ChatPanelProps) {
  const archive = useArchivePage<MessageRow>(visible, sessionId, 'messages', { agent: agentId ?? undefined, round })
  const conversation = archive.items.length && !archive.error ? [...archive.items].reverse() : recentConversation
  const { ref: logRef } = useAutoScroll(conversation.length, visible)

  const stateColor = getStateColor(agentState)

  return (
    <SlidingPanel
      visible={visible}
      position={{ bottom: 64, right: 12 }}
      zIndex={Z.chatPanel}
      width={CARD.chat.width}
      {...stopPropagationHandlers}
    >
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', maxHeight: CARD.chat.maxHeight }}>
        {sessionId && visible && <div className="flex justify-between text-xs p-2"><button disabled={archive.pageNumber === 1} onClick={archive.newer}>Newer messages</button><button disabled={!archive.more} onClick={archive.older}>Older messages</button></div>}
        <PanelHeader onClose={onClose} className="mb-2 flex-shrink-0">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: stateColor, boxShadow: `0 0 6px ${stateColor}` }}
          />
          <span className="text-[10px] font-mono tracking-wider" style={{ color: COLORS.textPrimary }}>
            {agentName.toUpperCase()}
          </span>
          <span className="text-[9px] font-mono capitalize" style={{ color: stateColor + '90' }}>
            {agentState}
          </span>
        </PanelHeader>

        {/* Messages */}
        <div
          ref={logRef}
          className="flex-1 overflow-y-auto space-y-1.5 mb-2"
          style={{ minHeight: CARD.chat.messagesMinHeight, maxHeight: CARD.chat.messagesMaxHeight }}
        >
          {conversation.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-[10px] font-mono" style={{ color: COLORS.textMuted }}>
                No messages yet...
              </p>
            </div>
          ) : (
            conversation.map((msg) => (
              <TranscriptMessage sessionId={sessionId} key={msg.id} message={msg} assistantLabel={runtime === 'codex' ? 'CODEX' : 'CLAUDE'} />
            ))
          )}
        </div>

      </div>
    </SlidingPanel>
  )
}
