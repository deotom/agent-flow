/**
 * Parser for Codex rollout JSONL files at ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
 *
 * Codex writes five top-level record types. This parser handles all of them:
 *
 *   session_meta  — first line; carries cwd, cli_version, session id, base
 *                   instructions (system prompt)
 *   turn_context  — per turn; carries the authoritative model id for that turn
 *                   plus approval/sandbox policy. May change mid-session.
 *   response_item — OpenAI Responses API-shaped turn data: messages, function
 *                   calls, function call outputs, custom tool calls, reasoning
 *   event_msg     — Codex lifecycle events: task_started/complete, token_count,
 *                   agent_reasoning (plaintext thinking), exec_command_end, etc.
 *   compacted     — auto-compaction marker with replacement_history
 *
 * Dedup strategy:
 *   Messages     — emitted from response_item.message only. event_msg's
 *                   agent_message / user_message are mirrors of the response_item
 *                   content (sometimes imperfect for user messages) and are
 *                   skipped. System-injected user content (IDE context,
 *                   subagent notifications) is filtered.
 *   Reasoning    — plaintext from event_msg.agent_reasoning or response_item
 *                   summaries/content, deduplicated within the current turn.
 *                   Encrypted content is never displayed.
 *   Tool results — emitted from function_call_output / custom_tool_call_output
 *                   only. event_msg.exec_command_end / patch_apply_end are
 *                   parallel signals and are skipped.
 *
 * Subagents are discovered from successful spawn_agent outputs and their
 * response_item.agent_message records, without executing any recorded code.
 */

import { AgentEvent } from './protocol'
import { createHash } from 'node:crypto'
import {
  ORCHESTRATOR_NAME, MESSAGE_MAX, PREVIEW_MAX, RESULT_MAX,
  SYSTEM_PROMPT_BASE_TOKENS, SYSTEM_CONTENT_PREFIXES,
} from './constants'
import {
  summarizeInput, summarizeResult, extractInputData, extractFilePath,
  buildDiscovery, detectError,
} from './tool-summarizer'
import { estimateTokenCost, estimateTokensFromText } from './token-estimator'
import { createLogger } from './logger'

const log = createLogger('CodexRolloutParser')

// ─── State ─────────────────────────────────────────────────────────────────

export interface CodexContextBreakdown {
  systemPrompt: number
  userMessages: number
  toolResults: number
  reasoning: number
  subagentResults: number
}

export interface PendingCodexToolCall {
  name: string
  args: string
  startTime: number
  filePath?: string
  spawn?: { task: string; model?: string }
  dispatch?: { target: string; task: string; activate: boolean }
}

export interface CodexRolloutState {
  /** Model id from the most recent turn_context. Authoritative. */
  model: string | null
  /** Cwd from session_meta, updated by turn_context. */
  cwd: string | null
  /** Label for the session (set from first non-system user message). */
  label: string | null
  /** Pending tool calls, keyed by call_id. */
  pendingToolCalls: Map<string, PendingCodexToolCall>
  pendingUserInputs: Map<string, { blocking: boolean; count: number; answered: Set<number> }>
  /** Content hashes of already-emitted messages (for dedup across replays). */
  seenMessageHashes: Set<string>
  /** Running token breakdown. */
  contextBreakdown: CodexContextBreakdown
  /** Orchestrator agent_spawn emitted flag. */
  spawnEmitted: boolean
  /** Last emitted model id, so we only emit model_detected when it changes. */
  lastEmittedModel: string | null
  /** Authoritative total tokens from the last event_msg.token_count, if any. */
  lastReportedTokens: number | null
  /** Authoritative model_context_window from event_msg.token_count, if any. */
  reportedContextWindow: number | null
  agents: Set<string>
  seenToolCalls: Set<string>
  turnActive: boolean
}

export function createCodexRolloutState(): CodexRolloutState {
  return {
    model: null,
    cwd: null,
    label: null,
    pendingToolCalls: new Map(),
    pendingUserInputs: new Map(),
    seenMessageHashes: new Set(),
    contextBreakdown: {
      systemPrompt: SYSTEM_PROMPT_BASE_TOKENS,
      userMessages: 0,
      toolResults: 0,
      reasoning: 0,
      subagentResults: 0,
    },
    spawnEmitted: false,
    lastEmittedModel: null,
    lastReportedTokens: null,
    reportedContextWindow: null,
    agents: new Set(),
    seenToolCalls: new Set(),
    turnActive: false,
  }
}

// ─── Delegate ──────────────────────────────────────────────────────────────

