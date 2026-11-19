# Realtime worker, paint and storage follow-up

> Implement with disjoint agents and root integration; tests/builds are serialized. User explicitly requested all four proposed follow-ups and retained Claude review before delivery.

**Goal:** Preserve realtime multi-session truth and Full effects while reducing blocking reads, repeated SQL, paint cost and obsolete local history storage.

**Architecture:** Keep the existing read-only T3 projection contract. Run relay polling in a separately bundled worker, preserve ordered events/reconnect state and completion-based scheduling, and reuse team projection results only when the complete freshly-read projection input is exactly equal. All SQL and reply reads still run; connections close after each poll. A persistent data_version cache was rejected after a Windows probe proved that even an idle read-only handle prevents renaming the source DB (EBUSY). Metadata schema alone cannot prove a coherent cross-connection revision contract. Preserve replacement, failure and WAL recovery. VS Code retains its existing synchronous host adapter.

**Rendering:** Replace CSS paint-driven decorative sweeps with transform-based layers and crossfade a fixed row glow, keeping status meaning, endpoints, timing, Full effects default and stale/off behavior. Native evidence is required; prior layout improvement does not prove paint improvement.

**Storage:** User authorized clearing obsolete local history. Limit Electron clearData to indexedDB for metadata-verified http://127.0.0.1 ports in the file-top-level partition, preserve the current origin and all localStorage/settings, and refuse alternate profiles, junctions or a running Agent Flow. Use origin-in-all-contexts so the iframe partition is included. Do not touch the T3 source database, credentials, projects or arbitrary files. Preview and record the exact origin list before apply. Do not use broad filesystem deletion.

## Corrections and cleanup evidence

Claude's integrated source review approved paint/cleanup scope and identified missing watchdog/restart-lifecycle coverage. Root additionally reproduced Windows EBUSY with a standalone owned SQLite fixture. The reader now closes after every poll; the worker has a30s watchdog, termination-gated retries and restart-baseline lifecycle reconciliation. Root corrected two integration-test fixture issues (retained-handle cleanup and smoke entry resolution from extension CWD). No cache based on mtime, private WAL formats or an unproven producer revision is used.

Cleanup was re-previewed immediately before apply, with all ports below40000 automatically protected in addition to current26010. Nine focused tests passed. An Electron45 entry probe showed require.main!==module, so CLI entry detection explicitly matches its own argv path under Electron; library imports remain inert. The first helper had not run deletion; it was stopped and the corrected helper completed with exit0.

