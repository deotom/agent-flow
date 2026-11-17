# Layered equipment and varied work poses

Continue the user's established choice: keep the original painted underground room, saturated timber palette and existing characters. Improve depth and equipment directions, not the room camera or detached isometric platforms.

Use staggered back/middle/front furniture baselines, perspective sizing and real front/left/right sprite variants. Floorboards, the right lift aisle and the lead nook remain continuous and clear. Stable team identity chooses composition; status updates never rearrange furniture. Every station exposes a floor work anchor shared by routes, contacts and hit targets.

The existing DOM furniture sits entirely behind the actor canvas and cannot occlude passing actors. Paint furniture and actors in one foot-depth order; keep transparent keyboard/pointer station controls at the same geometry. Load sprite assets once, with no per-frame raster preparation.

Working poses follow the current station and actual source status: reading/page turns, typing/mouse, adjusting equipment, inspection/notes. Seed cadence by actor, keep feet planted and palm targets bounded, and suppress gestures during travel, handoffs, dressing or non-working states. Effects off gives a static pose. These are decorative actions, never fake backend events or task completion.

## Implementation

1. Geometry owner: room layout, station/work anchors and occupancy tests (RED/GREEN).
2. Root: matching angled sprite sheet, canvas painter/depth ordering, transparent DOM controls and work gestures/contacts.
3. Focused geometry/contact/rendering tests; full web tests/types and desktop build. Inspect a rendered composition at narrow size and check occlusion/aisle/props.
4. Detailed Claude review before delivery; address small findings, package into the existing bounded candidate, reopen the canonical app and commit locally. No push.

Avoid the previously rejected camera rewrite, flat image rotation/shear, arbitrary zig-zag routing, and additional floor height as the only way to suggest depth.

## Verification and review

The generated angled atlas was extracted with imagegen to actual transparency and converted to a versioned 430,756-byte WebP. Tight per-view frame metadata excludes neighboring atlas fragments and preserves object aspect. Original frontal art remains available. Palm contacts follow the actual book/keyboard/console side rather than simply following the camera direction.

Geometry, depth-order, contact, zero-overlay and distance-gait regressions were observed failing before their fixes. The first complete suite passed 475 tests and TypeScript; desktop build and package passed. Canvas compositions use the actual painters/assets and include a mock board at the component's geometry. They are not native captures or proof of DOM hit areas. Native Electron capture failed even for about:blank; no further attempts were made.

Claude's detailed review found no blocker and verified the grounded feet, scale, aspect, depth sorting, routes/lift timing and world-space contacts. It identified a real stale-source posture regression. That was reproduced by a new test: last-known workers lost supported palms/lift/facing. The fix freezes the work clock at zero while retaining static surface contacts and disabling live typing. Focused support/gesture/art checks passed 16 tests afterward; fresh complete verification follows before installation.

Remaining visual polish limits from the review: posture/facing can switch at work arrival or after a higher-priority gesture; stance feet can slide slightly during acceleration/deceleration weights; existing station light dots and transparent square hit areas have not been checked in the native app. Agent targets stay accessible above furniture. No claim of native motion verification or fully eased arrival posture is made.

Final verification after the review fix: 476 web tests passed, TypeScript passed, desktop build and package both exited0. Candidate archive is6,163,098bytes with no nested artifacts.local entry. Installed SHA256 b53b568bf3770fec183c8e7e5f2e47a4ce726fc5948a79de44525484d83299cf; verified rollback is the prior production archive e4a866eae1ee7e1ef3e292789e9812386ddfa41d2cfd7e3f5dff7a46b1f8777f. Canonical app reopened with its normal user profile. Native CUA window inventory also timed out, so runtime evidence is process/service startup plus Canvas fixtures, not an app screenshot or live-motion observation.