export interface CodexParserDelegate {
  /** Emit an agent event (sessionId is attached by the watcher, not here). */
  emit(event: AgentEvent): void
  /** Elapsed seconds since the session started. */
  elapsed(): number
  /** Called when a session label is derived from the first user message. */
  setLabel?(label: string): void
}

// ─── Record shapes (structural typing, all fields optional) ────────────────

interface RolloutRecord {
  type?: string
  timestamp?: string
  payload?: unknown
}

interface MessageContent {
  type?: string
  text?: string
}

interface MessagePayload {
  role?: string
  content?: MessageContent[] | string
}

interface FunctionCallPayload {
  name?: string
  arguments?: string
  call_id?: string
}

interface FunctionCallOutputPayload {
  call_id?: string
  output?: string | { output?: string; metadata?: unknown }
}

interface CustomToolCallPayload {
  name?: string
  input?: string
  call_id?: string
}

interface CustomToolCallOutputPayload {
  call_id?: string
  output?: string | { output?: string; metadata?: unknown }
}

interface WebSearchCallPayload {
  id?: string
  status?: string
  action?: { type?: string; query?: string }
}

interface SessionMetaPayload {
  id?: string
  cwd?: string
  cli_version?: string
  base_instructions?: { text?: string }
}

interface TurnContextPayload {
  model?: string
  cwd?: string
  personality?: string
}

interface CompactedPayload {
  message?: string
  replacement_history?: Array<{ type?: string; role?: string; content?: MessageContent[] | string }>
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/** Flatten message content into a single trimmed string. */
function flattenContent(content: MessageContent[] | string | undefined): string {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content.map(c => String(c?.text || '')).join('').trim()
}

/** Markers identifying Codex-injected user messages that contain no real user prompt. */
const CODEX_PURE_INJECTION_PREFIXES = [
  '# AGENTS.md instructions', // project-level instructions
  '<environment_context>',         // per-turn environment metadata
  '<turn_aborted>',                // interruption marker
  '<subagent_notification>',       // reserved for future subagent support
  '<external_codex_apps_open_page>',
  '<send_user_message_question_reply>',
]

/** Marker the Codex IDE wrapper places before the actual user prompt. */
const CODEX_REQUEST_MARKER = '## My request for Codex:'

/**
 * Extract the real user-authored text from a Codex user message.
 *
 * Codex's IDE wrapper inlines open tabs, active file, diagnostics, etc.
 * before the user's actual request, separated by a "## My request for Codex:"
 * header. For pure injections (AGENTS.md, env context, aborts) we return null
 * so the caller skips the message entirely.
 *
 * Returns null for pure injections, the extracted prompt for wrapped messages,
 * or the original text (trimmed) otherwise.
 */
function extractCodexUserText(raw: string): string | null {
  const text = raw.trim()
  if (!text) return null
  if (SYSTEM_CONTENT_PREFIXES.some(p => text.startsWith(p))) return null
  if (CODEX_PURE_INJECTION_PREFIXES.some(p => text.startsWith(p))) return null
  if (text.startsWith('# Context from my IDE setup:')) {
    const idx = text.indexOf(CODEX_REQUEST_MARKER)
    if (idx < 0) return null // IDE context with no request — skip
    return text.slice(idx + CODEX_REQUEST_MARKER.length).trim() || null
  }
  return text
}

/** Parse tool-call arguments — Codex encodes them as a JSON string. */
function parseArgsJson(raw: string | undefined): Record<string, unknown> | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw)
    return isRecord(parsed) ? parsed : undefined
  } catch { return undefined }
}

/** Extract an output string from a function_call_output payload.
 *  Codex sometimes encodes output as a JSON object with nested .output. */
function extractOutputString(raw: unknown): string {
  if (typeof raw === 'string') {
    // May itself be a JSON envelope: try to unwrap .output
    try {
      const parsed = JSON.parse(raw)
      if (isRecord(parsed) || Array.isArray(parsed)) return extractOutputString(parsed)
    } catch { /* raw string, return as-is */ }
    return raw
  }
  if (isRecord(raw) && typeof raw.output === 'string') return raw.output
  if (Array.isArray(raw)) return raw.map(value => typeof value === 'string' ? value : isRecord(value) && typeof value.text === 'string' ? value.text : '').filter(Boolean).join('\n')
  if (isRecord(raw) && Array.isArray(raw.content)) return extractOutputString(raw.content)
  if (isRecord(raw)) return JSON.stringify(raw)
  return ''
}

