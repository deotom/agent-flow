/**
 * Unit tests for CodexRolloutParser.
 *
 * Feeds a hand-crafted rollout fixture through the parser and asserts the
 * resulting event stream and final state. The fixture covers every supported
 * record type plus the tricky edge cases (IDE-wrapper extraction, pure-injection
 * filtering, developer-role skip, partial/malformed lines, unknown types, token
 * count authority, compaction reset).
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  CodexRolloutParser,
  createCodexRolloutState,
  type CodexParserDelegate,
} from '../src/codex-rollout-parser'
import type { AgentEvent } from '../src/protocol'

/** Run the sample fixture through the parser, returning all emitted events
 *  and the final rollout state. */
function runFixture() {
  const file = path.join(__dirname, 'fixtures', 'codex-rollout-sample.jsonl')
  const lines = fs.readFileSync(file, 'utf-8').split('\n')
  const events: AgentEvent[] = []
  const labels: string[] = []
  const delegate: CodexParserDelegate = {
    emit: (e) => events.push(e),
    elapsed: () => 0,
    setLabel: (l) => labels.push(l),
  }
  const parser = new CodexRolloutParser(delegate)
  const state = createCodexRolloutState()
  for (const line of lines) parser.processLine(line, state)
  return { events, labels, state }
}

