# Hybrid Office and reused subagent truth

**Goal:** Show current work from a reused T3 child thread correctly, and support a compact Hybrid view with physical implementers and online reviewers/researchers. User explicitly said proceed rather than wait for another confirmation.

**Evidence:** Cached relay snapshot showed the named worker done. One target-only read-only source check showed an older completed/delivered delegation updated after the newer running delegation, while child run ordinal17 remained running. Choosing task by updated_at lets delayed delivery overwrite current work. No source prompts/results were saved, and no full source poll/probe is added.

**Design:** Keep underground painted shell, camera, original avatars and Full effects. A warm timber wall screen shows at most three current remote participants with real status, selection and an expandable roster. No fake conversation/backend messages. Explicit source review/research roles default remote, implementation and unknown roles default physical. Actual observed T3 rows have no role metadata, so an optional local display chooser lets the user put an active worker on screen or in the room. Choices are bounded128 current-job keys, written only on user changes; this is display placement, not a command to T3. Remote participants do not occupy physical desks or take leisure/lift trips. Counts/inspection/Locate must still include their real work.

**Ownership/interfaces:** Root owns projection/reader/TeamTaskRole, task episode ordering, office model/types/collaboration helper/reveal/tests. Native UI agent owns office-remote-meeting.tsx, its CSS/tests and office-view integration. Shared contract OfficeFloor.collaboration and buildOfficeScene optional eighth overrides arg; helpers in office-collaboration.ts as specified in delegation. Tests/builds serialized; no native UI control until user resumes it. Claude review required before delivery.

- [x] RED reproductions: late delivery on old task plus running reused child, latest task display/Office presence, completed-only wrapper with running child, cancellation preservation.
- [x] Fix episode ordering (started_at then completed_at fallback before updated_at) and successful old-wrapper override from active child run; preserve historical deliveries as separate tasks.
- [x] Hybrid pure model/preferences/reveal tests: explicit role rules, unknown fallback, local override bound, no physical/remote duplicates, truthful counts and selection.
- [x] UI agent: wall-screen/roster, max3 static avatar canvases, local chooser, manual focus, no extra RAF/timer, stale/off parity.
- [ ] Focused and affected tests/types, actual renderer/DOM fixture capture at380px if feasible, bounded package with no real-source soak. Claude final source/visual/evidence review, then install only while app closed and integrate under standing authorization.

## Verification checkpoint

Sequential root 71, extension 118, web 542 and desktop 46 tests passed (777 total), with extension/web types and relay/extension/desktop builds all exit 0. Final Office UI focused rerun 17/17 and web type check passed after the manual stale-frame repaint refinement. Desktop build output is newer than that source edit. Status: artifacts.local/hybrid-office-checks-20261120/status.json.

The static 380px study uses the actual component, styles and avatar drawing, but headless image preview timed out. HTML study was shown; no native visual, CPU or FPS claim. Claude review requested and pending. Package/install/integration pending; do not install while Agent Flow is running.


## Approved refinement and blank-storey regression

User refined the wall display to a quiet rail of avatar faces plus the actual AI runtime mark, with names/statuses available on hover or inspection rather than visible nameplates. User approved a small hologram beside Lead on genuine assignment/sent/received evidence. Original avatars stay recognizable; at most two view-only projections, one per Lead, last 2600ms with opacity fade, static in effects-off, no new timers/RAF/storage or physical actors. Exact source task IDs prevent an old delivery cue using a reused worker's current job. A hidden, stale, absent, travelling Lead, wrong ancestry/session, cancelled task or changed current job removes the cue. Initial/reconnect baselines do not replay transfers.

Claude's first review found no blocker in reused-job status or Hybrid placement, but identified Locate claiming an absent terminal participant was on screen. Screen, inspector and Locate now share the displayed predicate; a failing terminal-remote Locate test was observed before fixing. Running resumed children no longer show an old wrapper's pending result label. Historical task text/role remain source-attributed because T3 does not supply a new job description without a new delegation; unknown roles still default physical and the user can override placement.

User screenshot also showed a blank storey until switching mode. Reproduced a concrete cause: Runtime.project received an already-projected canteen, removed only the floor, and retained the shifted quiet row and building height. New failing test observed quiet.y 587.8125 vs 360; closing now inverses the canteen offset and total height together, immutably and idempotently. Daily/layout regression group 30/30 passed. This is source/fixture evidence, not native confirmation of every possible empty-room case.

Full final affected web checks/types and desktop rebuild are running at artifacts.local/hybrid-hologram-final-20261120/status.json; fresh Claude review required for the refined feature before delivery. Earlier package predates the refinements and is not the final candidate.

## Final source verification

Claude final review approved with two follow-ups, both reproduced RED and fixed locally. Retained rooms added below the temporary canteen now compact as well (RED new-room.y1007.8125 vs780); both incoming and retained scenes are normalized immutably before retaining positions. Hologram events carry sourceAt from task.updatedAt/completedAt/startedAt; the source timestamp must be known, nonfuture and within15 seconds, regardless of receipt time. Paint now persistently prunes invalid cues and does no hologram scene construction when there is no cue.

Full web suite552/552 passed before these small review corrections. Post-review affected group62/62 passed against latest source, covering daily, layout, hologram, wall icons, Locate and Office integration. Final web type check and desktop rebuild passed in artifacts.local/hybrid-post-review-20261120/status.json (done true). Earlier unchanged root71, extension118, extension types/build and desktop46 tests passed. No production dependencies changed.

Updated actual-component/renderer HTML study shown; headless PNG preview again timed out. Native visuals, displayed FPS, CPU savings and complete resolution of every possible empty-room path remain unclaimed. Do not run another source-T3 soak to validate visual changes. Repack must use this final desktop output. Installed app still running; installation must wait for it to close. Source integration under prior main/push authorization is next.