function codexOutputFailed(raw: unknown, text: string): boolean {
  const envelope = typeof raw === 'string' ? parseArgsJson(raw) : isRecord(raw) ? raw : undefined
  if (typeof envelope?.isError === 'boolean') return envelope.isError
  const metadata = isRecord(envelope?.metadata) ? envelope.metadata : undefined
  const exitCode = envelope?.exit_code ?? metadata?.exit_code
  if (typeof exitCode === 'number') return exitCode !== 0
  const exits = Array.from(text.matchAll(/Process exited with code\s+(-?\d+)/gi), match => Number(match[1]))
  if (exits.length) return exits.some(code => code !== 0)
  return detectError(text)
}

/** Pull the first "*** Update File: /path" line out of an apply_patch body. */
function extractPatchFilePath(patch: string): string | undefined {
  const m = patch.match(/^\*\*\* (?:Update File|Add File|Delete File):\s*(.+)$/m)
  return m ? m[1].trim() : undefined
}

// ─── Parser ────────────────────────────────────────────────────────────────

export class CodexRolloutParser {
  private firstTimestamp: number | null = null
  private recordElapsed: number | null = null
  constructor(private delegate: CodexParserDelegate) {}

  private elapsed(): number { return this.recordElapsed ?? this.delegate.elapsed() }

  /** Parse a single JSONL line. Silently skips unparseable/unknown lines. */
  processLine(line: string, state: CodexRolloutState): void {
    const trimmed = line.trim()
    if (!trimmed) return

    let record: RolloutRecord
    try { record = JSON.parse(trimmed) as RolloutRecord }
    catch { return /* partial line at file tail; resume on next read */ }

    const timestamp = typeof record.timestamp === 'string' ? Date.parse(record.timestamp) : NaN
    if (Number.isFinite(timestamp)) {
      this.firstTimestamp ??= timestamp
      this.recordElapsed = Math.max(0, (timestamp - this.firstTimestamp) / 1000)
    } else {
      this.recordElapsed = null
    }

    this.ensureSpawned(state)

    switch (record.type) {
      case 'session_meta':
        return this.handleSessionMeta(record.payload as SessionMetaPayload, state)
      case 'turn_context':
        return this.handleTurnContext(record.payload as TurnContextPayload, state)
      case 'response_item':
        return this.handleResponseItem(record.payload, state)
      case 'event_msg':
        return this.handleEventMsg(record.payload, state)
      case 'compacted':
        return this.handleCompacted(record.payload as CompactedPayload, state)
      // Ignore unknown types (forward-compatible).
    }
  }

  // ─── Orchestrator lifecycle ──────────────────────────────────────────────

  private ensureSpawned(state: CodexRolloutState): void {
    if (state.spawnEmitted) return
    state.spawnEmitted = true
    this.delegate.emit({
      time: this.elapsed(),
      type: 'agent_spawn',
      payload: { name: ORCHESTRATOR_NAME, isMain: true, task: 'Codex session', runtime: 'codex' },
    })
  }

  // ─── session_meta ────────────────────────────────────────────────────────

  private handleSessionMeta(payload: SessionMetaPayload | undefined, state: CodexRolloutState): void {
    if (!payload) return
    if (typeof payload.cwd === 'string') state.cwd = payload.cwd
    // Estimate system-prompt tokens from base_instructions if present
    const sys = payload.base_instructions?.text
    if (typeof sys === 'string' && sys.length > 0) {
      state.contextBreakdown.systemPrompt = Math.max(
        estimateTokensFromText(sys),
        SYSTEM_PROMPT_BASE_TOKENS,
      )
    }
    this.emitContextUpdate(state)
  }

  // ─── turn_context ────────────────────────────────────────────────────────

  private handleTurnContext(payload: TurnContextPayload | undefined, state: CodexRolloutState): void {
    if (!payload) return
    if (typeof payload.cwd === 'string') state.cwd = payload.cwd
    if (typeof payload.model === 'string' && payload.model !== state.lastEmittedModel) {
      state.model = payload.model
      state.lastEmittedModel = payload.model
      this.delegate.emit({
        time: this.elapsed(),
        type: 'model_detected',
        payload: { agent: ORCHESTRATOR_NAME, model: payload.model },
      })
    }
  }

  // ─── response_item ───────────────────────────────────────────────────────

