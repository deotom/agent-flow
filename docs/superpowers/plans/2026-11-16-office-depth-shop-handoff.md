# Office depth and shop handoff

User follow-up: show a real visual exchange with the shopkeeper and make characters grow/shrink with floor depth while approaching seats and doors.

Preserve the painted underground camera, source tasks/counts, existing paths and physical lift. Scale uniformly about the feet using actual floor-relative position, never walking speed or an artificial distance timer. Main and private views use the same projection. Keep the existing lift scale; no in-car size changes from floor IDs. Labels, pointers, held objects and status bubbles follow the same transform. No backend purchases or currency.

Shop handoff follows the actual daytime dry snack pickup hold. The merchant reacts only to that customer; one parcel moves from the merchant hand to the customer's actual rendered hand. No service for hidden, walking, working, returning, stale or wet/night guests. The existing runtime collection flag remains authoritative.

- [x] Root: pure depth mapping and meaningful door/seat, continuity, lift and coordinate tests; integrate canvas, pointer transforms, palm contacts and communication positions.
- [x] Vendor helper: real pickup progress and bounded one-customer exchange policy/art. Root integrates runtime visual metadata and shared parcel.
- [x] Native QA: rear/front depth and DOM alignment verified; earlier manual lounge checks passed. Live pickup/receipt remains unobserved due to environment limits recorded below.
- [x] Full tests 437/437, TypeScript/build/package passed; detailed Claude review completed and findings fixed. Canonical profile reopened with matching package hash. Local commit records this work; no push.

## Storage constraint

Use one final candidate package only; preserve the installed canonical app and one last-good rollback. Do not create per-test desktop packages or videos. Current QA is bounded keyframes and one isolated profile.

## Pause checkpoint (superseded by resume)

User requested a stop on 2026-11-16. Final full-suite session 73957 and TypeScript/build/package session 29395 were interrupted and both returned exit 1. Do not infer successful final verification or packaging from their logs. No commit or final installation was performed for depth/handoff.

Claude's second review found no blockers. Root fixed the concrete follow-ups: serve the most advanced pickup before a later arrival; mark collected only after the real 1400ms pickup completes in dry daylight; move the customer to x=.61w/y=.70h, scale the clerk with depth and align both palms within 8 scene units. Focused vendor/runtime/trip/handoff tests passed 25/25 after those fixes. Final full suite, TypeScript, build and package must be rerun on resume.

The reusable artifacts.local/desktop-review-candidate exists from before these final review fixes; it must not be installed as current. The normal running canonical app remains the earlier shop/seasons build (PID10724 at last check), not the final depth/handoff code. All source edits remain uncommitted in the working tree. Historical-package deletion remains blocked by command policy; the preview-by-default manual cleanup script and inventory exist under artifacts.local/office-verification. No deletion was executed.

Disk audit found 27 inactive ignored historical package directories with 9.51 GB logical file sizes. Neither bulk nor explicit single-directory removal executed: automatic command policy rejected recursive deletion. A preview-by-default cleanup script and exact inventory are prepared under artifacts.local/office-verification for manual use; do not claim reclaimed space. Source assets, node_modules, user settings and active QA/current evidence are excluded.

## Verification checkpoint

- Full web suite 435/435 passed before the final external-parcel depth change; the affected outing/handoff painter tests then passed 10/10. TypeScript and diff whitespace checks passed.
- Native production renderer trace: canvas scale 1.03272 matched DOM 1.0327 at foot origin 50% 96%; private rear actors 0.825606 vs front 1.03272. All five source agents preserved.
- Native moving-shop evidence unavailable: the bounded 80.08-second isolated run advanced motion by only 15.6 seconds, before the 24.991-second natural admission. Screenshot APIs and native inventory timed out. No claim of visually verified pickup, purchase or carrying. Fixture hooks restored and only owned QA PID1412 stopped; normal profile PID10724 remains responding.

## Resume verification

User resumed work. No earlier build/test process was active before restarting checks. Final web suite: 437/437 passed; TypeScript --noEmit and git diff --check passed. Two review regressions failed before the fixes, then all 25 focused vendor/runtime/trip/handoff tests passed. The additional staging test checks separated bodies, correct front/back scale and actual palms within 8 scene units. Final build/package reuse the one desktop-review-candidate directory.

Claude's final review reported no blockers. Its source-only findings were addressed locally: advanced pickup retains service priority, collected becomes true only after completed dry daytime pickup, customer staging and clerk depth now agree. No extra reviewer was started for these bounded fixes. Native live handoff remains unobserved because of the recorded environment limitation; no visual-success claim is made.

## Installed checkpoint

Canonical resources/app.asar matches the final candidate: SHA256 9D9FB37DB2A704E5079603B68B246C2BED887973427A2A981431D5BD770D5BBD. Normal profile reopened successfully as PID8276, nonzero window handle and Responding=true; loopback debug endpoint9343 exposes the Agent Flow page and desktop iframe. Native Computer Use pipe is unavailable, so no new post-install screenshot or live-handoff visual claim. Prior installed source has been replaced by this reviewed depth/handoff build.
