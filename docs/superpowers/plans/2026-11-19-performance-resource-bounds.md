# Performance resource bounds

## Authorized objective

Reduce Agent Flow CPU, disk and repeated work while preserving truthful multi-session state, current graph functionality, the original visuals and Full effects preference. User requested parallel implementation and Claude review before delivery after the native/backend audit, then clarified that T3 should be realtime-only rather than keeping local logs. Work in a branch in the existing checkout to avoid another dependency/package copy on the space-constrained workstation. Agents own disjoint paths; no package/build/native launch in parallel.

## Evidence and limits

Baseline main is a3a6dd9. The audit found 65 localhost-port IndexedDB origins totaling 36.18 GB; every desktop worker binds port0 and reloads an iframe at its new origin. Full T3 snapshots are persisted as events. Read-only T3 polls take substantial synchronous CPU, with items/reply queries the main SQL cost. Native Full/off traces show graphics cost, and the provisional Board trace shows heavy layout. Measurements are single observations with tracing overhead; no true displayed-FPS, leak or30min-soak claim. Earlier42s SSE failure was contaminated by synchronous directory scans on the client probe. Dedicated180s SSE clients remained connected and received20/20teams, including isolation from a stalled client.

## Design

User clarification: Agent Flow is used for realtime animation, not local logs. For T3, keep latest state per session in RAM, skip IndexedDB snapshot archival and byte-estimation serialization, and restore graph/session views from the latest source snapshot. Old T3 timeline catalogs need not be retained across snapshots. Source T3 history remains untouched. This supersedes the conservative T3 archive-compaction design below; native incremental history is outside this simplification.

1. Desktop/storage: prefer a deterministic loopback port per canonical workspace/source, with safe occupied-port fallback; never assume an existing listener belongs to this app. Reuse an existing worker when the same source is selected. For T3, retain only the latest per-session graph state in RAM, bypass event and derived-data archival and disk replay, including before the first snapshot arrives. Prune removed sessions. Preserve native incremental-event ordering. Do not delete the existing36GB of old origins automatically; old-cache reclamation remains a separately explicit action.
2. T3: measure and optimize actual query/projection hot paths, preserve source contract and read-only access. Prefer bounded query/materialization work and reusable results where correctness can be proven. Do not conceal latency by relabeling stale data, suppressing sessions or lowering freshness arbitrarily. Move polling off the SSE loop only if simpler optimizations do not meet the goal.
3. Board: find layout-causing animation/render work; replace it with compositor-friendly/static-equivalent behavior while preserving status cues and appearance. Do not apply Effects off as a default or broadly remove visual content.

## Parallel implementation

- Storage agent owns web/lib/history-archive.ts, related storage helpers/tests and the archive/ingest path in web/hooks/use-vscode-bridge.ts.
- T3 agent owns extension/src/t3-session-watcher.ts, t3-projection.ts and focused tests/helpers.
- Board agent owns team UI CSS/components and their focused tests. It must identify the actual mechanism before patching.
- Root owns desktop origin stability, integration, system measurements and final packaging/review. No overlapping edits without coordination.

## Validation and delivery

Use meaningful failing regressions before fixes; run only focused checks in each child. Root runs full tests/types/build sequentially, then repeats the same lightweight180s installed-relay probe and comparable native samples where UI control works. Verify full20-session snapshots, native replay ordering, occupied-port isolation and restored preferences. Compare wall and CPU time without claiming a controlled benchmark. Keep evidence compact; never scan cache files on the SSE client's event loop. Claude reviews final diff and measured evidence; fix material findings before installing/delivering. State remaining unmeasured cases explicitly.

## Implementation checkpoint

- Board packet geometry and SVG halo stroke-width animation were replaced by static geometry with transform/opacity animation; appearance/status semantics and Full default remain.
- T3 current-state handling bypasses byte-estimation JSON serialization, event archive, derived archive and simulation event-log retention. Initial empty realtime sessions do not fall through to disk replay; removed-session snapshots are released.
- Reader scope selection avoids building skeleton snapshots. Completed item summaries preserve exact counts and timestamp parsing; replies select each lead's latest row before decoding JSON in one statement, avoiding a ranked full-history scan. The actual database has no timestamp-sorted assistant-message index; a regression without that index proved the old query decoded280 fields versus at most40 after selecting winners first. No source index was added. Same-transaction query-shape probe found materialized aggregation1235msCPU/544returnedrows versus raw1374ms/10038rows and NOT MATERIALIZED1781ms/544rows; single warm-cache/order-contended observation only. Full wall-time improvement is not established by those numbers.
- Full sequential verification completed2026-11-19 04:24UTC: root63,extension105,web526,desktop37 tests (731total,zero failures), all type checks, builds and desktop packaging exited0. Evidence: ignored artifacts.local/performance-validation-20261119. Claude review and installed-package checks remain pending at this checkpoint.