  private handleResponseItem(payload: unknown, state: CodexRolloutState): void {
    if (!isRecord(payload)) return
    const itemType = payload.type
    switch (itemType) {
      case 'message':
        return this.handleMessage(payload as MessagePayload, state)
      case 'agent_message':
        return this.handleSubagentMessage(payload, state)
      case 'reasoning': {
        const summary = flattenContent(payload.summary as MessageContent[] | undefined)
        const content = flattenContent(payload.content as MessageContent[] | undefined)
        return this.handleReasoningStatus(summary || content, state)
      }
      case 'function_call':
        return this.handleFunctionCall(payload as FunctionCallPayload, state)
      case 'function_call_output':
        return this.handleFunctionCallOutput(payload as FunctionCallOutputPayload, state)
      case 'custom_tool_call':
        return this.handleCustomToolCall(payload as CustomToolCallPayload, state)
      case 'custom_tool_call_output':
        return this.handleCustomToolCallOutput(payload as CustomToolCallOutputPayload, state)
      case 'web_search_call':
        return this.handleWebSearchCall(payload as WebSearchCallPayload, state)
    }
  }

  private handleMessage(payload: MessagePayload, state: CodexRolloutState): void {
    const role = payload.role
    if (role !== 'user' && role !== 'assistant') return // skip 'developer' and other injected roles

    const rawText = flattenContent(payload.content)
    if (!rawText) return

    if (role === 'user' && rawText.includes('<send_user_message_question_reply>')) {
      const body = rawText.match(/<send_user_message_question_reply>\s*([\s\S]*?)\s*<\/send_user_message_question_reply>/)?.[1]
      try {
        const replies: unknown = JSON.parse(body || 'null')
        if (Array.isArray(replies)) for (const reply of replies) {
          if (typeof reply?.questionItemId !== 'string') continue
          const route: unknown = JSON.parse(reply.questionItemId)
          if (Array.isArray(route) && typeof route[1] === 'string' && Number.isInteger(route[2])) {
            const pending = state.pendingUserInputs.get(route[1])
            if (!pending || route[2] < 0 || route[2] >= pending.count) continue
            pending.answered.add(route[2])
            if (pending.answered.size >= pending.count) this.resolveUserInput(route[1], state)
          }
        }
      } catch { /* Incomplete or malformed reply metadata is not a new prompt. */ }
      return
    }

    // Codex wraps real user prompts inside IDE-context blocks; extract the
    // actual prompt and skip pure injection messages entirely.
    const text = role === 'user' ? extractCodexUserText(rawText) : rawText
    if (!text) return

    const hash = `${role}:${createHash('sha256').update(text).digest('hex')}`
    if (state.seenMessageHashes.has(hash)) return
    state.seenMessageHashes.add(hash)

    if (role === 'user') {
      state.contextBreakdown.userMessages += estimateTokensFromText(text)
      if (!state.label) {
        state.label = text.slice(0, PREVIEW_MAX)
        this.delegate.setLabel?.(state.label)
      }
    }

    this.delegate.emit({
      time: this.elapsed(),
      type: 'message',
      payload: {
        agent: ORCHESTRATOR_NAME,
        role,
        content: text.slice(0, MESSAGE_MAX),
      },
    })
    this.emitContextUpdate(state)
  }

  private handleFunctionCall(payload: FunctionCallPayload, state: CodexRolloutState): void {
    const name = payload.name || 'unknown'
    const callId = payload.call_id
    if (!callId || state.seenToolCalls.has(callId)) return
    state.seenToolCalls.add(callId)

    const args = parseArgsJson(payload.arguments)
    const argsSummary = summarizeInput(name, args)
    const filePath = extractFilePath(args)

    state.pendingToolCalls.set(callId, {
      name, args: argsSummary, startTime: Date.now(), filePath,
      ...(name.split('.').pop() === 'spawn_agent' && args ? {
        spawn: { task: String(args.message || args.prompt || '').slice(0, MESSAGE_MAX),
          model: typeof args.model === 'string' ? args.model : undefined },
      } : {}),
      ...(['followup_task', 'send_message'].includes(name.split('.').pop() || '') && typeof args?.target === 'string' ? {
        dispatch: { target: args.target, task: String(args.message || '').slice(0, MESSAGE_MAX), activate: name.split('.').pop() === 'followup_task' },
      } : {}),
    })

    this.delegate.emit({
      time: this.elapsed(),
      type: 'tool_call_start',
      payload: {
        agent: ORCHESTRATOR_NAME,
        tool: name,
        callId,
        args: argsSummary,
        preview: `${name}: ${argsSummary}`.slice(0, PREVIEW_MAX),
        inputData: extractInputData(name, args ?? {}),
      },
    })
    const tool = name.split('.').pop()
    if (tool === 'request_user_input' || tool === 'request_user_input_async') {
      const blocking = tool === 'request_user_input'
      state.pendingUserInputs.set(callId, { blocking, count: Array.isArray(args?.questions) ? Math.max(1, args.questions.length) : 1, answered: new Set() })
      this.delegate.emit({ time: this.elapsed(), type: 'input_requested', payload: { agent: ORCHESTRATOR_NAME, callId, blocking } })
    }
  }

