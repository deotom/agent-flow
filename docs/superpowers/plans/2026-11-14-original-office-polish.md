# Original underground Office polish

The user selected the existing painted Office screenshot as the baseline. Keep the original continuous underground floors, room/garden/lounge imagery, character art and camera. The rejected dollhouse experiment is preserved under artifacts.local/office-verification/rejected-dollhouse-source; it is not part of this change.

- Keep a clear straight front aisle; slightly reduce the station sprite footprint to reserve a wall-entry bay.
- An observed work trip ends at its station. A visual position cache keeps the actor there between snapshots; later work and lifecycle trips begin at the last drawn point. Cached positions and in-progress work paths follow floor movement/resizing. Source task, agent and delivery state are unchanged.
- Preserve existing occupants' positions and choose a nearby free work point for another teammate. Keep labels available on hover/focus and retain accessible station names and the live activity caption.
- Put the matching painted closed/open door flush on the back wall at x=.825W, y=.64H. The pointer target, motion threshold and private peek share the same geometry.
- Replace ladder rungs with a subdued painted timber/copper lift shaft and an opaque service wall. The cabin and simultaneous evidence trips travel behind it; agents walk visibly to and from the landings, and labels are hidden inside. The garden hatch masks the surface threshold.

Verify focused work-presence, door/lift and lifecycle tests; full web tests, TypeScript and desktop build. Inspect the actual packaged Office at widget width, including door opening/closing, lift occlusion and persistent station activity before committing and reopening the canonical package.


Final follow-up: Restore the compact widget Graph tab and render/simulation path. The lift has visible paired doors at each occupied landing, a cabin interior revealed through the doorway, and an earth-covered shaft between floors. The garden hatch artwork stays closed; a small timber pavilion with green roof and grounded plinth, painted wooden doorway leaves and a fixed frame replaces its entrance animation. New agents walk in from the garden before boarding, with a pause at the landing. During ride segments the body is inside the cabin behind closed doors; it cannot sink through the garden floor.

Local verification: 271/271 web tests passed; TypeScript passed; desktop build and Electron packaging passed. Canonical package app.asar hash matches the final output. The existing app was sent a normal window close; force termination was rejected by automatic approval review, so runtime inspection uses a separate local profile. No push or release.


Follow-up: lift thresholds were incorrectly tied to the front lip of the painted floor (.79H), and the garden threshold (.82H) was below the grass edge (~.76H). Calibrate the lift doors to the back-wall/floor seam (.64H), keep the front aisle at .79H, and enter through the clear right-side bay. Garden base is .74H with the plinth above the soil. Painter, travel paths, arrival retargeting and garden pointer target share these thresholds; shaft length still covers the lowest floor edge. Original scene assets remain unchanged.


Reconnect follow-up: live /events closed after the initial replay: an old T3 snapshot history batch was 13.45 MB, exceeding the existing 4 MB SSE queue cap. T3 session_snapshot events already contain full current state and replay directly from the watcher, so the relay no longer buffers old T3 snapshots as incremental history. Current team snapshots, live updates, native history and queue limits are preserved. Health timestamps now mark completion of a read, and the next poll waits 2 seconds after completion rather than catching up interval deadlines.

Verification: web 272/272, root 53/53 and watcher 4/4 tests passed; TypeScript, desktop build and packaging passed. Updated the canonical package with a matching app.asar hash and normally restarted the existing user profile (no separate QA profile). Actual packaged Office screenshot confirms grounded lift thresholds and Connected status. A single live SSE connection received 5 successful heartbeats over about 26 seconds without ending; maximum arrival age 135 ms, maximum gap 9291 ms. Evidence: artifacts.local/office-verification/grounded-live-health.json and grounded-shell.png. Local changes only; no push.
