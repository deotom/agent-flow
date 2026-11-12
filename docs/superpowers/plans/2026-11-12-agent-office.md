# Agent Office Implementation Plan

> **For agentic workers:** Use the approved spec and task ownership below. Tests precede the behavior they verify.

**Goal:** Ship the approved all-team Office as a real T3 pane.
**Architecture:** Pure snapshot/layout/identity and event helpers feed a Canvas painter plus accessible React labels; the existing TeamWorkspace owns source health and evidence details.
**Tech Stack:** TypeScript, React 19, Canvas 2D, existing node:test/tsx and Vite/Electron scripts.
**Spec:** `docs/superpowers/specs/2026-11-12-agent-office-design.md`

## Global Constraints

Read-only existing T3 data; preserve Board/Graph/native modes; no new dependencies. IDs establish relationships; unknown values remain unknown. No initial/history replay. Motion obeys preferences and source visibility/health.

## Review Focus

- Multiple teams containing the same local agent ID must never share selection or identities.
- Late-loaded teams and reconnects must not replay historical assignments/delivery.
- Large teams, nested agents, missing parents and quiet teams remain inspectable without truncation.
- Full/low/off/reduced motion, stale sources, hidden panes and unmount stop or clean up animation work.
- Persistent identities survive reorder and new arrivals; malformed local preferences must not break the pane.

### Task 1 — Pure Office model and tests (model worker)

Files: `web/lib/office-model.ts`, `web/test/office-model.test.ts`; shared contract: `web/lib/office-types.ts` (parent-owned).

- [x] Write and run failing behavioral tests for cross-team layout/selection keys, quiet/nested teams, stable identities and evidence-only event diffs.
- [x] Implement `officeKey`, `assignOfficeIdentities`, `officeAppearance`, `buildOfficeScene` and `officeEvents` using the agreed interfaces.
- [x] Run the targeted model tests and report results and limits.

### Task 2 — Pixel painter and tests (art worker)

Files: `web/components/agent-visualizer/office/office-art.ts`, `web/test/office-art.test.ts`.

- [x] Write/run failing checks for all character species and time phases using a recording context.
- [x] Port approved art to DOM-free `drawOfficeFrame` and `drawOfficeAvatar`, driven by the shared contracts, arbitrary floors and real actor positions.
- [x] Verify no invented providers/names, dynamic height, valid drawing coordinates, time phases and pause-compatible animation time.

### Task 3 — Motion and React integration (parent)

Files: `office-motion.ts`, its tests, `office-view.tsx`, `office.css`, `team-workspace.tsx`, `index.tsx` and integration tests.

- [x] Write/run event-path and pane regression tests before implementation.
- [x] Implement finite event-based trips, queued/coalesced for the shared elevator; skipped phases do not become fake acknowledgements.
- [x] Add Office selection/persistence, all-team header, quiet-team expansion, labels, evidence details, local clock, pets and pause controls.
- [x] Ensure cleanup, hidden/stale-source behavior and responsive layout; test and type-check.

### Task 4 — Verification and delivery (parent)

- [x] Run relevant suites and the project test commands, TypeScript checks, desktop build and tests; inspect failures.
- [x] Perform an independent final review and resolve important findings.
- [x] Build/package to a separate output if the installed app is locked; report a runnable path and any visual-verification limits accurately.

## Execution ledger

- Approved prototype and user instruction: implement, with delegation authorized.
- Continue the existing `feat/t3-team-hud` task in the shared checkout; worker files do not overlap.
- Identity and quiet-team layout use stable ID ordering rather than re-sorting the building on every status update; attention remains explicit in badges and summaries.
- No push, merge or automatic app shutdown is part of this implementation.
- User refinement: quiet/hidden teams depart through the entrance and may return when active. Keep the old floor geometry until departures finish. Arrival/departure animation is display presence, not a delivery acknowledgement.
- Independent review found desk-to-door teleportation and first-populated-empty-team replay. Both received regression tests that failed before fixes and passed after; final web suite passes 173/173. Root suite 52/52, desktop suite 18/18, TypeScript and desktop build pass.
- Corrected integration findings: preserve absent identity reservations, detect actual new workers, keep event IDs stable without optional timestamps, reject mismatched parent IDs, align the shared lift shaft, and paint furniture before people.
- Packaged executable: `artifacts.local/desktop-office-25691112-225928/Agent Flow-win32-x64/Agent Flow.exe`. Existing app was not closed or overwritten.
- Visual QA: the real React Office component was bundled into a self-contained verification page. Headless preview rendered all seven distinct agents, actual test-fixture provider/activity labels, quiet-team control and the shared lounge with no runtime errors. Native Electron fixture capture could not load the local verification page; the packaged application was not launched in place of the user's current instance.