  private resolveUserInput(callId: string, state: CodexRolloutState): void {
    if (!state.pendingUserInputs.delete(callId)) return
    this.delegate.emit({ time: this.elapsed(), type: 'input_resolved', payload: { agent: ORCHESTRATOR_NAME, callId } })
  }

  private handleFunctionCallOutput(payload: FunctionCallOutputPayload, state: CodexRolloutState): void {
    const callId = payload.call_id
    if (!callId) return
    const pending = state.pendingToolCalls.get(callId)
    if (!pending) return
    state.pendingToolCalls.delete(callId)

    const output = extractOutputString(payload.output)
    if (pending.dispatch && !codexOutputFailed(payload.output, output)) {
      this.dispatchToExistingAgent(pending.dispatch.target, pending.dispatch.task, pending.dispatch.activate, state)
    }
    if (pending.spawn) {
      const result = parseArgsJson(output)
      const child = result?.task_name || result?.agent_id || result?.id
      if (typeof child === 'string' && !state.agents.has(child)) {
        state.agents.add(child)
        this.delegate.emit({ time: this.elapsed(), type: 'subagent_dispatch',
          payload: { parent: ORCHESTRATOR_NAME, child, task: pending.spawn.task } })
        this.delegate.emit({ time: this.elapsed(), type: 'agent_spawn',
          payload: { name: child, parent: ORCHESTRATOR_NAME, task: pending.spawn.task,
            model: pending.spawn.model, runtime: 'codex' } })
        this.delegate.emit({ time: this.elapsed(), type: 'agent_thinking', payload: { name: child } })
      }
    }
    const resultSummary = summarizeResult(output).slice(0, RESULT_MAX)
    const tokenCost = estimateTokenCost(pending.name, output)
    state.contextBreakdown.toolResults += tokenCost

    const isError = codexOutputFailed(payload.output, output)
    const discovery = buildDiscovery(pending.name.split('.').pop() === 'apply_patch' ? 'Edit' : pending.name, pending.filePath, output)

    this.delegate.emit({
      time: this.elapsed(),
      type: 'tool_call_end',
      payload: {
        agent: ORCHESTRATOR_NAME,
        tool: pending.name,
        callId,
        result: resultSummary,
        tokenCost,
        ...(isError ? { isError: true, errorMessage: resultSummary } : {}),
        ...(discovery ? { discovery } : {}),
      },
    })
    const inputRequest = state.pendingUserInputs.get(callId)
    if (inputRequest && (inputRequest.blocking || isError || parseArgsJson(output)?.accepted !== true)) {
      this.resolveUserInput(callId, state)
    }
    this.emitContextUpdate(state)
  }

  private handleCustomToolCall(payload: CustomToolCallPayload, state: CodexRolloutState): void {
    const name = payload.name || 'unknown'
    const callId = payload.call_id
    if (!callId || state.seenToolCalls.has(callId)) return
    state.seenToolCalls.add(callId)

    // Custom tool input is a raw string (e.g. the full apply_patch body), not JSON.
    const rawInput = typeof payload.input === 'string' ? payload.input : ''
    const isPatch = name.split('.').pop() === 'apply_patch'
    const argsSummary = isPatch ? summarizeInput('apply_patch', { patch: rawInput }) : rawInput.slice(0, PREVIEW_MAX)
    const filePath = extractPatchFilePath(rawInput)

    state.pendingToolCalls.set(callId, {
      name, args: argsSummary, startTime: Date.now(), filePath,
    })

    this.delegate.emit({
      time: this.elapsed(),
      type: 'tool_call_start',
      payload: {
        agent: ORCHESTRATOR_NAME,
        tool: name,
        callId,
        args: argsSummary,
        preview: `${name}: ${argsSummary}`.slice(0, PREVIEW_MAX),
        inputData: isPatch ? {
          ...extractInputData('apply_patch', { patch: rawInput }),
          file_paths: Array.from(rawInput.matchAll(/^\*\*\* (?:Update File|Add File|Delete File):\s*(.+)$/gm), match => match[1].trim()),
        } : { code: rawInput.slice(0, MESSAGE_MAX) },
      },
    })
  }

  private handleCustomToolCallOutput(payload: CustomToolCallOutputPayload, state: CodexRolloutState): void {
    // Same shape as function_call_output for our purposes.
    this.handleFunctionCallOutput(payload, state)
  }

