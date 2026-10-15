const vscode = require('vscode')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

function verifyPatch(extensionPath, expected, readFile = fs.readFileSync) {
  if (!extensionPath) return { ok: false, reason: 'Agent Flow is unavailable' }
  try {
    for (const [relative, hash] of Object.entries(expected.files)) {
      const actual = crypto.createHash('sha256').update(readFile(path.join(extensionPath, relative))).digest('hex')
      if (actual !== hash) return { ok: false, reason: 'Agent Flow files differ from the installed local patch' }
    }
    return { ok: true, reason: expected.version }
  } catch {
    return { ok: false, reason: 'Agent Flow patch files are missing or unreadable' }
  }
}

function activate(context) {
  const expected = JSON.parse(fs.readFileSync(path.join(context.extensionPath, 'expected.json'), 'utf8'))
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10)
  status.text = '$(warning) Agent Flow patch changed'
  status.command = 'agentFlowPatchGuard.recovery'
  let warned = false
  const check = async () => {
    const extension = vscode.extensions.getExtension('simon-p.agent-flow')
    const result = verifyPatch(extension?.extensionPath, expected)
    if (result.ok) { status.hide(); warned = false; return }
    status.tooltip = `${result.reason}. Click for local patch recovery instructions.`
    status.show()
    if (warned) return
    warned = true
    const action = await vscode.window.showWarningMessage(`${result.reason}. An update may have replaced local patch ${expected.version}.`, 'Recovery instructions')
    if (action) await vscode.commands.executeCommand('agentFlowPatchGuard.recovery')
  }
  context.subscriptions.push(status, vscode.commands.registerCommand('agentFlowPatchGuard.recovery', async () => {
    const readme = vscode.Uri.file(expected.readme)
    try { await vscode.commands.executeCommand('markdown.showPreview', readme) }
    catch { vscode.window.showInformationMessage(`Reinstall ${expected.vsix}, then run Developer: Reload Window.`) }
  }), vscode.extensions.onDidChange(() => { void check() }))
  const timer = setInterval(() => { void check() }, 60000)
  context.subscriptions.push({ dispose: () => clearInterval(timer) })
  void check()
}

module.exports = { activate, verifyPatch }
