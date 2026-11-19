# Adaptive T3 read budget

**Goal:** Reduce repeated source-read pressure when prior reads are costly or fail, without changing visuals, freshness warning thresholds or source data.

**Evidence:** User saw Read delayed then Unavailable before manually closing Agent Flow, and reports T3 became clearly more responsive afterwards. A live SSE observation captured unavailable health but not its reason. The subsequent closed-port result was caused by user closure, not proof of a crash. The machine also had low available physical/commit memory. This supports a load contribution but does not identify source reading versus rendering as the sole cause. Current code always waits only 2s after a completed read or failed-worker termination, regardless of cost.

**Choice:** Desktop/relay worker path only. Keep the 2s minimum. After a completed healthy request, rest for three times its measured elapsed duration, clamped to 2-5s. Fast reads retain the existing cadence; expensive reads trade some freshness for less repeated load. Failed reads/restarts wait 5, 10, 20, then at most 30s; healthy health resets failure count. Keep one poll/worker at a time and wait for old worker termination. The 30s watchdog and existing stale-warning calculation remain unchanged. Report a specific safe failure category (timeout, worker error, exit, memory limit, dispatch), never exception messages/paths. VS Code's synchronous adapter is unchanged.

**Validation:** No real T3 reads, UI control or native benchmarks while investigating reported pressure. Use mock clocks/controlled worker fixtures and owned SQLite fixtures only. Keep test concurrency at one. Claude read-only review before delivery.

- [x] Integration timer regressions: slow request cooldown cap, fast recovery, repeated source/worker failure backoff/reset, no overlap during termination, specific private-safe failure reason. Watch RED before production changes.
- [x] Implement adaptive scheduling and safe failure categories in extension/src/t3-worker-watcher.ts. Preserve source health freshness/retained state and diagnostics off/default semantics.
- [x] Run focused and full affected root/extension tests and types; build bundles/package without source DB smoke. Record that CPU/FPS/live improvement is unmeasured. Claude review, verified install only while app closed, merge/push under standing authorization.

## Validation and limits

The first RED run had five expected failures: the two earlier retry tests still observed the old 2s restart, the new costly-read cooldown and repeated-failure tests found no rest, and the memory failure reason was generic. After implementation, one new fixture needed to flush both termination-promise microtasks with setImmediate before ticking its retry clock. Production behavior was unchanged by that fixture correction. Existing mocked-worker tests now pin the monotonic clock so host scheduling cannot accidentally turn a deliberately fast fixture into a costly read.

Focused worker tests passed 9/9. Sequential full checks passed root 71/71 and extension 115/115, extension types and relay/extension/desktop-worker bundles. Logs: artifacts.local/performance-adaptive-read-20261119/status.json. The initial desktop-worker build used exactly the existing desktop/build.cjs esbuild settings. The final desktop build also rebuilds the UI after the review correction to its check-interval help text; the Electron runtime is unchanged. Tests use owned fixtures and concurrency one, not the real T3 DB.

Candidate app.asar: 6,992,456 bytes, SHA256 1f57fb498e55fe73b58e2d425bacb6c0e483e6123192c205fbfa57da22043cd2. Packaged smoke opened ONLY an owned synthetic 20-team SQLite fixture, enforced fixture-prefixed IDs, received 20/20 and two healthy updates, and verified the fixture hash unchanged. It opened no native window and did not read real T3. End-to-end harness elapsed was 101.389s on the contended machine, so this is a loader/correctness check, not a speed or bounded-startup measurement. The harness timers do not bound all synchronous I/O and shutdown. The probe and its temporary fixture exited/cleaned up; no repeat or real-source benchmark was started.

The adaptive rest is based on request elapsed wall time (including startup/dispatch delay), not CPU consumption, and is not a CPU cap. The nominal pollIntervalMs remains the 2s minimum; freshness-warning thresholds were not raised to cover the extra pauses. Under pressure a view can still legitimately be delayed/unavailable. A native worker that never finishes termination still blocks replacement by design to avoid accumulating readers. Specific failure labels improve future diagnosis but do not identify which failure occurred in the screenshot. Full-effects renderer cost and actual improvement to T3 responsiveness remain unmeasured after this change.

No SonarQube binding/scanner configuration was discovered in the repository; no server Quality Gate or analysis date is claimed.

## Claude review and corrections

Claude found no blockers or proven defects in scheduling, counters, failure guards, disposal or safe error categories. The requested clarification is explicit: the numeric stale threshold is unchanged, but the extra rest makes a slow read cross that threshold sooner (roughly a 5s read plus 5s rest rather than an 8s read plus 2s rest). A transient failure can remain Unavailable for its 5-30s cooldown, and failed-worker cooldown starts after termination settles. This is a load/freshness tradeoff, not removal of the underlying failure.

The Connected help text now calls 2s the minimum interval and explains longer reads/pauses, rather than promising a check every 2s. An additional controlled-clock test covers a costly successful recovery: its 3s rest is preserved while the following failure resets to the first 5s backoff. Focused worker tests passed 10/10 and existing web team-model tests 23/23; no new test mirrors the wording. Claude did not run builds, tests or probes. Actual T3 responsiveness/CPU and Full-effects behavior after the change remain unmeasured.

## Installed package

The final full desktop build exited zero after the help-text correction. Final ASAR is 6,992,535 bytes, SHA256 c971e1456f0bb7599cb14896dc5b85981f876cdcf212f733f7dda68420b4e1b1. Its two backend bundles are byte-identical to those exercised by the synthetic packaged smoke. Installed UI help text and backend member hashes were verified using native Windows archive member paths. Agent Flow was closed; the installer saved the prior 17b8a521863a83acd449005f60ea361ec3c1028c55c69293f895a4e34b739924 bytes as verified rollback and copied the final candidate. No native window was opened and no real T3 smoke/soak was started. The remaining rollout question is actual responsiveness under the user's workload, not fixture correctness.