  private handleWebSearchCall(payload: WebSearchCallPayload, state: CodexRolloutState): void {
    const query = String(payload.action?.query || '')
    if (!query) return
    if (payload.id && state.seenToolCalls.has(payload.id)) return
    if (payload.id) state.seenToolCalls.add(payload.id)
    // Web search is self-contained — emit start + end together.
    this.delegate.emit({
      time: this.elapsed(),
      type: 'tool_call_start',
      payload: {
        agent: ORCHESTRATOR_NAME,
        tool: 'WebSearch',
        callId: payload.id,
        args: query,
        preview: `WebSearch: ${query}`.slice(0, PREVIEW_MAX),
        inputData: { query },
      },
    })
    this.delegate.emit({
      time: this.elapsed(),
      type: 'tool_call_end',
      payload: {
        agent: ORCHESTRATOR_NAME,
        tool: 'WebSearch',
        callId: payload.id,
        result: payload.status || 'completed',
        tokenCost: 0,
      },
    })
  }

  // ─── event_msg ───────────────────────────────────────────────────────────

  private dispatchToExistingAgent(target: string, task: string, activate: boolean, state: CodexRolloutState): void {
    const child = state.agents.has(target) ? target
      : Array.from(state.agents).find(name => name.endsWith(`/${target}`)) || target
    state.agents.add(child)
    // Re-spawn is an activation signal in the renderer: it preserves stats
    // while bringing back a child faded out after the previous turn/session.
    if (activate) this.delegate.emit({ time: this.elapsed(), type: 'agent_spawn',
      payload: { name: child, parent: ORCHESTRATOR_NAME, task, runtime: 'codex' } })
    this.delegate.emit({ time: this.elapsed(), type: 'subagent_dispatch',
      payload: { parent: ORCHESTRATOR_NAME, child, task, notification: !activate } })
    if (activate) this.delegate.emit({ time: this.elapsed(), type: 'agent_thinking', payload: { name: child } })
  }

  private handleSubagentMessage(payload: Record<string, unknown>, state: CodexRolloutState): void {
    const author = typeof payload.author === 'string' ? payload.author : ''
    // Only attribute messages from known spawned agents. Other records can
    // carry internal routing metadata and are not user-facing conversations.
    if (!state.agents.has(author)) return
    const text = flattenContent(payload.content as MessageContent[] | string | undefined)
    if (!text) return
    const isProgress = /^Message Type: MESSAGE\r?\n/.test(text)
    const isFinal = /^Message Type: FINAL_ANSWER\r?\n/.test(text)
    const marker = text.indexOf('Payload:')
    const content = (isProgress || isFinal) && marker >= 0 ? text.slice(marker + 'Payload:'.length).trim() : text
    this.delegate.emit({ time: this.elapsed(), type: 'message',
      payload: { agent: author, role: 'assistant', content: content.slice(0, MESSAGE_MAX) } })
    if (isProgress) {
      this.delegate.emit({ time: this.elapsed(), type: 'agent_thinking', payload: { name: author } })
      return
    }
    this.delegate.emit({ time: this.elapsed(), type: 'subagent_return',
      payload: { child: author, parent: ORCHESTRATOR_NAME, summary: content.slice(0, PREVIEW_MAX), received: true } })
    this.delegate.emit({ time: this.elapsed(), type: isFinal ? 'agent_complete' : 'agent_idle', payload: { name: author, state: 'idle' } })
  }

  private handleEventMsg(payload: unknown, state: CodexRolloutState): void {
    if (!isRecord(payload)) return
    switch (payload.type) {
      case 'task_started':
        state.turnActive = true
        state.seenMessageHashes.clear()
        this.delegate.emit({ time: this.elapsed(), type: 'agent_spawn',
          payload: { name: ORCHESTRATOR_NAME, isMain: true, runtime: 'codex' } })
        this.delegate.emit({ time: this.elapsed(), type: 'agent_thinking', payload: { name: ORCHESTRATOR_NAME } })
        return
      case 'task_complete':
      case 'turn_aborted':
        if (payload.type === 'turn_aborted') for (const callId of state.pendingUserInputs.keys()) this.resolveUserInput(callId, state)
        state.turnActive = false
        this.delegate.emit({ time: this.elapsed(), type: 'agent_idle', payload: { name: ORCHESTRATOR_NAME, state: 'idle', aborted: payload.type === 'turn_aborted' } })
        return
      case 'item_completed': {
        const item = payload.item
        if (!isRecord(item)) return
        if (item.type !== 'Reasoning') return this.handleCompletedToolItem(item, state)
        const text = [item.summary_text, item.raw_content].map(parts =>
          Array.isArray(parts) ? parts.filter(p => typeof p === 'string').join('\n') : '',
        ).find(Boolean) || ''
        return this.handleReasoningStatus(text, state)
      }
      case 'agent_reasoning':
        return this.handleReasoningStatus(typeof payload.text === 'string' ? payload.text : '', state)
      case 'token_count':
        return this.handleTokenCount(payload, state)
      // Other event_msg types are either mirrors of response_item content
      // (agent_message, user_message, exec_command_end, patch_apply_end) or
      // metadata we don't currently surface (context_compacted, paired with the
      // top-level `compacted` record which we handle authoritatively).
    }
  }

