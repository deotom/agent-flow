@echo off
setlocal
set "AGENT_FLOW_REMOTE_CONFIG=D:\sensitive\agent-flow-supabase.env"
if not exist "%AGENT_FLOW_REMOTE_CONFIG%" (
  echo Mobile configuration was not found in D:\sensitive.
  pause
  exit /b 1
)
pushd "%~dp0..\desktop"
if not exist "node_modules\electron\dist\electron.exe" (
  echo Desktop runtime is missing. Run npm --prefix desktop ci first.
  pause
  popd
  exit /b 1
)
start "" "node_modules\electron\dist\electron.exe" .
popd
endlocal
