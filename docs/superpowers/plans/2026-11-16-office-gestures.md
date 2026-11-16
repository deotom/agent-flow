# Office Natural Gestures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Root integrates bounded native helper modules, then obtains detailed Claude review.

**Goal:** Natural walk/stop/object gestures and restrained shared rest using actual current agents.

**Architecture:** Trip frames keep timing and ownership but expose eased on-foot positions and gait. Pure geometry anchors avatar hands and props. Pure shared-rest selection supplies paired pose overrides after lifecycle poses, with explicit busy/eligibility guards. Root integrates object-hold and daily-seat blends.

**Tech Stack:** Existing TypeScript/React/Canvas and Node tests; no dependencies/assets.

**Spec:** ../specs/2026-11-16-office-gestures-design.md

## Global Constraints

No changes to trip durations, lift reservations, source snapshots, room admissions or art/camera. Lift phase trajectories stay linear. Real work wins immediately. Paused interaction windows are empty. Shared rest never adds travel or seat reservations.

## Review Focus

- Contiguous on-foot waypoints versus lift phases: no repeated stops or rider/car drift.
- Sitting at an object versus a standing spot: no new chair/seat, finite continuous blend.
- Hidden/moving/faded/source-working or busy participants: immediately excluded; no double pose ownership.
- Night/wet garden, crowded rows and private annex coordinates: bounded disjoint nearby pairs, no false stars in rain.
- Props under facing/breath/sip/reach: follow actual palm, do not duplicate mugs or float over the shaft.

### Task1 — Walk frames (native helper)
- [x] Add regression tests and pure walk profile/gait helper; verify red.
- [x] Integrate on-foot easing, gait and walkWeight into officeTripFrame without touching lift phases/timing; verify targeted motion/lift tests.

### Task2 — Shared-rest pairs (native helper)
- [x] Add pure guarded pair selector/pose tests; verify red.
- [x] Implement deterministic bounded day/night windows and compatible prop gestures; report APIs and targeted verification.

### Task3 — Contact and seating (root)
- [x] Test and implement pure palm/prop contact geometry; reuse it in avatar rendering.
- [x] Blend object-hold/daily seated poses and integrate pair poses with existing busy ownership/chat.
- [x] Native movement/object/pair captures with original painted scene; verify work interruption and pause.

### Task4 — Final verification and delivery (root)
- [x] Full web tests, TypeScript and desktop build; detailed Claude review and fix verified findings.
- [x] Local commit, package, normally reopen canonical app/profile and verify installed app. No push.

## Implementation checkpoint — 2026-11-16

Tasks1–3 implemented. Final web suite408/408 passed; TypeScript and desktop build passed. Root corrected the synthetic walk test's missing parentKey after typecheck. Walk/lift focused tests preserve exact lift trajectories and trip durations; contact, seated transition, cutaway visibility, palm-clearance and anchored-rest regressions pass.

Native production OfficeView369px evidence under artifacts.local/office-verification/gestures-*: a natural private toast before12seconds; real source-running update removes the participant within150ms; pause clock froze exactly across900ms; clicked book trip traversed x186.75→315→home with99walk frames and seatBlend.0036→1. Total44.278real captureseconds, UI/storage/hooks restored. Root viewed pair and seat frames. Native coverage does not include night/snack-return/lift; stills cannot prove continuous foot stability. Final helper guards were checked offline against the exact observed toast source/time: same pair, offer.9583 instead of1. Shared selection now uses a single global visible-scene budget for public and open private canvas. Rest render anchors replace legacy decorative lateral sway; actual trips remain intact.

Claude review could not start: delegate_task returned provider_unavailable, and refreshed capabilities report Claude Agent CLI installed but timed out while running; canRunChildTask=false. No replacement reviewer has been selected. Preparing the review candidate package; commit and canonical app update remain behind the user's requested review gate. Existing app is untouched by this batch.

User explicitly chose to wait for Claude before delivery. Do not substitute Codex/another reviewer or install/commit this batch without completing the required Claude review. Candidate package completed at artifacts.local/desktop-gestures-20261116-review-candidate/Agent Flow-win32-x64; ASAR SHA2562274C0B5CD890B7B64749CFF41204B141264D1733EB33865CC33B5130B31DF74. Canonical running app remains the prior clarity package (ASAR1764B28388816B0632B135FDD92DBF6FDB20B708EF25FEC128565BB728010F82). Resume by attempting the same approved Claude review when the provider is available; inspect existing changes before rebuilding or repeating mutations.

## Claude review completed — 2026-11-16

Claude returned a detailed read-only source/artifact review with no delivery blockers. Corrected the lift hold-facing convention so it matches the unchanged ride convention, preserving on-foot hold direction. Removed dead anchored-rest eligibility calculations from the per-frame shared selector. Also restricted the2-unit settling offset to explicit seatBlend poses, preserving ordinary seated artwork height. Two new regressions were observed failing before those corrections and passing afterward;40focused motion/contact/shared/lift tests passed. Final full checks/package/install are now proceeding with the required review gate satisfied. Earlier unavailable-provider notes above are historical checkpoints.

## Final delivery verification — 2026-11-16

Final full suite410/410 passed; TypeScript, desktop build and final packaging passed. Final package artifacts.local/desktop-gestures-20261116-final/Agent Flow-win32-x64 installed after a normal close/reopen of the canonical app using the existing profile. Source/installed ASAR SHA256 both7ECF8A88CD14A046D9AD9963EC311E20899C559360B13DCC04F2E09E2501E271. Live app Connected at369px width with4visible agents/8stations; station panel, private door, peek focus, Back and focus restoration all passed. Actual source outing caption was taking a warm drink outside. Final live screenshot inspected at artifacts.local/office-verification/gestures-live-app.png. No Sonar binding/scanner configuration was found. Local commit only, no push. Earlier blocked-provider/candidate notes remain historical checkpoints; the required Claude review was completed before final installation.