describe('CodexRolloutParser', () => {
  it('distinguishes progress from a child final answer and does not start a turn for send_message', () => {
    const events: AgentEvent[] = []
    const parser = new CodexRolloutParser({ emit: e => events.push(e), elapsed: () => 0 })
    const state = createCodexRolloutState()
    state.agents.add('/root/reviewer')
    const record = (payload: unknown) => parser.processLine(JSON.stringify({ type: 'response_item', payload }), state)
    record({ type: 'agent_message', author: '/root/reviewer', content: [{ type: 'text', text: 'Message Type: MESSAGE\nTask name: /root\nSender: /root/reviewer\nPayload:\nStill checking' }] })
    assert.equal(events.at(-1)?.type, 'agent_thinking')
    assert.ok(events.some(e => e.payload.content === 'Still checking'))
    assert.ok(!events.some(e => e.type === 'subagent_return'))
    record({ type: 'agent_message', author: '/root/reviewer', content: [{ type: 'text', text: 'Message Type: FINAL_ANSWER\nTask name: /root\nSender: /root/reviewer\nPayload:\nReview done' }] })
    assert.equal(events.at(-1)?.type, 'agent_complete')
    assert.equal(events.find(e => e.type === 'subagent_return')?.payload.received, true)
    events.length = 0
    record({ type: 'function_call', name: 'send_message', call_id: 'notify', arguments: JSON.stringify({ target: 'reviewer', message: 'Thanks' }) })
    record({ type: 'function_call_output', call_id: 'notify', output: '' })
    assert.ok(events.some(e => e.type === 'subagent_dispatch'))
    assert.ok(!events.some(e => e.type === 'agent_thinking' || (e.type === 'agent_spawn' && e.payload.name === '/root/reviewer')))
  })

  it('uses an explicit exit code instead of classifying passing test output as a failure', () => {
    const events: AgentEvent[] = []
    const parser = new CodexRolloutParser({ emit: e => events.push(e), elapsed: () => 0 })
    const state = createCodexRolloutState()
    for (const payload of [
      { type: 'function_call', name: 'exec_command', call_id: 'tests', arguments: '{"cmd":"npm test"}' },
      { type: 'function_call_output', call_id: 'tests', output: JSON.stringify({ output: 'Tests: 57 passed, 0 failed', exit_code: 0 }) },
    ]) parser.processLine(JSON.stringify({ type: 'response_item', payload }), state)
    assert.equal(events.find(e => e.type === 'tool_call_end')?.payload.isError, undefined)
  })

  it('reactivates canonical child agents when followup_task uses short names and an empty success output', () => {
    const events: AgentEvent[] = []
    const parser = new CodexRolloutParser({ emit: e => events.push(e), elapsed: () => 0 })
    const state = createCodexRolloutState()
    state.agents.add('/root/remaining_reads_round2')
    for (const payload of [
      { type: 'function_call', name: 'collaboration.followup_task', call_id: 'resume-child', arguments: JSON.stringify({ target: 'remaining_reads_round2', message: 'Continue reviewing' }) },
      { type: 'function_call_output', call_id: 'resume-child', output: '' },
    ]) parser.processLine(JSON.stringify({ type: 'response_item', payload }), state)
    assert.ok(events.some(e => e.type === 'agent_spawn' && e.payload.name === '/root/remaining_reads_round2'))
    assert.ok(events.some(e => e.type === 'subagent_dispatch' && e.payload.child === '/root/remaining_reads_round2'))
    assert.ok(events.some(e => e.type === 'agent_thinking' && e.payload.name === '/root/remaining_reads_round2'))
    assert.equal(state.agents.size, 1)
  })

  it('surfaces native inner commands and changed files while avoiding direct-call mirrors', () => {
    const events: AgentEvent[] = []
    const parser = new CodexRolloutParser({ emit: e => events.push(e), elapsed: () => 0 })
    const state = createCodexRolloutState()
    const record = (type: string, payload: unknown) => parser.processLine(JSON.stringify({ type, payload }), state)
    const command = { type: 'item_completed', item: { type: 'CommandExecution', id: 'inner-cmd', command: 'npm test', aggregated_output: 'Pattern not found', status: 'completed', exit_code: 0 } }
    record('event_msg', command)
    record('event_msg', command)
    assert.equal(events.filter(e => e.type === 'tool_call_start').length, 1)
    assert.equal(events.find(e => e.type === 'tool_call_end')?.payload.isError, undefined)
    record('event_msg', { type: 'item_completed', item: { type: 'FileChange', id: 'inner-patch', status: 'completed', changes: {
      'first.ts': { type: 'update', unified_diff: '-old\n+new' }, 'second.ts': { type: 'update', unified_diff: '+line' },
    } } })
    const patch = events.find(e => e.type === 'tool_call_start' && e.payload.tool === 'apply_patch')!
    assert.deepEqual((patch.payload.inputData as Record<string, unknown>).file_paths, ['first.ts', 'second.ts'])
    record('response_item', { type: 'function_call', name: 'exec_command', call_id: 'direct', arguments: '{"cmd":"pwd"}' })
    record('event_msg', { type: 'item_completed', item: { type: 'CommandExecution', id: 'mirror', command: 'pwd', status: 'completed' } })
    assert.equal(events.filter(e => e.type === 'tool_call_start').length, 3)
  })

  it('signals thinking at turn start and shows a status for encrypted-only reasoning', () => {
    const events: AgentEvent[] = []
    const parser = new CodexRolloutParser({ emit: e => events.push(e), elapsed: () => 0 })
    const state = createCodexRolloutState()
    const record = (type: string, payload: unknown) => parser.processLine(JSON.stringify({ type, payload }), state)
    record('event_msg', { type: 'task_started' })
    assert.equal(events.at(-1)?.type, 'agent_thinking')
    record('response_item', { type: 'reasoning', summary: [], content: [], encrypted_content: 'not-plaintext' })
    record('event_msg', { type: 'item_completed', item: { type: 'Reasoning', summary_text: [], raw_content: [] } })
    const status = events.filter(e => e.type === 'message' && e.payload.role === 'thinking')
    assert.equal(status.length, 1)
    assert.equal(status[0].payload.content, 'Thinking...')
    assert.equal(status[0].payload.isStatus, true)
    assert.equal(state.contextBreakdown.reasoning, 0)
    record('event_msg', { type: 'task_complete' })
    assert.equal(events.at(-1)?.type, 'agent_idle')
    assert.equal(events.at(-1)?.payload.state, 'idle')
  })

  it('reads plaintext Reasoning item summaries without duplicating their mirrored message', () => {
    const events: AgentEvent[] = []
    const parser = new CodexRolloutParser({ emit: e => events.push(e), elapsed: () => 0 })
    const state = createCodexRolloutState()
    for (const payload of [
      { type: 'item_completed', item: { type: 'Reasoning', summary_text: ['Check session lifecycle'], raw_content: [] } },
      { type: 'agent_reasoning', text: 'Check session lifecycle' },
    ]) parser.processLine(JSON.stringify({ type: 'event_msg', payload }), state)
    assert.equal(events.filter(e => e.payload.content === 'Check session lifecycle').length, 1)
    assert.ok(state.contextBreakdown.reasoning > 0)
  })

  it('keeps repeated follow-ups in different turns and distinct long messages', () => {
    const events: AgentEvent[] = []
    const parser = new CodexRolloutParser({ emit: e => events.push(e), elapsed: () => 0 })
    const state = createCodexRolloutState()
    const record = (type: string, payload: unknown) => parser.processLine(JSON.stringify({ type, payload }), state)
    for (let i = 0; i < 2; i++) {
      record('event_msg', { type: 'task_started' })
      record('response_item', { type: 'message', role: 'user', content: 'continue' })
      record('response_item', { type: 'message', role: 'user', content: 'continue' })
    }
    assert.equal(events.filter(e => e.payload.content === 'continue').length, 2)
    for (const suffix of ['first', 'second']) {
      record('response_item', { type: 'message', role: 'user', content: 'x'.repeat(300) + suffix })
    }
    assert.equal(events.filter(e => String(e.payload.content).startsWith('xxx')).length, 2)
  })

  it('preserves historical event times and displays custom JavaScript execution input', () => {
    const events: AgentEvent[] = []
    const parser = new CodexRolloutParser({ emit: e => events.push(e), elapsed: () => 999 })
    const state = createCodexRolloutState()
    parser.processLine(JSON.stringify({ timestamp: '2020-01-01T00:00:00Z', type: 'session_meta', payload: {} }), state)
    parser.processLine(JSON.stringify({ timestamp: '2020-01-01T00:00:12Z', type: 'response_item', payload: {
      type: 'custom_tool_call', name: 'functions.exec', call_id: 'code-1', input: 'const result = await tools.exec_command({cmd: "ls"});\ntext(result);',
    } }), state)
    const start = events.find(e => e.type === 'tool_call_start')!
    assert.equal(start.time, 12)
    assert.equal(start.payload.callId, 'code-1')
    assert.ok(String((start.payload.inputData as Record<string, unknown>).code).includes('exec_command'))
  })

  it('creates a Codex child from a successful spawn result and routes its messages', () => {
    const events: AgentEvent[] = []
    const parser = new CodexRolloutParser({ emit: e => events.push(e), elapsed: () => 0 })
    const state = createCodexRolloutState()
    const record = (payload: unknown) => parser.processLine(JSON.stringify({ type: 'response_item', payload }), state)
    record({ type: 'function_call', name: 'collaboration.spawn_agent', call_id: 'spawn-1',
      arguments: JSON.stringify({ message: 'Review the fix', model: 'test-model' }) })
    record({ type: 'function_call_output', call_id: 'spawn-1', output: JSON.stringify({ task_name: '/root/review' }) })
    record({ type: 'agent_message', author: '/root/review', recipient: '/root', content: [{ type: 'text', text: 'Review complete' }] })
    const child = events.find(e => e.type === 'agent_spawn' && e.payload.name === '/root/review')!
    assert.equal(child.payload.parent, 'orchestrator')
    assert.equal(child.payload.model, 'test-model')
    assert.equal(child.payload.runtime, 'codex')
    assert.ok(events.some(e => e.type === 'message' && e.payload.agent === '/root/review' && e.payload.content === 'Review complete'))
    assert.ok(events.some(e => e.type === 'subagent_return' && e.payload.child === '/root/review'))
  })

  it('emits agent_spawn exactly once on the first record', () => {
    const { events } = runFixture()
    const spawns = events.filter(e => e.type === 'agent_spawn')
    assert.equal(spawns.length, 1)
    assert.equal(spawns[0].payload.isMain, true)
  })

  it('detects the model from turn_context (not session_meta)', () => {
    const { events, state } = runFixture()
    const detects = events.filter(e => e.type === 'model_detected')
    assert.equal(detects.length, 1)
    assert.equal(detects[0].payload.model, 'gpt-5.3-codex')
    assert.equal(state.model, 'gpt-5.3-codex')
  })

  it('filters pure injections (AGENTS.md, environment_context) from user messages', () => {
    const { events } = runFixture()
    const userMessages = events.filter(
      e => e.type === 'message' && e.payload.role === 'user',
    )
    // 3 user messages in the fixture but 2 are pure injections; only the
    // "# Context from my IDE setup:" wrapped one survives.
    assert.equal(userMessages.length, 1)
    assert.equal(
      userMessages[0].payload.content,
      'List files in the current directory.',
    )
  })

  it('skips messages with the developer role', () => {
    const { events } = runFixture()
    const hasDeveloper = events.some(
      e => e.type === 'message' && e.payload.role === 'developer',
    )
    assert.equal(hasDeveloper, false)
  })

  it('extracts the assistant message', () => {
    const { events } = runFixture()
    const asst = events.filter(
      e => e.type === 'message' && e.payload.role === 'assistant',
    )
    assert.equal(asst.length, 1)
    assert.equal(asst[0].payload.content, 'Found 1 file: foo.ts')
  })

  it('emits reasoning from event_msg.agent_reasoning with role=thinking', () => {
    const { events } = runFixture()
    const thinking = events.filter(
      e => e.type === 'message' && e.payload.role === 'thinking',
    )
    assert.equal(thinking.length, 1)
    assert.equal(thinking[0].payload.content, '**Planning directory listing**')
  })

  it('pairs function_call with function_call_output by call_id', () => {
    const { events, state } = runFixture()
    const starts = events.filter(e => e.type === 'tool_call_start' && e.payload.tool === 'exec_command')
    const ends = events.filter(e => e.type === 'tool_call_end' && e.payload.tool === 'exec_command')
    assert.equal(starts.length, 1)
    assert.equal(ends.length, 1)
    assert.ok(!state.pendingToolCalls.has('call-exec-1'), 'pending should be cleared on output')
  })

  it('unwraps the nested JSON envelope in function_call_output', () => {
    const { events } = runFixture()
    const end = events.find(e => e.type === 'tool_call_end' && e.payload.tool === 'exec_command')
    assert.ok(end)
    // extractOutputString should unwrap { "output": "..." } to the raw text.
    assert.ok(String(end!.payload.result).includes('total 8'))
  })

  it('handles apply_patch via custom_tool_call with raw patch body', () => {
    const { events, state } = runFixture()
    const starts = events.filter(e => e.type === 'tool_call_start' && e.payload.tool === 'apply_patch')
    const ends = events.filter(e => e.type === 'tool_call_end' && e.payload.tool === 'apply_patch')
    assert.equal(starts.length, 1)
    assert.equal(ends.length, 1)
    assert.ok(!state.pendingToolCalls.has('call-patch-1'))
  })

  it('emits WebSearch as a self-contained start+end pair', () => {
    const { events } = runFixture()
    const starts = events.filter(e => e.type === 'tool_call_start' && e.payload.tool === 'WebSearch')
    const ends = events.filter(e => e.type === 'tool_call_end' && e.payload.tool === 'WebSearch')
    assert.equal(starts.length, 1)
    assert.equal(ends.length, 1)
    assert.equal(starts[0].payload.args, 'typescript release notes')
  })

  it('uses last_token_usage from token_count as authoritative context fill', () => {
    const { events, state } = runFixture()
    // The fixture subsequently compacts: its former authoritative total must
    // not override the smaller replacement context.
    assert.equal(state.lastReportedTokens, null)
    assert.ok(events.some(e => e.type === 'context_update' && e.payload.isAuthoritative && e.payload.tokens === 12000))
    assert.equal(state.reportedContextWindow, 258400)
    // Every context_update after the token_count carries the authoritative
    // tokensMax from model_context_window.
    const updates = events.filter(e => e.type === 'context_update')
    const last = updates[updates.length - 1]
    assert.ok(last)
    assert.equal(last.payload.tokensMax, 258400)
  })

  it('flags the context_update emitted from token_count as authoritative', () => {
    const { events } = runFixture()
    const updates = events.filter(e => e.type === 'context_update')
    const authoritative = updates.filter(e => e.payload.isAuthoritative === true)
    // Exactly one context_update carries the flag — the one emitted directly
    // from handleTokenCount. The UI uses this to smooth the estimate→authority
    // transition instead of jumping.
    assert.equal(authoritative.length, 1)
    assert.equal(authoritative[0].payload.tokens, 12000)
    // Non-authoritative updates must not leak the flag.
    const flagless = updates.filter(e => e.payload.isAuthoritative !== true)
    for (const e of flagless) assert.equal(e.payload.isAuthoritative, undefined)
  })

  it('resets the breakdown on a compacted record', () => {
    const { state, events } = runFixture()
    const recharges = events.filter(event => event.type === 'context_update' && event.payload.compacted === true)
    assert.equal(recharges.length, 1)
    assert.ok(typeof recharges[0].payload.tokens === 'number')
    // After compaction, reasoning + subagentResults should be zeroed.
    assert.equal(state.contextBreakdown.reasoning, 0)
    assert.equal(state.contextBreakdown.subagentResults, 0)
    // User tokens should reflect the replacement_history summary.
    assert.ok(state.contextBreakdown.userMessages > 0)
  })

  it('tolerates malformed lines and unknown top-level types', () => {
    // The fixture contains one non-JSON line and one unknown_future_type record.
    // Neither should throw or corrupt state; just flow through to the events
    // that follow from valid records.
    const { events } = runFixture()
    // We should still have at least one spawn + model_detected, proving
    // earlier records processed without the bad lines aborting the stream.
    assert.ok(events.some(e => e.type === 'agent_spawn'))
    assert.ok(events.some(e => e.type === 'model_detected'))
  })

  it('tool call counts balance: every start has a matching end', () => {
    const { state } = runFixture()
    // After the fixture, no pending tool calls should remain.
    assert.equal(state.pendingToolCalls.size, 0)
  })

  it('records the label from the first real user prompt', () => {
    const { labels, state } = runFixture()
    assert.ok(labels.length >= 1)
    assert.equal(state.label, 'List files in the current directory.')
  })

  it('only emits model_detected when the model changes', () => {
    // Feed the same turn_context.model twice and confirm a single emit.
    const events: AgentEvent[] = []
    const parser = new CodexRolloutParser({
      emit: (e) => events.push(e),
      elapsed: () => 0,
    })
    const state = createCodexRolloutState()
    const turn = JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-5.3-codex' } })
    parser.processLine(turn, state)
    parser.processLine(turn, state)
    const detects = events.filter(e => e.type === 'model_detected')
    assert.equal(detects.length, 1)
  })

  it('tolerates records arriving out of order (turn_context before session_meta)', () => {
    // If Codex ever writes turn_context as the first record, we should still
    // emit agent_spawn (once) and detect the model without crashing.
    const events: AgentEvent[] = []
    const parser = new CodexRolloutParser({ emit: (e) => events.push(e), elapsed: () => 0 })
    const state = createCodexRolloutState()
    parser.processLine(JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-5.3-codex' } }), state)
    parser.processLine(JSON.stringify({ type: 'session_meta', payload: { id: 's1', cwd: '/tmp/x' } }), state)
    const spawns = events.filter(e => e.type === 'agent_spawn')
    const detects = events.filter(e => e.type === 'model_detected')
    assert.equal(spawns.length, 1)
    assert.equal(detects.length, 1)
    assert.equal(detects[0].payload.model, 'gpt-5.3-codex')
  })

  it('leaves an orphaned tool call pending when the output never arrives', () => {
    // A transcript we're tailing mid-turn might have a function_call without
    // its matching function_call_output yet. The start event should emit, the
    // end should not, and the pending map should retain the call so the
    // eventual output still resolves it.
    const events: AgentEvent[] = []
    const parser = new CodexRolloutParser({ emit: (e) => events.push(e), elapsed: () => 0 })
    const state = createCodexRolloutState()
    parser.processLine(JSON.stringify({ type: 'session_meta', payload: { id: 's1', cwd: '/tmp/x' } }), state)
    parser.processLine(JSON.stringify({
      type: 'response_item',
      payload: { type: 'function_call', name: 'exec_command', arguments: '{"cmd":"ls"}', call_id: 'orphan-1' },
    }), state)
    const starts = events.filter(e => e.type === 'tool_call_start')
    const ends = events.filter(e => e.type === 'tool_call_end')
    assert.equal(starts.length, 1)
    assert.equal(ends.length, 0)
    assert.equal(state.pendingToolCalls.size, 1)
    assert.ok(state.pendingToolCalls.has('orphan-1'))
  })

  it('resets breakdown deterministically across an oversized compaction', () => {
    // Stress the compaction path with a large replacement_history to make
    // sure the per-entry loop doesn't overflow estimation buckets and that
    // non-user/non-tool entries don't leak into counts.
    const events: AgentEvent[] = []
    const parser = new CodexRolloutParser({ emit: (e) => events.push(e), elapsed: () => 0 })
    const state = createCodexRolloutState()
    // Pre-populate some noise in the breakdown so we can verify the reset.
    state.contextBreakdown.reasoning = 9999
    state.contextBreakdown.subagentResults = 8888

    const replacement_history = []
    for (let i = 0; i < 200; i++) {
      replacement_history.push({
        role: 'user',
        content: [{ type: 'input_text', text: `user message ${i} `.repeat(20) }],
      })
      replacement_history.push({
        role: 'tool',
        content: [{ type: 'output_text', text: `tool result ${i} `.repeat(20) }],
      })
      // Noise the handler should ignore — neither user nor tool.
      replacement_history.push({ role: 'assistant', content: [{ type: 'output_text', text: 'ignored' }] })
    }

    parser.processLine(JSON.stringify({ type: 'session_meta', payload: { id: 's1', cwd: '/tmp/x' } }), state)
    parser.processLine(JSON.stringify({ type: 'compacted', payload: { message: '', replacement_history } }), state)

    assert.equal(state.contextBreakdown.reasoning, 0)
    assert.equal(state.contextBreakdown.subagentResults, 0)
    assert.ok(state.contextBreakdown.userMessages > 0)
    assert.ok(state.contextBreakdown.toolResults > 0)
    // Sanity: the bucketed counts are finite and not NaN.
    assert.ok(Number.isFinite(state.contextBreakdown.userMessages))
    assert.ok(Number.isFinite(state.contextBreakdown.toolResults))
  })
})


it('tracks partial async replies, duplicates, blocking answers and cancellation independently', () => {
  const events: AgentEvent[] = []
  const parser = new CodexRolloutParser({ emit: e => events.push(e), elapsed: () => 0 })
  const state = createCodexRolloutState()
  const record = (payload: Record<string, unknown>, type = 'response_item') => parser.processLine(JSON.stringify({ type, payload }), state)
  const ask = (id: string, async = true, count = 1) => record({ type: 'function_call', name: `functions.request_user_input${async ? '_async' : ''}`, call_id: id, arguments: JSON.stringify({ questions: Array.from({ length: count }, () => ({ title: 'Choose', options: ['Yes', 'No'] })) }) })
  const output = (id: string, output: string) => record({ type: 'function_call_output', call_id: id, output })
  const reply = (id: string, index = 0) => record({ type: 'message', role: 'user', content: `<send_user_message_question_reply>${JSON.stringify([{ questionItemId: JSON.stringify(['request_user_input_async', id, index]), answer: 'Yes' }])}</send_user_message_question_reply>` })
  ask('a', true, 2); output('a', '{"accepted":true}')
  ask('b'); output('b', '{"accepted":true}')
  record({ type: 'task_complete' }, 'event_msg')
  assert.equal(state.pendingUserInputs.size, 2)
  reply('a'); reply('a')
  assert.equal(state.pendingUserInputs.size, 2)
  reply('a', 1); reply('b'); reply('b')
  assert.equal(state.pendingUserInputs.size, 0)
  assert.equal(events.filter(e => e.type === 'input_resolved').length, 2)
  assert.equal(events.filter(e => e.type === 'message').length, 0)
  assert.equal(events.find(e => e.type === 'input_requested')?.payload.blocking, false)
  const data = events.find(e => e.type === 'tool_call_start')?.payload.inputData as { questions: Array<{question: string; options: string[]}> }
  assert.deepEqual(data.questions[0], { question: 'Choose', options: ['Yes', 'No'] })
  ask('sync', false); output('sync', '{"answers":{}}')
  ask('rejected'); output('rejected', '{"accepted":false}')
  ask('cancelled'); output('cancelled', '{"accepted":true}')
  record({ type: 'turn_aborted' }, 'event_msg')
  assert.equal(state.pendingUserInputs.size, 0)
  assert.equal(events.filter(e => e.type === 'input_resolved').length, 5)
  record({ type: 'function_call', name: 'exec_command', call_id: 'exec', arguments: '{"cmd":"long command"}' })
  assert.equal(events.filter(e => e.type === 'input_requested').length, 5)
  assert.equal(events.filter(e => e.type === 'permission_requested').length, 0)
})
