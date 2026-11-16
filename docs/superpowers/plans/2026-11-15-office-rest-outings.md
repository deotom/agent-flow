# Office Rest Outings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Follow the existing authorized native team workflow with bounded file ownership and a final Claude review.

**Goal:** Resting current agents occasionally walk out, collect snacks or drinks, relax and return, with slower one-person nights.

**Architecture:** A pure outing scheduler feeds the existing OfficeDailyRuntime visitor map. One controller owns every visitor, seat, physical trip and shared lift reservation. Daily attendance remains coffee/lunch/tea only; outings have session-local cooldowns and no backend effects.

**Tech Stack:** Existing React, TypeScript, Canvas/WebP assets and Node tests. No dependencies or external shopping/weather APIs.

**Spec:** ../specs/2026-11-14-office-rest-outings-design.md (approved).

## Global Constraints

- Viewer-local daylight night predicate; day interval60–100s, max2 outings; night180–300s, max1. Initial delay20–40s day/45–75s night. Motion time freezes with the existing pause/visibility policy.
- Per-person cooldown6–10min day/10–15min night; deterministic jitter and fair rotation. No backlog after pause/reconnect and no historical or at-home agents.
- Only visible idle/done/cancelled private-room residents or actually idle root leads; real work/waiting/failed always take precedence.
- Shared4 garden seats count parties, meals and outings. Rain/storm/full garden uses an indoor home object. Outings never open canteen, wake a closed night shop or reserve a lift throughout their dwell.
- Preserve source snapshots and original painted underground camera/theme. Bags/mugs and gestures are decorative; no purchases or actual messages.

## Review Focus

- Party arrives or rain starts during an outing: retarget safely and retain physical origin/seat reservation.
- Source work resumes while queued/aboard: return safely, source status stays accurate.
- Day→night/pause/resume: finish existing journeys, lower admission rate, never replay missed windows.
- Meal begins during outings: daily activity admission gets priority and shares capacity; existing actual trips stay owned once.
- Removed floor or reconnect: retain geometry until the traveler exits, no duplicated actors or stale lift/origin state.

### Task1 — Pure rest outing scheduler (native agent)

Files: create web/lib/office-rest-outings.ts and web/test/office-rest-outings.test.ts.

Interfaces: `OfficeOutingAction = 'snack'|'drink'|'stretch'|'stargaze'`; `OfficeOutingSchedule` owns nextAt/cursor/lastByActor; `planOfficeRestOutings({date,at,scene,state,busyKeys,guests,weather,blocked})` returns immutable next state plus accepted invitation candidates `{actorKey,kind:'outing',occurrenceKey,destination:'garden'|'home',seat,action,night,dwellMs}`. Root marks attendance/cooldown only after a trip is successfully admitted.

- [x] Add tests proving day/night bounds, initial delay, eligibility, cooldown/fairness, shared seats, blocked/daily-window suppression and phase-change no backlog; run red.
- [x] Implement pure scheduler and explicit admission function to consume a candidate; run targeted tests green and report APIs.

### Task2 — Unified visitor runtime and View integration (root)

Files: office-daily-runtime.ts, office-types.ts, office-view.tsx, office-art.ts; tests office-daily-runtime.test.ts and outing integration tests.

- [x] Extend visitor kinds to include outings without widening persisted daily ledger kinds; add outing metadata separately.
- [x] Reuse the existing travel/retarget/return paths. Outings use home or garden, never canteen; existing garden collision planning applies.
- [x] Keep meal priority, actual task priority, global ownership, source status and bounded seat reservations. New admissions consume scheduler cooldown only on successful travel.
- [x] Render snack/drink/stretch/stargaze poses, outbound approach and wrapped snack return; preserve departure handoff/origin pruning.
- [x] Test outing→source work, rain/full/party relocation, meal takeover and paused day/night transitions.

### Task3 — Painted outing props (native agent)

Files: new office-outing-art.ts and its focused tests; existing assets reused only.

Interface: `drawOfficeOutingArt(ctx,scene,time,art,guests)` accepts actual visitor frames `{actorKey,action,phase,floorId,x,y,night}`. No scheduler/lifecycle state mutation. Public vendor cues only on actual daytime snack visits; night drink/star poses remain quiet, indoor scenes use the existing object spot.

- [x] Add meaningful recording-context checks for no visitor/no props, night no open shop and actual actor-attached bag positions; run red then green.
- [x] Implement small painted atlas details and warm interaction cues without duplicating room shells or overpainting actors.

### Task4 — Native QA, review and delivery (root)

- [x] Run focused then full web tests, TypeScript and desktop build after source is stable.
- [x] Production OfficeView native-app fixtures: day and night, compare admission bounds; prove doors/lift/return and no shared-seat duplication. Isolate fixture data and restore storage/hooks.
- [x] Inspect narrow actual renders for bags, cups, rest gestures and night atmosphere. State limits of accelerated scheduling versus real motion.
- [x] Obtain detailed Claude review; fix proven findings. Local commit, package and normally reopen the existing canonical app/profile. No push.

## Implementation checkpoint — 2026-11-15

Tasks 1–3 are implemented. Indoor fallback uses the actor's canonical private seat or lead nook, avoiding occupied-object detours. Snack return includes a 4.5-second home sharing gesture only when an eligible physical teammate is present; otherwise the actor puts the parcel away.

Local verification: 370/370 web tests passed, TypeScript passed. A zero-distance routine regression was observed failing before the fix and passing after it. Natural 110-second native OfficeView runs covered both profiles: daytime admitted two visitors at 25.01 motion seconds; nighttime admitted one warm-drink visitor at 59.79 seconds after real work delayed the first opportunity. No duplicate actors, conflicting seat reservations, settled garden overlaps or extra lift passengers were recorded. Painted parcel return and the quiet night garden were inspected.

Evidence is under `artifacts.local/office-verification/outings-{day,night}-{result,trace,samples}.json` and accompanying PNGs. Complete snack/night returns and home sharing were not observed within the capture window; unit tests cover sharing completion, work reactivation and lunch takeover. Detailed Claude review, final package and canonical app reopening remain delivery gates.

## Detailed review — 2026-11-16

Claude completed a source, artifact and focused-test review: 44 focused tests passed, no blockers. Three cosmetic defects were reproduced with failing regression tests and corrected: uncollected snacks no longer paint a return parcel; garden-seat relocation retains the vendor pickup and collection tracking; sharing greetings skip returners without a peer and validate the next physical resting peer. The existing eligibility helper also now checks sharing partners. The three new regressions passed after the corrections. No further review delegation is needed for these small findings.

## Final verification and delivery — 2026-11-16

Final web suite: 373/373 passed; TypeScript and desktop build passed. Packaged to `artifacts.local/desktop-outings-20261116-reviewed/Agent Flow-win32-x64`, then normally closed and reopened the canonical desktop app using its existing profile. Package and installed ASAR SHA256 both `DD39280F176F3B0208E9F4E68E40491714C179DC9BA69D91F9EC659632181751`. Native post-install capture showed Connected, two working agents, three visible actors and eight stations. Station panel, private-room door, Back control and keyboard focus restoration all passed. No Sonar binding or scanner configuration was found. The earlier checkpoint and capture-window limitations above remain historical verification notes.