  /** Codex reports authoritative token usage per turn. Prefer it over our
   *  text-length estimates whenever info is populated.
   *
   *  - `last_token_usage.input_tokens` = size of this turn's prompt = current
   *    context fill (what the gauge should show).
   *  - `total_token_usage.input_tokens` = cumulative across the session — used
   *    for billing, not context fill.
   *  - `model_context_window` = authoritative tokensMax for this model. */
  private handleTokenCount(payload: Record<string, unknown>, state: CodexRolloutState): void {
    const info = payload.info
    if (!isRecord(info)) return

    if (typeof info.model_context_window === 'number' && info.model_context_window > 0) {
      state.reportedContextWindow = info.model_context_window
    }

    const last = info.last_token_usage
    if (isRecord(last) && typeof last.input_tokens === 'number' && last.input_tokens > 0) {
      state.lastReportedTokens = last.input_tokens
      const reasoning = typeof last.reasoning_output_tokens === 'number' ? last.reasoning_output_tokens : 0
      // Re-slice the breakdown so it sums to the authoritative total.
      // Codex doesn't expose user/tool split, so bucket everything non-reasoning
      // under toolResults as a catch-all (systemPrompt is estimated from
      // base_instructions and kept constant).
      state.contextBreakdown.reasoning = reasoning
      state.contextBreakdown.userMessages = 0
      state.contextBreakdown.subagentResults = 0
      state.contextBreakdown.toolResults = Math.max(
        0,
        last.input_tokens - state.contextBreakdown.systemPrompt - reasoning,
      )
    }

    this.emitContextUpdate(state, { authoritative: true })
  }

  private handleAgentReasoning(payload: Record<string, unknown>, state: CodexRolloutState): void {
    const text = typeof payload.text === 'string' ? payload.text.trim() : ''
    if (!text) return

    const hash = `thinking:${createHash('sha256').update(text).digest('hex')}`
    if (state.seenMessageHashes.has(hash)) return
    state.seenMessageHashes.add(hash)

    if (!payload.isStatus) state.contextBreakdown.reasoning += estimateTokensFromText(text)
    this.delegate.emit({
      time: this.elapsed(),
      type: 'message',
      payload: {
        agent: ORCHESTRATOR_NAME,
        role: 'thinking',
        content: text.slice(0, MESSAGE_MAX),
        ...(payload.isStatus ? { isStatus: true } : {}),
      },
    })
    this.emitContextUpdate(state)
  }

  private handleReasoningStatus(text: string, state: CodexRolloutState): void {
    this.delegate.emit({ time: this.elapsed(), type: 'agent_thinking', payload: { name: ORCHESTRATOR_NAME } })
    // Match Claude's redacted-thinking placeholder. This is an activity label,
    // not inferred reasoning, and must not contribute estimated tokens.
    this.handleAgentReasoning({ text: text.trim() || 'Thinking...', isStatus: !text.trim() }, state)
  }

