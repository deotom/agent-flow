'use strict'
// Reserves a screen edge for the docked window through the Windows AppBar API, the same mechanism the
// taskbar uses, so maximized windows stop beside Agent Flow instead of covering it.
// The API is reached through the PowerShell that ships with Windows, so no native module is bundled.
// The helper releases the reservation when told to, when its input closes (Agent Flow exited or crashed),
// or when the window it serves no longer exists.
// TaskbarCreated is a dynamically registered shell message, not a fixed callback
// this console helper can hook. The main process retries on display changes/resume.
const { spawn } = require('node:child_process')
const path = require('node:path')

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class AgentFlowAppBar {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int left, top, right, bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct APPBARDATA { public int cbSize; public IntPtr hWnd; public uint uCallbackMessage; public uint uEdge; public RECT rc; public IntPtr lParam; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
  [DllImport("shell32.dll")] static extern UIntPtr SHAppBarMessage(uint message, ref APPBARDATA data);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr window);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr window, uint flags);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFO info);
  static bool registered;
  static APPBARDATA Data(IntPtr window) {
    var data = new APPBARDATA(); data.cbSize = Marshal.SizeOf(typeof(APPBARDATA)); data.hWnd = window; return data;
  }
  static void Fit(ref APPBARDATA data, uint edge, int width) {
    if (edge == 0) data.rc.right = data.rc.left + width; else data.rc.left = data.rc.right - width;
  }
  public static string Set(IntPtr window, uint edge, int width) {
    var data = Data(window);
    if (!registered) { data.uCallbackMessage = 0x81AF; SHAppBarMessage(0, ref data); registered = true; }
    var info = new MONITORINFO(); info.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
    GetMonitorInfo(MonitorFromWindow(window, 2), ref info);
    data.uEdge = edge; data.rc = info.rcMonitor; Fit(ref data, edge, width);
    SHAppBarMessage(3, ref data);
    Fit(ref data, edge, width);
    SHAppBarMessage(4, ref data);
    return data.rc.left + "," + data.rc.top + "," + (data.rc.right - data.rc.left) + "," + (data.rc.bottom - data.rc.top);
  }
  public static void Remove(IntPtr window) {
    if (!registered) return;
    var data = Data(window); SHAppBarMessage(1, ref data); registered = false;
  }
}
'@
$window = [IntPtr][Int64]$env:AGENT_FLOW_HWND
try {
  [Console]::Out.WriteLine('ready'); [Console]::Out.Flush()
  while ($true) {
    $read = [Console]::In.ReadLineAsync()
    while (-not $read.Wait(1000)) { if (-not [AgentFlowAppBar]::IsWindow($window)) { return } }
    $line = $read.Result
    if ($null -eq $line) { return }
    if ($line -match '^(left|right) (\d+)$') {
      $edge = if ($Matches[1] -eq 'left') { 0 } else { 2 }
      [Console]::Out.WriteLine([AgentFlowAppBar]::Set($window, $edge, [int]$Matches[2]))
    } elseif ($line -eq 'off') {
      [AgentFlowAppBar]::Remove($window); [Console]::Out.WriteLine('off')
    }
    [Console]::Out.Flush()
  }
} finally { [AgentFlowAppBar]::Remove($window) }
`

function powershellPath() {
  return path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

/**
 * @param {() => string} getWindowHandle native window handle as a decimal string
 * @param {(rect: {x:number,y:number,width:number,height:number}) => void} onRect reserved rect in physical pixels
 * @param {() => void} onFailure the helper could not run; the caller falls back to an unreserved dock
 */
function createAppBar(getWindowHandle, onRect, onFailure, spawnProcess = spawn) {
  let child
  let failed = false
  function start() {
    child = spawnProcess(powershellPath(), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-EncodedCommand', Buffer.from(SCRIPT, 'utf16le').toString('base64')], {
      env: { ...process.env, AGENT_FLOW_HWND: getWindowHandle() }, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true,
    })
    const current = child
    let buffer = ''
    current.stdout.on('data', chunk => {
      buffer += chunk.toString()
      let index
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index).trim()
        buffer = buffer.slice(index + 1)
        const match = /^(-?\d+),(-?\d+),(\d+),(\d+)$/.exec(line)
        if (match && child === current) onRect({ x: +match[1], y: +match[2], width: +match[3], height: +match[4] })
      }
    })
    const fail = () => {
      if (child !== current) return
      child = undefined
      failed = true
      onFailure()
    }
    current.on('error', fail)
    current.on('exit', fail)
    current.stdin.on('error', () => {})
  }
  return {
    /** Reserve `width` physical pixels on `edge`. Returns false when reservation is unavailable. */
    set(edge, width) {
      if (failed) return false
      if (!child) start()
      child.stdin.write(`${edge === 'left' ? 'left' : 'right'} ${Math.max(1, Math.round(width))}\n`)
      return true
    },
    /** Release the edge and stop the helper. */
    remove() {
      const current = child
      child = undefined
      if (!current) return
      current.stdin.write('off\n')
      current.stdin.end()
    },
  }
}

module.exports = { createAppBar, SCRIPT }
