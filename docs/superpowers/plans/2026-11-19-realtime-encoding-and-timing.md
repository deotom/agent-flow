# Realtime encoding and latency diagnosis

**Goal:** Reduce proven repeated serialization without changing Full effects or source truth; distinguish slow source reads from worker transfer, relay fan-out and scheduling delays.

**Scope:** Existing Node/TypeScript, no dependencies, no source DB writes/indexes, no stale-threshold increase, no screen control. Work in the current clean checkout on a separate branch to avoid duplicating large dependencies on the space-constrained disk. User authorized continuing performance work and Claude review before delivery.

## Evidence and choice

The prior 30-minute run had a 29.602s source-check gap but no per-boundary timing. A new temporary instrumented sidecar relay with two clients ran 90s; the outlier did not reproduce. Standalone per-query timing identified tool-items SQL as the largest read component. The existing query uses the source thread/run index. An in-memory NOT MATERIALIZED experiment returned identical rows but was slower, so it is rejected. No SQL change is justified by that experiment.

Relay broadcast currently gives each writer its own JSON.stringify closure for the same immutable message. Use one lazy encoder per broadcast, shared only by its recipients. Release its source reference after encoding; retain no global cache. Slow-client coalescing and FIFO, frame/queue limits and write-completion recovery stay unchanged.

Add opt-in numeric timing at the existing poll boundaries. Default behavior has no timing events/logs. Capture source poll duration, worker post delay and relay delivery duration, plus timer lateness, without source identifiers, titles, prompts, paths or result data. Diagnostic observer failure must not affect monitoring. This supports investigating a future outlier; it does not claim the old outlier is fixed.

## Tasks

- [x] Read-only boundary/query investigation; record numeric ignored artifacts, reject the slower SQL variant.
- [x] Shared lazy broadcast encoder: tests fail before implementation; prove one encode for multiple ready clients, no encode for replaced pending states, intact per-client order/failure isolation and no global retention.
- [x] Opt-in timing: tests fail before implementation; numeric-only events, default-off, safe observer exceptions, ordered snapshots/health and disposal remain intact.
- [x] Run affected full root/extension suites, types and relay/desktop builds. Run a bounded two-client actual-read probe with diagnostics, report limits. Claude source/evidence review before commit/integration.

**Deferred:** Offscreen rendering changes and a controlled heap-retention/CPU study require a separately verified UI run; do not infer improvements from this backend work. Native screen control remains stopped after the user's Escape.

## Implementation and current verification

`distributeRelayValue` owns one lazy encoding per immutable broadcast, reused by SSE writers via `sendEncoded`. The input reference is cleared after the first successful encoding. There is no global string/object cache. Pending keyed states still replace before encoding. A slow recipient can retain the encoded string until replacement/drain/disposal, so this trades repeated CPU work for bounded transient string storage; it is not a memory-reduction claim. RED tests failed because the broadcast helper did not exist; GREEN focused SSE/relay tests passed 19/19.

`T3SessionWatcher` optionally reports numeric read/project/reply/close stages. `T3WorkerWatcher` adds transfer (wall-clock difference), synchronous delivery and timer-lateness diagnostics. Transfer includes clone and message dispatch; it is not a pure transport latency. Diagnostics are enabled only with `AGENT_FLOW_T3_TIMING=1`, never sent to viewers, and observer exceptions are contained. Default-off workers do not produce timing records. RED source/worker tests reported zero records; GREEN focused watcher tests passed 12/12, including source failure, numeric-only keys, observer throw, later polling and real bundled worker/default-off checks.

Affected full checks: root 71/71, extension 112/112 and desktop 46/46 (229 tests), extension/SSE types, relay/extension builds and desktop build all exited zero. Web source was unchanged; its earlier suite is not counted as rerun. Logs: artifacts.local/performance-encoding-timing-20261119/status.json. No SonarQube binding/scanner configuration was found, so no server Quality Gate or analysis date is reported.

The candidate reused the unchanged Electron45 runtime and contains the exact compiled worker bundles. app.asar is 6,991,433 bytes, SHA256 17b8a521863a83acd449005f60ea361ec3c1028c55c69293f895a4e34b739924. It is a candidate, not a claim that the open app has updated.

A 91.538-second probe ran that actual candidate ASAR in Electron Node mode with the real read-only T3 DB. Two healthy clients and both reconnects each reached 20/20; zero mismatches/parse errors and no unexpected healthy ends. The deliberately paused client ended with response-error after 6/20 without interrupting the healthy clients. The probe did not persist health-state classifications, so no all-ok-health claim is made. Across 29 diagnostics, source total median/max was 1059/1523 ms, read 794/1209 ms, projection 185/264 ms, replies 77/126 ms, transfer 8/31 ms, synchronous fan-out 16/29 ms, and timer lateness 6/23 ms. Max source-check gap was 3560 ms. This shorter, differently loaded run does not establish that the previous 29.602s outlier is fixed, or that CPU/FPS improved.

Evidence: artifacts.local/performance-audit-20261119/{latency-boundaries-summary,latency-query-variants,encoding-timing-packaged,encoding-timing-packaged-summary,encoding-timing-repack}.json. No native window input/control was used. CPU/heap investigation remains separately unverified.

## Final review and delivery

Claude independently read the full diff, call paths, tests, verification status and packaged evidence. Verdict: no blockers and no proven defects. The reviewer confirmed shared lazy encoding, coalescing, failure isolation, numeric-only/default-off diagnostics and observer-error containment. Non-blocking notes: callers must keep broadcast values immutable; transfer uses wall-clock subtraction; timerLateMs is zero for the initial poll and retains the last timer value across worker replacement. The production default worker factory is covered by the real ASAR probe rather than a dedicated unit factory test. None supports a CPU/FPS or leak claim. The old 29.602s gap remains unexplained and was not reproduced here.

The app was found closed before installation. Delivery uses the existing ASAR installer/verified rollback; no app window is opened or controlled. The installed hash is verified against the reviewed candidate. No source code changed after the recorded validation and review.
