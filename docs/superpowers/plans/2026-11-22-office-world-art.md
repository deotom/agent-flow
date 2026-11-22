# Office World Art Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans for implementation. The two art workstreams can run in parallel after the coordinate contract is recorded. Integration and Desktop verification follow both.

**Goal:** Make the workroom, private break rooms, surface garden, and the characters moving among them look like one illustrated world in Agent Flow Desktop.

**Architecture:** Compose separate room, furniture, architecture, and character layers in the existing Canvas and CSS renderers. Keep station identities, event mapping, character identity, and the physical door and lift routes as the source of truth. Introduce the new artwork in one complete sample route before expanding the asset set.

**Tech stack:** React, TypeScript, Canvas 2D, CSS, WebP assets, Electron desktop build.

**Design reference:** `artifacts.local/office-world-art-direction-20261122.png` is the visual reference copied from built-in ImageGen. The concept shows the private room beside the workroom to communicate continuity. The app reveals it through the existing annex view on the same floor. Reuse the materials, lighting, and silhouettes in the image and compose them as separate runtime layers.

## Visual contract

- Use the same front-facing cutaway, walnut timber and brass fittings, rounded outlines, illustrated textures, and soft contact shadows across all three areas. Use olive plaster and amber task lighting in the workroom, softer lantern light and fabric in the break room, and outdoor light on the same wood and stone in the garden. Keep seasonal changes and day/night tinting localized to the environment.
- The four shared stations are Research (`research`), Review (`quality`), Build (`build`), and Terminal (`terminal`). Keep their IDs unique. In the large room, arrange two staggered rows on one walkable plane. Give the small room a compact arrangement with the same materials and avatar scale. Keep the right aisle free of furniture and competing pointer targets.
- Use one character identity and one set of proportions across the workroom, break room, garden, and Office-only portraits/projections. Changes of pose, lighting, or clothing layers preserve face, hair, color, role mark, and identity slot. Two coworkers at Build need distinct contact points on one physical station.
- Treat the annex door, lift shaft, and soil line as landmarks shared by all art. The workroom door is at `.825W` and its threshold is at the wall seam (`.36032W` below the floor origin). The private threshold uses its own room height. The lift shaft is at `.938W`. Measure props and hit areas against the existing navigation rather than estimating from the reference image.
- Desktop Office is the scope. The temporary canteen gets a compatibility check for assets reused by this change. Preserve the other app views and their appearance. Keep dependency and package boundary changes out of the proof.

## Owners and sequence

| Workstream | Owner | First deliverable | Dependency |
| --- | --- | --- | --- |
| Environment art | Environment agent | A large workroom shell, two shared station examples, one matching break room, one garden palette, matching door and lift joins | Coordinate contract |
| Character art | Character agent | Two recognizable illustrated identities, with standing, walking, seated, and reach/reading poses | Avatar geometry contract |
| Integration and review | Lead | Deterministic Desktop scene, shared station contacts, artwork integration, visual and regression checks | Both proof bundles |

Environment and character planning were delegated independently. The next three tasks turn their findings into a runnable proof. The broader asset pass starts after the integrated proof is reviewed.

## Task 1 — Environment artwork and anchors

**Files:** `office-room-design-art.ts`, `use-office-room-art.ts`, `office-station-art.ts`, `office-station-hardware.ts`, `office-break-peek.tsx`, `office-garden-infill.tsx`, `office.css`, and `assets/`, all under `web/components/agent-visualizer/office/`.

- [ ] Capture existing geometry in a synthetic Office scene. Use the real shell wall seam, work and private door bounds, shaft, landing, and garden hatch. Record room bounds with both small and large sizes so the artist can align the same trim and floorboard edge.
- [ ] Prepare the proof assets. Use a large shell with independently extendable floorboards, one reading break-room plate, one garden plate with a matching hatch-closed patch, and two transparent station sprites for Build and Research. Keep characters, interactive props, doors, and elevator leaves on their own layers.
- [ ] Plug artwork into the loader and static room canvas. Choose the shell by workroom size and keep the fallback rendering identical to the scene geometry. For the station orientations used in the proof, supply matching render frames with measured feet, tabletop contact, and foreground occlusion bounds. Use current art for missing kinds/orientations until their assets are ready.
- [ ] Verify the closed and open door at the wall seam, the break-room overlay against the soil and timber bands, fore/background furniture overlap, and a clean hatch opening at dusk. Exercise `office-lift-art.test.ts`, `office-annex.test.ts`, `office-break-peek.test.tsx`, `office-station-depth.test.ts`, and `office-garden-infill.test.ts`.
- [ ] Verify the canteen still draws with its existing tabletop crop. `office-daily-art.ts` samples the source `room-break.webp` at `(280,327,165,73)`. Preserve that source for the sampler or provide a dedicated replacement with its crop tested in `office-daily-art.test.ts`.