  /** Code-mode tools emit structured inner-tool records in addition to the
   * outer JavaScript call. Surface those details without executing the code or
   * charging their mirrored output to the model context a second time. */
  private handleCompletedToolItem(item: Record<string, unknown>, state: CodexRolloutState): void {
    const callId = typeof item.id === 'string' ? item.id : ''
    if (!callId || state.seenToolCalls.has(callId)) return
    let tool: string
    let inputData: Record<string, unknown>
    let args: string
    let output: string
    switch (item.type) {
      case 'CommandExecution':
        tool = 'exec_command'
        inputData = { command: String(item.command || ''), workdir: item.cwd }
        args = String(item.command || '').slice(0, PREVIEW_MAX)
        output = String(item.aggregated_output || '')
        break
      case 'FileChange': {
        if (!isRecord(item.changes)) return
        const paths = Object.keys(item.changes)
        tool = 'apply_patch'
        inputData = { file_paths: paths, patch: paths.map(file => {
          const change = item.changes as Record<string, unknown>
          const details = isRecord(change[file]) ? change[file] : {}
          const kind = String(details.type || '').toLowerCase()
          const operation = kind === 'add' ? 'Add File' : kind === 'delete' ? 'Delete File' : 'Update File'
          return `*** ${operation}: ${file}\n${String(details.unified_diff || '')}`
        }).join('\n').slice(0, MESSAGE_MAX) }
        args = paths.join(', ').slice(0, PREVIEW_MAX)
        output = typeof item.stdout === 'string' && item.stdout ? item.stdout : `Changed ${paths.length} file(s)`
        break
      }
      case 'WebSearch':
        tool = 'WebSearch'
        args = String(item.query || '').slice(0, PREVIEW_MAX)
        inputData = { query: args }
        output = 'Search completed'
        break
      case 'McpToolCall':
        tool = `${String(item.server || 'mcp')}.${String(item.tool || 'tool')}`
        inputData = isRecord(item.arguments) ? item.arguments : parseArgsJson(String(item.arguments || '')) || {}
        args = JSON.stringify(inputData).slice(0, PREVIEW_MAX)
        output = extractOutputString(item.result)
        break
      default: return
    }
    // Legacy direct calls already have a richer start/end pair. These native
    // records are useful for inner tools otherwise hidden inside exec.
    if (Array.from(state.pendingToolCalls.values()).some(p => p.name.split('.').pop() === tool)) return
    state.seenToolCalls.add(callId)
    const isError = item.status === 'failed' || (typeof item.exit_code === 'number' && item.exit_code !== 0)
      || (isRecord(item.result) && item.result.isError === true)
    this.delegate.emit({ time: this.elapsed(), type: 'tool_call_start', payload: {
      agent: ORCHESTRATOR_NAME, tool, callId, args, inputData,
    } })
    this.delegate.emit({ time: this.elapsed(), type: 'tool_call_end', payload: {
      agent: ORCHESTRATOR_NAME, tool, callId, result: output.slice(0, RESULT_MAX),
      ...(isError ? { isError: true, errorMessage: output.slice(0, RESULT_MAX) } : {}),
    } })
  }

  // ─── compacted ───────────────────────────────────────────────────────────

  private handleCompacted(payload: CompactedPayload | undefined, state: CodexRolloutState): void {
    if (!payload) return
    // After compaction, the model's working context is limited to
    // replacement_history. Recompute userMessages/reasoning token totals
    // from that new baseline; keep systemPrompt.
    let userTokens = 0
    let toolResultTokens = 0
    for (const entry of payload.replacement_history ?? []) {
      if (entry?.role === 'user') {
        userTokens += estimateTokensFromText(flattenContent(entry.content))
      } else if (entry?.role === 'tool' || entry?.type === 'tool_result') {
        toolResultTokens += estimateTokensFromText(flattenContent(entry.content))
      }
    }
    state.contextBreakdown.userMessages = userTokens
    state.contextBreakdown.toolResults = toolResultTokens
    state.contextBreakdown.reasoning = 0
    state.contextBreakdown.subagentResults = 0
    state.lastReportedTokens = null
    // systemPrompt stays — it's the base instructions, still counted.
    this.emitContextUpdate(state)
    log.info('Context compacted — token breakdown reset from replacement_history')
  }

  // ─── Shared helpers ──────────────────────────────────────────────────────

  private emitContextUpdate(
    state: CodexRolloutState,
    opts: { authoritative?: boolean } = {},
  ): void {
    const bd = state.contextBreakdown
    const estimated = bd.systemPrompt + bd.userMessages + bd.toolResults + bd.reasoning + bd.subagentResults
    // Prefer the authoritative total from event_msg.token_count when available.
    const tokens = state.lastReportedTokens ?? estimated
    // Flag events where Codex just reported token_count so the UI can smooth
    // the estimate→authoritative transition instead of jumping. Non-authoritative
    // updates still ride on lastReportedTokens once it's been set, but the
    // breakdown itself is our estimate until the next token_count arrives.
    this.delegate.emit({
      time: this.elapsed(),
      type: 'context_update',
      payload: {
        agent: ORCHESTRATOR_NAME,
        tokens,
        breakdown: { ...bd },
        ...(state.reportedContextWindow ? { tokensMax: state.reportedContextWindow } : {}),
        ...(opts.authoritative ? { isAuthoritative: true } : {}),
      },
    })
  }
}
