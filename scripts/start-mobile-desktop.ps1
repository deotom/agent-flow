param([string]$ConfigPath = 'D:\sensitive\agent-flow-supabase.env')
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) { throw 'Mobile configuration file not found.' }
$env:AGENT_FLOW_REMOTE_CONFIG = (Resolve-Path -LiteralPath $ConfigPath).Path
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectRoot
try { npm --prefix desktop start } finally { Pop-Location }
