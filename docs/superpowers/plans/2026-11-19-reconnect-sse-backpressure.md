# Repeated T3 transport reconnects

## Reproduction and cause

The screenshot says Reconnecting, which is set only by EventSource.onerror; a slow healthy source is already classified separately as Read delayed. No native Agent Flow process was running when the investigation reached the machine, so this record does not claim a native UI reproduction.

Three read-only all-project T3 probes returned healthy source state in 2.2–2.5 seconds, with twenty latest snapshot frames totaling about 4.71 MB. The largest frames were about 1.99/1.36/1.22 MB. No titles, prompts or replies were saved in diagnostic files.

A real loopback HTTP test using the original distributeRelayMessage reproduced a server-ended SSE response after 31 ms, with one slow-client drop. The old sender wrote the entire synchronous replay without waiting for drain, then disconnected when writableLength passed 4 MiB. Reconnecting simply replayed the same oversized aggregate again. Removing historical snapshots had reduced growth earlier but did not pace the current-state replay or live burst.

## Fix

One writer owns every frame sent to a response. write(false) means that frame was accepted: stop and resume only on drain, without sending it again. Initial/current T3 snapshots and latest-state metadata are held by reference and serialized on demand. Repeated queued states for a team replace the pending older value. Incremental native data preserves FIFO order and a 4 MiB raw-string backlog budget. Pending frame count is capped at 16,384; one encoded frame is capped at 32 MiB; a 15 s drain deadline closes only a stalled client. These are independent limits, rather than an increased writable queue threshold. Close/error release pending references, listeners and timers. Native history replay is split into batches of 128 events.

No UI label thresholds, source statuses, SQLite query contracts or user data were changed. All reads remain read-only.

## Verification so far

- Regression tests cover accepted-once frames, aggregate replay above 4 MiB, deferred serialization, latest-state replacement, bounded FIFO/state counts, failed-peer isolation, close/error races, drain deadline and frame limit.
- A synthetic real HTTP client receives six 1 MiB snapshots and a subsequent live health frame without a server close.
- Repeating the original live-source HTTP probe after the fix kept the stream open and received all twenty frames.
- The complete real T3 relay received all 20 expected teams and four health frames over 8.2 s, including subsequent live updates, without reconnect. Peak observed response writableLength was about 1.99MB. These are bounded uncontrolled observations, not proof that every future transport failure is eliminated.

Additional multi-session validation:

- Synthetic HTTP coverage connects three clients concurrently, pauses one receiver, and replays eight sessions of 768 KiB each with interleaved revisions. Each receiver gets the latest matching session; a fresh connection gets the subsequent revision.
- Actual read-only T3 coverage connects two clients concurrently, then reconnects one. All three runs received all twenty expected teams and four health frames, with zero event/team session-ID mismatches. Runs lasted about 10.9–11.7 seconds; these are bounded observations rather than a long-duration soak.
- Full validation finished at 2026-11-19 01:07 UTC: root 62, extension 104, web 519 and desktop 34 tests passed (719 total, zero failures). Web, extension and SSE type checks, extension/desktop builds and desktop packaging exited zero. Candidate ASAR is 6,968,590 bytes.

Claude's read-only review found no proven bugs or blockers. Its medium risk was a count cap tighter than the byte budget for small native events. A new mixed-load test reproduced that drop with a 2 MiB T3 frame followed by 4,000 incremental events; raising the bounded count limit to 16,384 preserves that burst and its FIFO order, while the 4 MiB native byte limit remains. All 14 focused relay/writer tests passed after the correction. The snapshot payload guard was also made optional-safe. Deferred shared references and per-client serialization remain explicit tradeoffs; this is not an unlimited-session guarantee.

Final post-review verification finished at 2026-11-19 01:14 UTC: root 63, extension 104, web 519 and desktop 34 tests passed (720 total, zero failures); all type checks, builds and packaging passed. The canonical installed ASAR matches the candidate SHA-256 `594faca71038d5e265df6ae735bc5802bd2453d3e7484f2dcd68ded2cb93c527`; the previous canonical was verified and saved as last-good.

The installed Electron executable ran its packaged worker against actual read-only T3. Two simultaneous clients and one subsequent reconnect each received all twenty expected teams, four health frames and zero session mismatches, over about 9.0–9.5 seconds per run. Each stream stayed open until the probe closed it. This validates the installed transport path, not the native UI or a long-duration soak. The probe stopped only its own worker.

Evidence is ignored under artifacts.local/reconnect-*.json and artifacts.local/reconnect-validation-20261119; diagnostics contain counts/timings only. No SonarQube binding or scanner configuration was found in this repository; no server analysis is claimed.