## Review corrections

Claude's pre-delivery source review found no functional blocker in realtime ingestion, aggregation or animation. The Windows port fallback risk was corrected: EACCES and EADDRNOTAVAIL now fall back once to an ephemeral port, with three additional regression tests including no retry loop at port0. Root also made the T3 refresh action rebuild current local state in desktop mode and avoided re-filtering the existing native event log. The winner-first reply regression addresses the review's real-index evidence gap. Final package verification and installed evidence are recorded below when complete.

## Installed verification, first pass

- Final sequential run at04:54:30UTC:734 tests (root66,extension105,web526,desktop37), types, extension/desktop builds and package all exited0. Claude's follow-up source review approved all three corrections, without independently running them.
- Installed ASAR SHA256:0c22a160ac874cf8fa2fd2c9f46ed6d9b1310b5da1dbb977bc8ffd163b6f984d. Installer verified previous/rollback hash594faca71038d5e265df6ae735bc5802bd2453d3e7484f2dcd68ded2cb93c527. No Electron/native dependency change.
- Packaged worker, actual read-only T3: two clients and reconnect each received20/20teams, four health frames and zero session/team mismatches. This is packaged backend correctness evidence, not UI evidence.
- Actual partition http://127.0.0.1:26010/^0file:// had no IndexedDB databases both at04:57 and05:01. Only names/metadata were inspected; no history values or storage deletion. This proves no archive creation over this short T3 run, not disk-zero or an extended soak.
- Dedicated180s SSE probe: both healthy clients stayed connected, each20/20teams,190totalframes,37healthframes and50.14MB. The paused30s client was disconnected; its reconnect received20/20teams. Source-check max gap9.253s remains; max healthy arrival gaps10.6–11.4s include a probe loop max1.205s. Do not claim the latency outliers are fixed.
- Office confirmed by screenshots before/after:30.097s sample, renderer39.07%onecore, GPU-process127.80%, nodeutility33.02%. Full effects cost is broadly unchanged from baseline; GPU-process CPU is not GPU utilization. No displayed-FPS or leak claim.
- First post-change trace named board-full-after-resource-fixes changed tabs during capture and is invalid for per-mode comparison. Subsequent Board confirmed before/after still shows12.396s layout/727Layout events in39.88s elapsed (25s draw span), renderer88.66%onecore. Root therefore reopened Board work instead of declaring performance fixed. Next suspected mechanism is CSS transforms on SVG descendants, which still relayout SVG despite using the transform property.

## Final Board correction and delivery state

The remaining lamp/reactor rotations and halo opacity now animate enclosing HTML layers, with SVG geometry static. A regression parses the rendered status components and CSS to reject animated SVG targets, alongside the geometry-keyframe regression. Focused4/4 tests and web types passed. Affected final sequential run finished05:10:36UTC:527web tests, web types, desktop build,37desktop tests and package passed. Combined with unchanged root66/extension105 checks from the full run, current coverage is735passing tests. No production dependency changed.

Claude's final read-only review approved the HTML-layer change with no blocker, tracing status colors, layers, packet geometry, stale/off behavior and accessibility. The final installed ASAR hash is4fc17f28d5594ac2a466dc9c70c50de14fcdf71a1ecff750e39979e8e726ff5d; installer verified rollback to the first-pass0c22a160ac874cf8fa2fd2c9f46ed6d9b1310b5da1dbb977bc8ffd163b6f984d. App was reopened. Final native capture remains unavailable (activation failure, black/occluded capture), so the last Board change is regression-tested and reviewed but its native speedup is unproven. User was asked once to make the app visible; no unlock or other app automation was attempted.

Still unverified or outstanding: final native Board CPU/layout comparison, long soak/memory trend, reducing synchronous poll/source-check outliers, and Office Full graphics cost. Existing65origin/36.18GB historical caches remain untouched. No SonarQube binding/scanner configuration was found in this repository; no server Quality Gate or server analysis is claimed.
