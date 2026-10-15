import { it } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { ToolContentRenderer } from './tool-content-renderer'

it('renders Codex commands, plan progress, patches and orchestration code', () => {
  const command = renderToStaticMarkup(<ToolContentRenderer toolName="functions.exec_command" inputData={{ command: 'npm test' }} />)
  assert.ok(command.includes('npm test'))
  const plan = renderToStaticMarkup(<ToolContentRenderer toolName="update_plan" inputData={{ plan: [
    { step: 'Restore sessions', status: 'completed' }, { step: 'Verify display', status: 'in_progress' },
  ] }} />)
  assert.ok(plan.includes('Restore sessions'))
  assert.ok(plan.includes('line-through'))
  assert.ok(plan.includes('Verify display'))
  const patch = renderToStaticMarkup(<ToolContentRenderer toolName="apply_patch" inputData={{ patch: '-old\n+new' }} />)
  assert.ok(patch.includes('-old'))
  assert.ok(patch.includes('+new'))
  const code = renderToStaticMarkup(<ToolContentRenderer toolName="exec" inputData={{ code: 'await tools.exec_command({cmd: "npm test"})' }} />)
  assert.ok(code.includes('exec_command'))
  assert.ok(code.includes('npm test'))
})
