# Office daily life and room identity — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Implement task-by-task, with bounded independent file ownership.

**Goal:** Add approved clock-based coffee/lunch/tea life, a temporary appended canteen, and distinct task-appropriate office designs with genuinely usable large rooms.

**Architecture:** Pure daily scheduling/ledger and a cosmetic visual scene layer remain separate from TeamSnapshot. Outbound/return journeys reuse the existing phased travel/lift machinery; eating never reserves the lift. Painted room design and daily props consume state without mutating tasks. Temporary rooms append before quiet-summary/base and remain until guests leave.

**Tech Stack:** Existing React/TypeScript, Canvas/painted WebP assets, Node tests; no new dependencies or external weather/ordering APIs.

**Spec:** 2026-11-14-office-daily-events-design.md (approved), plus latest user request for unique task-matched room decor/colours and usable large-room layout.

## Constraints and review focus

- Viewer-local real time;08:30–09:30 coffee,11:50–12:10 delivery,12:00–12:45 lunch admissions,12:45–13:00 cleanup,15:00–15:30 tea.
- Only current visible resting private-lounge actors in idle/done/cancelled; no working/waiting/failed/hidden/historical/at-home invitees. Maximum4 concurrent,8 per lunch; garden total4 including parties.
- Scene rain/storm or no outdoor space -> temporary canteen at the bottom; rain during outdoor meal -> real indoor journey, no instant teleport or clear/rain bouncing.
- One shared physical lift; separate outbound/return reservations, actual lifecycle priority, safe preemption/cancellation/resume.
- Per-day bounded persisted occurrence ledger; reload/clock reversal cannot duplicate; skip expired windows and backlog.
- Preserve original underground artwork and camera. Stable mission-based theme, no recolouring on every tool update; large rooms use two zones/depth rows rather than stretching walls.
- An actually idle root lead uses a report-reading/coffee nook inside its current active team's room. Thinking, running, background and waiting leads remain visibly at work; source status stays authoritative. Walk between nook and work through the same routine path.
- User requires detailed Claude review before every implementation handover; address proven findings before delivery.
- Latest steering: visible communication. Reuse actual assignment, sent and received evidence for short local status bubbles and handoff gestures; completion alone never claims delivery or acknowledgement. Nearby resting/party actors alternate speaking/listening with nonverbal dots, never fabricated task text. Hide riding/hidden participants and never draw communication links across rooms.
- Review: source reactivation mid-meal, rain/crowd during a queued journey, shutdown with actors away, simultaneous departure/new room, room/theme stability under snapshot churn.

## Task1 — scheduler, ledger and daily scene (agent)

Files: new web/lib/office-daily-events.ts, office-daily-scene.ts, web/test/office-daily-events.test.ts.
Interfaces: immutable planner from Date/base OfficeScene/busy keys/ledger; daily occurrence kind coffee/lunch/tea with deterministic keys and eligibility/destination/capacity. Root integrates runtime phases. Canteen scene helper appends fixed-id public break room with room:'room-canteen', never shifts existing physical rooms, updates quiet/base geometry and participant overlays without source mutation.
- [ ] Write/run failing boundary, eligibility, weather/party cap, once-per-day/reload/clock-backwards tests.
- [ ] Implement and test deterministic scheduler/ledger + pure canteen scene projection.
- [ ] Report exact API/tests; no commit/build/package.

## Task2 — cosmetic cross-floor travel (agent)

Files: office-motion.ts and new office-daily-trips.ts/test. Root adds OfficeEvent.kind:'routine' and room:'room-canteen' type support.
Interface: createOfficeRoutineTrip(scene,actorKey,target:{floorId,x,y},now,caption,fromActor?) -> OfficeTrip|null, supports resting actors and return to newly working source actor. Reuse the same annex thresholds, aisle, phased lift travel and rendering frame; no fabricated task completion or parent relationship. Does not reserve meal time.
- [ ] Write/run failing annex->garden/canteen->return and unchanged-source tests.
- [ ] Extract/reuse travel builder with existing lifecycle tests kept green.
- [ ] Report API and tests; no UI/type edits/commit/build.

## Task3 — room identity and painted canteen/daily visuals (agent)

Files: new office-room-design.ts + test, office-room-design-art.ts, office-daily-art.ts, optional asset-loading hook and new assets/provenance only.
Interfaces: roomDesignFor(floor), roomStationLayout(floor,width), roomActorSpots(floor,width); drawOfficeRoomDesign/drawOfficeDailyArt consuming scene/date/daily state. Agent reports exact signatures before root integration. Existing OfficeFloor title/session/room determine stable theme/variant. Work themes studio/operations/research/quality; large rooms use real lower-floor depth, staggered occupants, two station groups. Canteen matches old painted basement, four seats/buffet/tray return. Prefer existing painted assets and appropriate generated raster assets over crude flat furniture.
- [ ] Test stable theme/variant and actual small-vs-large layout separation/clear aisle.
- [ ] Implement art and any assets with required imagegen workflow; preserve old images.
- [ ] Return reference render/evidence and signatures; no OfficeView/office-model/shared-types edits.

## Task4 — runtime integration (root)

Files: OfficeView, office-types/model/stations/work-presence, renderer/CSS and small daily coordinator/hook as needed.
- [ ] Extend routine/canteen types and preserve lifecycle checks.
- [ ] Integrate scheduler with wall-clock, motion clock, ledger persistence and actual busy ownership.
- [ ] Admit one journey only when actual work/arrivals/departures are not waiting; give dining its own dwell timer/overlay; use shared lift for each travel leg only.
- [ ] Handle work reactivation/rain/cleanup safely, returning to latest valid home before canteen removal.
- [ ] Integrate stable room decor/station positions, multiple depth rows and occupancy spacing; preserve source snapshot and existing home-room art.
- [ ] Test critical runtime with production OfficeView fixture for noon/rain/crowd/resume/source-work takeover; inspect narrow native UI.

## Task5 — verification and delivery (root)

- [ ] Run appropriate targeted/full web tests, TypeScript and desktop build once stable.
- [ ] Inspect production-rendered dry/rain lunch and large room, check single car, seats, food interactions, no duplicated actors, no room-order jumps.
- [ ] Read-only review of substantive implementation; fix proven findings.
- [ ] Local commit with co-author trailer; package, verify canonical hash and normally reopen user's existing app/profile. No push.
