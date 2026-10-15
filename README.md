# Agent Flow

Real-time visualization of Claude Code and Codex agent orchestration. Watch your agents think, branch, and coordinate as they work. [Demo video here](https://www.youtube.com/watch?v=Ud6eDrFN-TA). 

![Agent Flow visualization](https://res.cloudinary.com/dxlvclh9c/image/upload/v1773924941/screenshot_e7yox3.png)

## Why Agent Flow?

I built Agent Flow while developing [Antics](https://antics.gg), a game creation platform driven by AI agents. Debugging agent behavior was painful, so we made it visual. Now we're sharing it.

Claude Code is powerful, but its execution is a black box — you see the final result, not the journey. Agent Flow makes the invisible visible:

- **Understand agent behavior** — See how Claude breaks down problems, which tools it reaches for, and how subagents coordinate
- **Debug tool call chains** — When something goes wrong, trace the exact sequence of decisions and tool calls that led there
- **See where time is spent** — Identify slow tool calls, unnecessary branching, or redundant work at a glance
- **Learn by watching** — Build intuition for how to write better prompts by observing how Claude interprets and executes them

## Features

- **Live agent visualization**: Watch agent execution as an interactive node graph with real-time tool calls, branching, and return flows
- **Claude Code + Codex**: Auto-detects sessions from both runtimes concurrently and shows them side-by-side, or restrict to one via the `agentVisualizer.runtime` setting
- **Claude Code hooks**: Lightweight HTTP hook server receives events directly from Claude Code for zero-latency streaming
- **Codex rollout tailing**: Reads `~/.codex/sessions/**/rollout-*.jsonl` (respects `CODEX_HOME`) and surfaces tool calls, reasoning, and authoritative token counts from Codex's own event stream
- **Multi-session support**: Track multiple concurrent agent sessions with tabs
- **Interactive canvas**: Pan, zoom, click agents and tool calls to inspect details
- **Timeline & transcript panels**: Review the full execution timeline, file attention heatmap, and message transcript
- **JSONL log file support**: Point at any JSONL event log to replay or watch agent activity

## Getting Started

### Quick Start (no VS Code required)

```bash
npx agent-flow-app
```

This starts the visualizer in your browser. Start a Claude Code session in another terminal — events will stream in real-time.

Options:
- `--port <number>` — change the server port (default: 3001)
- `--no-open` — don't open the browser automatically
- `--verbose` — show detailed event logs

### Standalone Web App (from source)

```bash
git clone https://github.com/patoles/agent-flow.git
cd agent-flow
pnpm i
pnpm run setup      # configure Claude Code hooks (one-time)
pnpm run dev        # start the web app + event relay
```

Open http://localhost:3000 and start a Claude Code session in another terminal — events will stream to the browser in real-time.

### VS Code Extension

1. Install the extension
2. Open the Command Palette (`Cmd+Shift+P`) and run **Agent Flow: Open Agent Flow**
3. Start a Claude Code or Codex session in your workspace — Agent Flow will auto-detect it

Agent Flow automatically configures Claude Code hooks the first time you open the panel. To manually reconfigure, run **Agent Flow: Configure Claude Code Hooks** from the Command Palette.

### Runtime selection

By default Agent Flow watches both Claude Code (`~/.claude/projects/`) and Codex (`~/.codex/sessions/`) concurrently in all three entry points (VS Code extension, `pnpm run dev`, `npx agent-flow-app`). Sessions are shown side-by-side and tagged by runtime. If you only use one, the other is a harmless no-op — no visible effect, no user action needed.

To restrict to one runtime:

- **VS Code extension:** set `agentVisualizer.runtime` to `"auto"` / `"claude"` / `"codex"` in your settings
- **`pnpm run dev` and `npx agent-flow-app`:** set the `AGENT_FLOW_RUNTIME` environment variable to `claude` or `codex` (defaults to watching both)

For non-default Codex installs, set the `CODEX_HOME` environment variable.

Codex child rollouts are grouped into their parent session instead of separate
tabs. Active children show thinking effects, tool calls, models, and context
usage; finished children fade out and return when assigned another task.
When Codex records reasoning without plaintext, the visualizer shows a
`Thinking...` activity label. It does not reconstruct private reasoning.

### JSONL Event Log

You can also point Agent Flow at a JSONL event log file:

1. Set `agentVisualizer.eventLogPath` in your VS Code settings to the path of a `.jsonl` file
2. Agent Flow will tail the file and visualize events as they arrive

## Commands

| Command | Description |
|---------|-------------|
| `Agent Flow: Open Agent Flow` | Open the visualizer panel |
| `Agent Flow: Open Agent Flow to Side` | Open in a side editor column |
| `Agent Flow: Connect to Running Agent` | Manually connect to an agent session |
| `Agent Flow: Configure Claude Code Hooks` | Set up Claude Code hooks for live streaming |

## Keyboard Shortcut

| Shortcut | Action |
|----------|--------|
| `Cmd+Alt+A` (Mac) / `Ctrl+Alt+A` (Win/Linux) | Open Agent Flow |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `agentVisualizer.runtime` | `"auto"` | Which agent runtime(s) to watch: `"auto"` (both), `"claude"`, or `"codex"` |
| `agentVisualizer.codexHistoryLimit` | `5` | Restore this many recent Codex sessions for the current workspace, regardless of creation date (0–50). Set to `0` for live sessions only; reload the window after changing it. Resumed sessions are discovered in every date partition. |
| `agentVisualizer.devServerPort` | `0` | Development server port (0 = production mode) |
| `agentVisualizer.eventLogPath` | `""` | Path to a JSONL event log file to watch |
| `agentVisualizer.autoOpen` | `false` | Auto-open when an agent session starts |

## Requirements

- [Node.js](https://nodejs.org/) 20+ (LTS recommended)
- [pnpm](https://pnpm.io/)
- Claude Code CLI
- For the VS Code extension: a VSCode-compatible IDE 1.85+ (e.g. [VS Code](https://code.visualstudio.com/), [Cursor](https://cursor.sh/), [Windsurf](https://windsurf.com/))

## Development

```bash
pnpm i              # install dependencies for all packages
pnpm run setup      # configure Claude Code hooks (one-time)
pnpm run dev        # start dev server + event relay
```

`pnpm run dev` starts both the Next.js dev server and an event relay that receives Claude Code events and streams them to the browser via SSE.

Other scripts:

| Script | Description |
|--------|-------------|
| `pnpm run dev:demo` | Start with demo/mock data |
| `pnpm run dev:relay` | Run the event relay server standalone |
| `pnpm run dev:extension` | Watch-build the extension |
| `pnpm run build:all` | Production build (webview + extension) |
| `pnpm run build:web` | Build the Next.js web app |
| `pnpm run build:extension` | Build the extension |
| `pnpm run build:webview` | Build the webview assets |

## Star History

[![Star History Chart](https://api.star-history.com/chart?repos=patoles/agent-flow&type=date&legend=bottom-right)](https://www.star-history.com/?repos=patoles%2Fagent-flow&type=date&legend=bottom-right)


## Author

Created by [Simon Patole](https://github.com/patoles), for [Antics](https://antics.gg).

## Privacy & Telemetry

Agent Flow ships **opt-out** anonymous usage telemetry, enabled by default only
in the published `npx agent-flow-app` binary. `pnpm run dev` and the VS Code
extension emit nothing. Only aggregate events are sent — session count,
duration, event count, OS/arch, Agent Flow version, distinct model IDs
observed, which runtimes were watched, and error class names. Prompts, file
paths, tool calls, user info, and environment variables are never sent.

- **Turn off:** `export AGENT_FLOW_TELEMETRY=false` or `export DO_NOT_TRACK=1`
  (disabled installs write zero state to disk — no `~/.agent-flow/` directory)
- **Inspect the payload:** `cat ~/.agent-flow/telemetry/events.jsonl`
- **Full schema + exact fields:** see the v0.8.1 entry in
  [extension/CHANGELOG.md](extension/CHANGELOG.md) or the `serialize()` function
  in [scripts/telemetry.ts](scripts/telemetry.ts)
- **Reset your anonymous identity:** delete `~/.agent-flow/installation-id` —
  a fresh random UUIDv4 will be generated on next run


### Explorer graph (local patch)

The VS Code Explorer includes a compact **Agent Flow** graph. Run **Agent Flow: Show Graph in Explorer** to reveal it, or toggle `agentVisualizer.showExplorerGraph` in Settings. Select a session from the dropdown, use **Fit graph** to reset the zoom, or **Open full graph** for transcripts and tool details. The compact view shows agents, their models, and delegation flow; completed children disappear. The Explorer and editor graphs can stay open together.

After applying the local build patch, register new commands and views with VS Code by running `python scripts/package-local-codex-fix.py` and `code --install-extension artifacts.local/agent-flow-codex-local.vsix --force` from the repository root. The packager uses the original cached 0.9.2 VSIX and verifies the installed bundle against the local build. Run **Developer: Reload Window** after installation. Editing the installed manifest alone can leave VS Code using cached contributions.

Local patch `local-2026.10.15.1` adds controls to both graph views:

- **Lock session** keeps the selected session when another session starts. The locked selection is remembered when the view reopens, provided that session is still available. You can still switch sessions manually.
- **Animation settings** selects full effects, Low GPU (24 FPS), or effects off, with visual speeds from 0.25× to 2×. These preferences are saved in VS Code Settings as `agentVisualizer.animationMode` and `agentVisualizer.animationSpeed`; agent execution and timeline time are unaffected.
- **Connection status** shows the patch version, watcher source, selected session, last received live event, and history delivery progress. Historical replay does not count as fresh activity. A quiet watcher is not proof that the agent process has stopped.
- History is delivered in batches with progress feedback. Unchanged Codex history reuses an in-memory replay cache. **Chat** initially displays the latest 100 messages; **Load older messages** adds 100 at a time. Search covers the entire loaded transcript, including messages outside the current page.

Local patch `local-2026.10.15.2` adds **Tasks and results** in both graph views. A round starts when the main agent receives a user message; delegated instructions do not create a new round. The graph, message feed, and Chat default to the latest round. Open **Round … · Tasks …** and enable **Include previous rounds** to read earlier work. Completed child nodes still disappear, while their result and task messages remain available in this panel. Timeline Review continues to support replay of earlier graph activity.

Delegation edges and task rows distinguish **Task sent**, **Working**, **Done · awaiting result**, **Result sent**, and **Parent received result**. Receipt requires evidence in the parent's transcript; completion or a particle reaching the main node does not establish receipt. Stopped dependent work is marked **Stopped**. New nodes occupy free label space while established and manually dragged nodes keep their positions; manual camera navigation cancels a pending automatic fit.

The separately installed **Agent Flow Local Patch Guard** checks the expected build files on startup, extension changes, and every 60 seconds. If an update replaces the patch, it displays a warning and status bar link to these recovery instructions. It does not reinstall or downgrade automatically. To restore this build, run these commands from this repository root and then **Developer: Reload Window**:

```powershell
code --install-extension artifacts.local/agent-flow-codex-local.vsix --force
code --install-extension artifacts.local/agent-flow-patch-guard.vsix --force
```

After rebuilding the local patch, regenerate the guard with `python scripts/package-patch-guard.py` so its expected file hashes match the new build. The guard is a separate extension and can be disabled or uninstalled independently.

Local patch `local-2026.10.15.3` adds a JARVIS-inspired HUD: cyan instrument rings with an amber sweep and light flares around an active main agent, subtle twinkling stars, corner brackets, and a unified SVG toolbar. Names, models, statuses, and context usage have a consistent hierarchy. Context uses a segmented energy gauge with numeric usage; warning colors begin at 80% (amber) and 90% (red). Explorer uses a separate vertical/column layout without moving nodes in the editor graph. It keeps node selection and camera navigation; use the full graph to manually arrange nodes. Full/Low/Off animation preferences remain available.

Local patch `local-2026.10.15.4` makes **Low GPU** the default and selects it once on the first activation of this patch; later manual preferences are preserved. Rendering is capped at 24 FPS in Low mode, 18 FPS at 12+ agents, and 12 FPS at 30+ agents. Idle/static graphs use 8 FPS. Stars, particles, resolution, and optional effects decrease as the graph grows; bloom buffers are allocated only for small, active Full-mode graphs. JARVIS rings and delegation flow remain visible in Low mode.

Both the graphics and simulation loops stop when VS Code hides the view or the document becomes hidden. Events continue buffering and are applied quietly when the view returns, preserving task results and transcript history. This reduces visualization overhead; it does not limit the resource usage of Codex, Claude, or their tools.

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.

The name "Agent Flow" and associated logos are trademarks of Simon Patole. See [TRADEMARK.md](TRADEMARK.md) for usage guidelines.


Local patch `local-2026.10.15.5` stores complete received history in a local IndexedDB cache. Session switches rebuild from this cache instead of retaining a full simulation snapshot for every session. Chat and task history replace pages of 100 records; search reads older disk records as well. Large tool inputs load only when a visible message or tool detail needs them. The graph keeps 500 recent message previews (up to 1,600 characters each), 200 recent tasks, and bounded timeline blocks. Review playback also releases processed event payloads.

Replay payload caches use estimated serialized sizes: 4 MiB per Codex root / 8 MiB combined in the extension, and 400 events / 2 MiB per session / 8 MiB combined in each webview. These limits describe caches, not the complete VS Code process heap. Evicted extension caches are rebuilt from original transcripts. Webview data is released only after a successful disk write; storage failures retain memory data and show a warning in Connection status, with **Reload graph from transcripts** available. Abandoned disk cache namespaces are cleaned incrementally after 24 hours; original Claude/Codex transcript files are never deleted.

**Choose session** opens a searchable vertical list in both graph surfaces, including narrow Explorer views. Toolbar height reserves space above floating panels. Each VS Code window has its own watcher and graph state; multiple windows can run concurrently. If a graph fails to initialize, a recovery overlay offers **Reload graph**. After installing the patch, run **Developer: Reload Window** separately in every already-open VS Code window.


Local patch `local-2026.10.15.6` separates activity from context usage. The amber activity arc has a fixed length, rotates slowly during thinking and faster during tools, gently pulses while an idle parent has unfinished children, and fades after work ends. A return particle reaching its actual parent triggers one brief ring flash; historical restores do not trigger it. Animation Off keeps the arc stationary and suppresses the return flash. CTX is a compact percentage with the existing 80/90% warning colors; hovering its canvas label shows exact used/capacity token counts. The duplicate context ring and segmented bar are removed from both graph surfaces. Existing Low GPU frame limits remain unchanged.


Local patch `local-2026.10.15.7` replaces the rotating amber arc with three stationary ring segments. Brightness gently breathes while thinking, pulses faster during tools, and stays softer while awaiting children. A child result still flashes once on arrival. A wide translucent stroke supplies a light halo without extra blur buffers; Low GPU frame limits remain unchanged, and Animation Off holds brightness steady.


Local patch `local-2026.10.15.8` moves the activity light behind the center icon: a cyan reactor halo with a pale core breathes while thinking, pulses faster during tools, and becomes softer while awaiting children. Arrival of a child result adds one warm flash. The external amber activity ring is removed. Three fixed, shared glow sprites are cached once; only opacity changes each frame, without rotation, animated radius, or additional blur buffers. Animation Off keeps the reactor light steady.


Local patch `local-2026.10.15.9` removes the reactor glow after reported stuttering and restores a stationary cyan circular HUD with eight small instrument ticks. It uses one unblurred stroked path, with steady brightness for work and a dimmer indicator while awaiting children. Node breathing and rotating main instrument rings stop, avoiding continuous radius changes and related glow-cache variants. Delegation/return travel and CTX labels remain available. This reduces decorative drawing; no measured frame-rate improvement is claimed.


Local patch `local-2026.10.15.10` restores slow rotation of the outer JARVIS instrument rings while the main agent works. The inner cyan activity HUD stays stationary. Reactor glow and node radius breathing remain removed. Low GPU frame limits and Animation Off behavior are preserved.


Local patch `local-2026.10.15.11` keeps the cyan circular HUD visible at a dim steady brightness while Ready/idle, rather than hiding it. While Ready it gently breathes in opacity on the existing idle render loop; Animation Off keeps it steady. It brightens during work and remains visible while awaiting children. Completed nodes still hide their indicator. This applies to the editor and Explorer; the outer JARVIS rings rotate very slowly while Ready and at their normal pace during work. Idle rotation omits the moving flare and extra light effects.


Local patch `local-2026.10.15.12` restores history behind a loading surface, keeping intermediate agents and tasks out of the live graph. It reveals the graph after history delivery, disk flushing and simulation consumption have all completed; restored states seed the effect baseline without spawn/completion flashes. Event processing yields after 8 ms or 64 records, and historical events avoid per-event layout timers. Placement runs once per batch. Quiet simulation work drops to 4 updates/second, independent of the decorative graphics loop; agent elapsed counters change once per second instead of allocating a new agent map every tick. Low GPU mode skips node drop shadows. These changes address observed code paths; real workstation frame-rate gains have not been measured.

The inner circular HUD now represents actual context usage: a faint full capacity track and a colored used-capacity arc, capped at one circle, with warning colors at 80/90%. Existing CTX percentages and token hover details remain. The outer JARVIS instruments continue their separate slow idle rotation.


Local patch `local-2026.10.15.13` refines the context HUD into thin, evenly spaced angular segments with a quiet capacity track. Redundant context tick marks are removed; the separate outer JARVIS instrument ticks remain. Only the latest occupied segment gently pulses in opacity, marking the current usage boundary. Segment positions and usage stay fixed during the pulse. Animation Off holds the tip steady; no glow, blur buffer, timer or extra rendering loop is added.


Local patch `local-2026.10.15.14` aligns both capped loops with display refresh instead of waiting on a timer before requesting the next frame. Absolute deadlines preserve fractional frame cadence and skip missed slots without catch-up bursts; hidden views still cancel every callback. Existing FPS and pixel limits are preserved. Disk-history completion now marks UI data dirty for the existing UI throttle instead of forcing immediate React renders. Graph projections reuse unchanged collections, preserving camera/edge lookup caches without retaining transcript snapshots; empty animation collections also retain their references. Deterministic refresh tests verify pacing through delayed frames, but real VS Code frame-time gains have not been measured.


Local patch `local-2026.10.15.15` adds a small stationary cyan standby light above the main agent while Ready. Only its opacity slowly breathes; its size and position stay fixed, and Animation Off holds it steady. It uses one unblurred dot in the existing draw loop for both editor and Explorer, without extra timers, glow or FPS changes.


Local patch `local-2026.10.15.16` sets Full effects as the default, as requested. It selects Full once on first activation; later manual animation preferences remain respected. Rendering limits for crowded graphs, hidden-view suspension, frame pacing and history/UI throttling remain in place. Low GPU and Off remain available in Animation settings.