## Task 2 — Illustrated avatars

**Files:** `web/components/agent-visualizer/office/office-art.ts`, `office-hologram-art.ts`, and `office-remote-meeting.tsx`; `web/lib/office-depth.ts`, `office-support.ts`, `office-walk-pose.ts`, `office-contacts.ts`, and `office-wardrobe-transition.ts`.

- [ ] Author two transparent painterly character rigs. Give one a rust work jacket and distinct dark hair silhouette, and the other a gold work jacket and goggles. Record head, shoulder, elbow, hand, hip, and feet pivots in scene units. Keep the current feet origin, facing/mirroring, and returned hand coordinates as the renderer contract.
- [ ] Render the layered art through the existing `drawOfficeAvatar(c, appearance, x, y, time, pose)` facade. Reuse the existing posture and contact solvers. Keep the primitive renderer as a complete fallback for unloaded/failed art and for identities without new art during the proof.
- [ ] Map the proof rigs to two stable identity slots. Use the same bundle for the main room, break peek, garden, Office meeting tiles, and holograms. Repaint on decode completion even with effects off. Apply outdoor lighting and wardrobe over the same identity.
- [ ] Verify the same identity follows the actual feet path, lays a hand on a station, sits with its hips on the chair, and remains visible and selectable with motion off. Exercise `office-art.test.ts`, `office-support.test.ts`, `office-walk-pose.test.ts`, `office-remote-meeting.test.tsx`, and `office-hologram.test.ts`. Include an art-load failure case.

## Task 3 — Shared Build bench and end-to-end proof

**Files:** `web/lib/office-room-design.ts`, `office-work-presence.ts`, `office-station-activity.ts`, and `office-support.ts`; `web/components/agent-visualizer/office/office-view.tsx` and `office-art.ts`.

- [ ] Reproduce the existing single-surface constraint with two agents at Build. Extend `office-work-presence.test.ts` and `office-support.test.ts` to assert that two occupied workpoints have distinct feet and hand contacts, keep one Build UI target, and leave the aisle and door hit bounds clear.
- [ ] Author two stable Build workpoints within the same furniture bounds. Use each assigned point for routing, remembered position, hand contacts, and paint order. Geometric candidates and contact targets must agree. Retain each assignment while that actor stays on the bench. Use an existing nearby standing position when the two workpoints are occupied.
- [ ] Run a deterministic fixture using synthetic post-baseline events. Show both characters settled at Build, then trigger an observed Research activity for one character. Verify a trip begins at that character's actual Build point, settles at Research, and leaves the other character at Build with usable contacts.
- [ ] Continue the fixture through the private break-room door and from the workroom up the lift to the garden. Record settled Build, midpoint on the floor, Research, break-room seating, and garden arrival using the same identity. Exercise `office-door-traffic.test.ts`, `office-motion.test.ts`, `office-lift.test.ts`, `office-garden-routes.test.ts`, and a pause/effects-off pass. Verify both visible art and pointer/keyboard targets at 260, 345, 380, and 600 CSS-pixel viewport widths.

## Task 4 — Fill out Office and verify Desktop

- [ ] After the proof, finish the small shell, Review/Terminal and any missing station orientations, the remaining Office break-room plates, and remaining garden seasons/hatch patches. Verify the garden's underlying arrival and shop paths, sky alpha, ground line, and hatch cutout across day/night and seasons. Keep any reused canteen sources compatible.
- [ ] Extend avatar appearances from the proven rig and reuse the same working contacts. Sample distinct hairstyles/outfits and occupation/identity combinations in office, annex, and garden. Verify loading and effects-off fallback still pick the right actor.
- [ ] Run `pnpm --dir web test`, `pnpm --dir web exec tsc --noEmit`, `npm run build:desktop`, and `npm --prefix desktop test`. Compare built asset size and first-load/decode time against the current build. Check that new art adds no animation work in a hidden or paused Office.
- [ ] Package a Desktop candidate and inspect all three places in the actual packaged app at widget and full size. Validate selection, door hit regions, movement through lift and annex, and background/foreground readability. Capture one matched-width visual set. Promote and reopen the installed app only when that action is requested.
