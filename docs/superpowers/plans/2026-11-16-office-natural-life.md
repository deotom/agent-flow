# Natural Office Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for root integration and bounded native helpers for independent modules. Root owns shared view/art files. User approved all five follow-ups and the existing autonomous execution workflow.

**Goal:** Natural object contact, orderly shop visits, entrance dressing, calmness controls and bounded build output.

**Architecture:** Extend pure geometry/policy helpers and the existing trip runtime; keep real snapshots authoritative. Root integrates renderer/preferences, helpers work in isolated file ownership, Claude reviews before delivery.

**Tech Stack:** Existing TypeScript/React/Canvas, Node desktop packager, no dependencies.

**Spec:** ../specs/2026-11-16-office-natural-life-design.md

## Global constraints

Original painted underground theme/camera and unique identities stay. No backend/economy/source mutation. Work preempts cosmetic actions. App pause/effects-off override optional activity; preserve existing reduced-motion behavior. One shared lift, no auto-peek, bounded actors. No historical artifact deletion denied by policy.

## Review focus

Retarget while sitting or dressing, queued shoppers becoming working/hidden, cabin reservations while shoppers wait, day/night or setting changes during an outing, invalid/symlink/protected package targets. Each owner's tests must pin its cases.

### Task1 — Contact geometry (root)

Files: new web/lib/office-support.ts and tests; office-art.ts, office-contacts.ts and existing scene/prop anchor adapters as necessary.

- [ ] Inspect painted support anchors and current seat blending; write failing support/palm/depth tests.
- [ ] Implement one contact transform for support and palms; preserve original feet and foreground furniture occlusion.
- [ ] Verify standing/seated/transition/real-work preemption with contact tests.

### Task2 — Physical shop queue (vendor helper)

Files: new web/lib/office-shop-queue.ts and tests; office-daily-runtime.ts, office-outing-trips.ts, office-vendor.ts and their tests. No view/art edits.

- [ ] Write overlapping-customer, stable order, waiting-position and cancellation tests; verify red.
- [ ] Implement bounded queue reservations and real walking/waiting before service; keep lift timetable consistent and collection only after service.
- [ ] Run focused runtime/queue tests; report exact interfaces for root's visual waiting marks.

### Task3 — Entrance wardrobe (wardrobe helper)

Files: new web/lib/office-wardrobe-transition.ts and tests only. Root owns renderer integration.

- [ ] Define a pure transition frame/store using motion-clock milliseconds and existing OfficeWardrobeLook; test initial look, reversal, pause, in-lift and pruning.
- [ ] Produce from/to/progress/dressing metadata without touching identity, trips or source actors.
- [ ] Report APIs; root crossfades layers and animates only the free hand at the doorway.

### Task4 — Atmosphere and artifact policy (policy helper)

Files: new web/lib/office-liveliness.ts and tests; desktop/package.cjs, a focused artifact-policy module and desktop tests. No runtime/view edits.

- [ ] Test invalid persisted values and exact profiles from spec; implement pure policy/default normal.
- [ ] Test safe fixed output paths/protected canonical app/temp fixtures; default packaging to reusable review candidate and expose a legacy inventory/report without deleting it.
- [ ] Root adds persisted compact selector and applies policy to outing/social/optional-object cadence while preserving scheduled meals and actual work.

### Task5 — Integration and delivery (root)

- [ ] Integrate helpers sequentially; meaningful tests for changed cross-module ownership.
- [ ] Full web/desktop relevant tests, TypeScript/build; bounded native checks if available, no capture retry loop.
- [ ] Detailed Claude review, fix verified findings locally, reuse final candidate, commit and reopen canonical app. Report any cleanup/capture blocker.

## Reconnecting investigation (user steering)

Live SSE remained open and reported three successful reads in 30s, but completed-read gaps reached 11.373s, exceeding the unchanged 10s silence rule. App main remained responsive; one renderer used about1.3GiB, worker43% of one core, GPU58%, on12logicalCPUs with about6GiB RAMfree. No claim that all slowness comes from this one cause.

A bounded readonly source profile measured10.478s total (SQL3.277s; full projection6.670s wall/5.281sCPU). It read26,667 historical nodes although only delegation-parent nodes were needed, and items used a per-row correlated latest-run query. Fixed referenced-node retrieval, materialized newest-run pairs, first-match parent lookup, memoized parent resolution and per-invocation payload parsing. No T3 writes, schema changes, capped history or changed Reconnecting threshold.

After profile:20teams,2.407s total,205referenced nodes, full projection1.173s wall/.782sCPU. These are individual local samples under variable machine load, not a controlled benchmark or a guarantee. Synthetic regression pins bounded node reads and per-call payload parsing. Reader schema-loss, WAL-read-only and older-running/newer-cancelled behavior remain covered. Final live health must be remeasured after installation.

## Claude review and bounded fixes

Claude found one delivery blocker: a stray desktop/artifacts.local package was being nested into app.asar, making the archive384MB. Added an explicit artifacts.local ignore and an isolated packager-options regression that failed before the fix. Historical directories themselves remain untouched. The rebuilt archive must contain no artifacts.local entry and be under15MB before installation.

Multi-frame preemption regression reproduced repeated shop arrival cancel/rebuild. Cosmetic arrivals now remain unreserved until real travel clears; returns for real work and indoor relocation are exempt. Queue/runtime33focusedtests passed; packager/installer16focusedtests passed. Calendar wardrobe refresh now fades in place for seated agents while outdoor protection and collar gestures retain their entrance rule. Crossfade keeps both proper alpha-weighted layers; full-old-under-new would make nonoverlapping old garment pieces disappear abruptly at the end.

Final checks:442TypeScript web tests passed plus supplementary TSX/component/lib and updated wardrobe/queue checks; desktop34passed; extension103passed. Web and extension type checks passed. New visuals remain unverified live because the native capture pipe is unavailable. No new delegate was started for these bounded review fixes.

## Installed checkpoint and remaining performance limit

Rebuilt and installed the canonical app after normal shutdown, retaining the verified previous ASAR in desktop-last-good. Candidate and installed SHA256 match: 5DFC2B4E32709F3599C7508E7E72D69E43DB577B965B7257E864C4863BDA2AE4. Archive size is 5,234,710 bytes and its header has no artifacts.local entry. The running worker contains the node index, referenced-parent query and latest-runs CTE changes.

Post-install SSE stayed open and all observed reads succeeded. However, a second bounded 45-second sample recorded only three health updates and a maximum completed-read gap of 15,796ms. Reconnecting is therefore NOT resolved. The isolated reader improvement does not establish live responsiveness; machine load and the real relay path need further profiling. The warning threshold remains unchanged. Do not claim a network fix, stable live cadence or new visual verification from this checkpoint.

Historical package cleanup was blocked by automatic policy and no historical directories were deleted. Packaging now excludes the stray nested package and reuses a bounded candidate path. Existing cleanup preview remains available for manual review.
