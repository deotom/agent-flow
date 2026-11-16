# Office Shop and Seasons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Root integrates bounded native art/policy helpers, with detailed Claude review before delivery.

**Goal:** Stable user-controlled lounge views, a staffed original shop cart and coherent seasonal wardrobes/decor.

**Architecture:** Remove trip-driven peek state from OfficeView. Pure shop policy plus isolated cart-staff rendering keep NPCs outside TeamSnapshot. Pure wardrobe theme/slot helpers drive a small torso accessory layer and existing seasonal room art. Root owns avatar/frame integration; helpers own independent files.

**Tech Stack:** Existing TypeScript/React/Canvas and assets; no dependencies or new image style.

**Spec:** ../specs/2026-11-16-office-shop-seasons-design.md

## Global Constraints

Preserve source counts/tasks, agent identity, art/camera, trip/lift timing, existing seasonal calendar and project room themes. Shop staff is decorative, not an AI actor. No automatic lounge switch. Keep runtime logos/crowns and main board/stations unobscured. Local time/simulated weather only.

## Review Focus

- Multiple trips entering/leaving annexes: no auto open/close or focus theft; manual room remains selected.
- Night/rain/cold/holiday shop state: no false service, duplicate vendor/stall or source/seat participation.
- Wardrobe changes on current date/weather without identity reassignment or animation reset.
- Indoor versus outdoor accessories, headset/crown/handheld props: compatible occlusion and exact palm contact.
- Narrow369px public and local annex canvases: vendor aligned to cart, seasonal decor preserves labels/stations and character clarity.

### Task1 — User-controlled lounge (root)
- [x] Remove auto-peek refs/trip handlers; preserve explicit door/Locate and removal cleanup.
- [x] Verify native movement does not switch rooms; manual peek persists and keyboard close/focus works.

### Task2 — Existing shop staff (native helper)
- [x] Test pure shop policy and bounded art geometry; implement a decorative merchant at the original cart.
- [x] Root integrates avatar callback and verifies NPC never changes source counts/ownership.

### Task3 — Seasonal wardrobe and decor (native helper)
- [x] Pure calendar/slot/indoor-outdoor wardrobe helper with tests; small identity-preserving torso layer.
- [x] Extend existing seasonal room/lounge accents without repainting original shells or blocking boards.
- [x] Root integrates per-frame theme and avatar layer; compare actual hot/rainy/cool views.

### Task4 — Verify, review and deliver (root)
- [x] Focused/full tests, TypeScript, native screenshots and manual-lounge interaction checks.
- [x] Detailed Claude review; fixes verified; final package installed and canonical profile reopened. Local commit records this work; no push.

## Verification checkpoint

- Full web suite: 424/424 passed; TypeScript --noEmit and git diff --check passed.
- Native production OfficeView: before reproduced automatic peek at 26s; after stayed closed through 35.47s of natural outing/departure. Manual observer rerun stayed open through departure, then Back restored door focus and stayed closed to 40.33s. An initial manual attempt was inconclusive; the instrumented rerun passed.
- Hot, rainy, cool and night renders at 369x900 checked for shop alignment, identity, seasonal clothes and main/private trim. Static season renders used motion off and do not prove travel. Five source agents remained unchanged; vendor adds no DOM agent.
- Regression tests cover threshold opacity zero and absent/constructing parent floors. Native evidence and logs are under ignored artifacts.local/office-verification/shop-seasons-*.

## Detailed Claude review

Claude Sonnet reviewed changed/new sources, tests, rainy main and cool private captures; no blocking defects. Static review only: did not rerun verification or inspect every capture/JSON.

- Fixed main/private seasonal palette mismatch by deriving trim variant from annexOf ?? id. Regression failed first (teal vs ochre), then all four seasonal art/trim tests passed.
- Existing removed-floor cleanup already clears peekId in OfficeView's effect; the review's stale-peek observation was not reproduced and contradicts that guard.
- Night outings use a direct routine trip; only a daytime snack adds the vendor pickup stop (office-outing-trips.ts). No new night purchase was introduced. Existing hot drinks are leisure props, separate from shop service.
- Retained subtle seasonal trim to preserve original painted shells. Rainy outdoor layers switch at the garden boundary; smoothing that cosmetic change is deferred. Door badge follows React cadence while painted doors follow frame cadence.
- Retained optional focusOnOpen API; default true now serves manual opens. No automatic camera changes remain.
