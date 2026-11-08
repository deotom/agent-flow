/**
 * Data contract between the T3 adapter (extension/src/t3-*) and the team UI.
 *
 * Every field must be backed by a T3 projection row. A value that T3 does not
 * provide stays null/undefined: never estimate it, never default it to zero.
 * Tool output, command text, request payloads and transcripts are not part of
 * this contract. Timestamps are epoch milliseconds, null when T3 has none.
 */

/** Separate from Agent.state, which also drives the canvas animation. */
export type TeamAgentStatus =
  | 'running'           // A tool item is in progress on the latest run.
  | 'thinking'          // Run or task is in progress with no tool in progress.
  | 'waiting_approval'  // Open runtime request that asks for a decision.
  | 'waiting_input'     // Open runtime request that asks for an answer.
  | 'done'              // Terminal success of the task or child run.
  | 'failed'
  | 'cancelled'         // Includes interrupted.
  | 'idle'              // Lead with no run in progress.

/** Raw evidence only. Plain-language wording is decided by the UI. */
export interface TeamActivity {
  id: string
  /** T3 item type, for example command_execution or mcp_tool_call. */
  type: string
  /** T3 toolName when present. Often absent on command_execution. */
  toolName: string | null
  /** T3 item title when present. Often null. */
  title: string | null
  startedAt: number | null
}

export interface TeamAgentRow {
  /** Same ID as the session_snapshot agent row and therefore the canvas node. */
  id: string
  /** Explicit parent from T3 IDs. Null only for the lead. */
  parentId: string | null
  role: 'lead' | 'worker'
  /** Uncapped display name (the canvas name is capped at 80 characters). */
  name: string
  runtime: 'claude' | 'codex' | null
  model: string | null
  status: TeamAgentStatus
  /** Delegated prompt, capped by the adapter. Null when T3 has none. */
  task: string | null
  activities: TeamActivity[]
  /** Kind of the open runtime request when status is waiting_*. */
  requestKind: string | null
  /** From provider thread contextUsage, only when T3 reports both numbers. */
  context: { used: number; max: number } | null
  toolCallCount: number
  /** False when a native provider subagent has no T3 app thread of its own. */
  hasThread: boolean
  startedAt: number | null
  updatedAt: number | null
  completedAt: number | null
}

/**
 * Evidence of the result reaching the lead, from completion_delivery_state:
 * - none: T3 has no delivery record yet
 * - pending: T3 queued the result, it is not delivered yet
 * - delivered: sent to the lead, not proven read (observedByRunId is null)
 * - received: acknowledged/observed, a lead run consumed it
 * - discarded: T3 disposed of the delivery, the lead will not get it
 * - unknown: a delivery state this adapter does not recognize
 */
export type TeamDelivery = 'none' | 'pending' | 'delivered' | 'received' | 'discarded' | 'unknown'

export interface TeamTaskRow {
  id: string
  childId: string
  parentId: string
  name: string
  model: string | null
  task: string | null
  /** Result text, capped by the adapter. Null when T3 has none. */
  result: string | null
  status: 'working' | 'done' | 'failed' | 'cancelled'
  delivery: TeamDelivery
  startedAt: number | null
  completedAt: number | null
  updatedAt: number | null
}

/** payload.team on a session_snapshot with source 't3'. */
export interface TeamSnapshot {
  sessionId: string
  /** Uncapped team title without the "T3 ·" label prefix. */
  title: string
  active: boolean
  /** Newest T3 updated_at among team rows: the last change T3 recorded. */
  updatedAt: number | null
  agents: TeamAgentRow[]
  tasks: TeamTaskRow[]
}

/** Result of the adapter's latest read. Sent after every poll, not only on change. */
export interface SourceHealth {
  source: 't3'
  state: 'ok' | 'unavailable'
  /** When the adapter last attempted a read. */
  checkedAt: number
  /** Last successful read. Null when no read has succeeded yet. */
  lastSuccessAt: number | null
  /** Last poll that found a team change. Null until the first team is read. */
  lastChangeAt: number | null
  pollIntervalMs: number
  /** Safe text with no paths or row data. Null when state is ok. */
  reason: string | null
}

/**
 * Viewer to relay link. Always 'open' inside VS Code, which uses postMessage.
 * reconnecting: EventSource lost the relay and is retrying.
 */
export type TransportState = 'open' | 'reconnecting'