Before:38,055,578,894 bytes across109,495 files in the66 metadata-selected obsolete IndexedDB directories. After the origin-scoped Electron API:0bytes/0files in that set. The desktop-settings.json SHA256 stayed729a681e58f10916ed9368930ce00170a6a0d39cc04f9037f8ff6a98b171fb5c. Current/stable origins, localStorage and source T3 history were excluded. Evidence is ignored artifacts.local/performance-audit-20261119/history-{cleanup-preview,cleanup-applied,size-before,size-after}.json. API reference: [Electron session.clearData](https://www.electronjs.org/docs/latest/api/session#sescleardataoptions).

## Tasks and ownership

- [x] T3 agent: worker adapter/entry, relay and bundle integration, unchanged-read cache, WAL/concurrency/replacement/lifecycle/nonblocking regressions.
- [x] Rendering agent: team rendering CSS/markup and regression for geometry/paint-driven keyframes; focused tests/types.
- [x] Root: cleanup utility/tests, inspect metadata preview, Claude review, then apply the already authorized narrow cleanup and record reclaimed storage.
- [x] Root: affected full tests/types/build/package, inspect bundle paths/ASAR size, Claude integrated review and fix material findings.
- [x] Root: install candidate with verified rollback, actual multi-session/native check, then 30-minute soak with two clients and periodic reconnects. Keep CPU-heavy builds/scans off the measurement window. Check source health/delivery latency, session completeness, process/heap trend and new IndexedDB absence. A short trace is not displayed FPS or a leak proof.
- [x] Root: record evidence and limitations. Full effects was verified before the native capture; physical Escape stopped Computer Use, so final mode/Office restoration is unconfirmed. Integrate/push under standing authorization after review.

## Alternatives considered

Raising stale/reconnect thresholds would hide lag rather than remove blocking work and is rejected. Timestamp/mtime-only cache invalidation misses WAL changes and is rejected. Lowering Full effects or deleting graphics changes the requested appearance and is rejected. Raw deletion of numeric storage buckets risks Chromium metadata and is rejected in favor of its origin-scoped API.

## Validation constraints

No new production dependency, no source DB writes or indexes, no unbounded worker restart loop or message queue, no synchronous fallback on a failed worker. Keep initial/recovered session list and whole-snapshot replay consistent. Report measured versus inferred outcomes, and keep machine-load/tracing/viewport confounds explicit. Existing native and SSE baseline artifacts remain unchanged.

## Final implementation and packaged verification

The asynchronous cold start exposed a separate SSE write-completion issue. Two packaged clients initially stalled at 14/20 teams with writableLength zero and no later drain event. The accepted frame is still removed exactly once. A coalesced setImmediate from the write callback now resumes only when the pending buffer is empty; drain listeners are installed before write, and disposal clears the immediate and timeout. Unknown-length sinks keep the ordinary drain contract. Queue, frame and timeout limits were not raised. Regression tests cover synchronous drain, callback-before-byte-accounting, and mixed-size HTTP cold delivery.

The full verification run passed root 66, extension 110, web 528 and desktop 46 tests, plus types, extension/desktop builds and package. After the final SSE corrections, affected root tests passed 69 and desktop 46; SSE types and desktop build passed. The current combined coverage is 753 passing tests. No product source changed after those runs. Logs are in ignored performance-worker-paint-20261119 and performance-drain-final-20261119 directories.

The final package reused the existing Electron 45 runtime after a redundant runtime download stalled; compiled dist files were overlaid into a guarded extraction and repacked, with source/bundle hashes and unchanged main.cjs checked. No dependency/runtime change occurred. Installed app.asar is 6,988,776 bytes, SHA256 128d450abed14fce181e111e972c353a78ea606eb5ca618286ef7cbb081935c0. A repeat build/repack produced the same hash. The actual packaged cold main/secondary/reconnect clients each reached 20/20 with zero mismatches, verifying worker loading from the packaged ASAR. The installer retains verified previous bytes; that is not a behavioral rollback certification.

## Completed 30-minute evidence and limits

The stream collector ran 1800.067 seconds, and native metrics ran 1802.091 seconds. Both healthy clients held 20/20 teams throughout, with zero unexpected ends, mismatches or parse errors. All six reconnects recovered to 20/20 in 354-1302 ms. The intentionally stalled client ended with response-error at 4/20; normal streams remained complete and the subsequent reconnect recovered. All 727 observed health events were ok.

The maximum source-check gap was 29.602 seconds, with a 29.140-second arrival gap; reconnect-900 also recorded a 26.820-second source gap. The probe event loop had p99 114 ms and max 1.575 seconds. These maxima are not paired causal observations. Transport correctness passed; source latency is not solved.

Native memory sampling attempted 53 observations, with 52 successes and one Performance.getMetrics timeout at 941.656 seconds. Renderer JS heap started at 28.03 MB, ended at 26.84 MB and peaked at 48.90 MB. Early/late warm medians were 19.3/30.8 MB. Node utility private bytes started at 148.0 MB, ended at 172.8 MB and peaked at 222.9 MB; early/late warm medians were 168.3/167.3 MB. No forced GC or retention analysis was done. These changing samples do not establish leak absence. IndexedDB databaseNames was empty at start and end; enumeration can create empty metadata, so this is not a zero-disk claim.

The short native Board capture measured renderer CPU at 60.7% of one core, with 0.403 seconds layout over a 33.03-second metric window. This is not a controlled comparison: task load, clients, viewport, tracing and mode differ from prior runs. DrawFrame events are not displayed FPS, and GPU-process CPU is not GPU utilization. During the soak, mode/visibility changed and the user stopped Computer Use with Escape after about 11 minutes. No later screenshot or final-mode verification exists. Full Office CPU/FPS across the entire soak is unmeasured.

Evidence: artifacts.local/performance-audit-20261119/{worker-paint-soak-result,worker-paint-soak-metrics,worker-paint-soak-summary,installed-worker-paint-final,native-board-paint-final}.json. Artifacts remain ignored because they are local diagnostic output.

Claude approved the worker/cache/lifecycle and cold-start SSE source fixes in separate read-only reviews, then independently recomputed the completed soak, native and cleanup evidence. Final evidence review accepted the narrow transport/cleanup claims with the limitations above; it did not run tests or claim a general performance fix. No SonarQube binding or scanner configuration was discovered in this repository, so no server Quality Gate or analysis-date claim is made.
