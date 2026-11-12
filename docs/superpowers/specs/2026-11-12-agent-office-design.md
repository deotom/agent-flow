# Agent Office — approved direction

The user approved implementation after reviewing the interactive prototype at `docs/mockups/agent-office-dollhouse.html`.

- Add Office beside Board and Graph in T3 mode. Combine all loaded teams without requiring a session selection. Keep the native provider modes and existing Board/Graph behavior.
- Use a vertical 2.5D cutaway building, muted navy/wood rooms and distinct, outlined characters: people, robot, raccoon, owl, fox and alien. Preserve identities by the real session/agent IDs. AI provider, model, role, current activity, parent and delivery evidence remain readable in labels/details.
- Small teams share a floor; larger and nested groups get further floors. Quiet teams can collapse. Finished agents share lounge space. Display all included agents, with no silent truncation.
- Initial snapshots place people directly. Only newly observed task/delegation/delivery changes trigger work animations. Done, sent and received remain distinct. Never infer a parent from names, fabricate acknowledgement, or replay history on reload/reconnect. Stale sources stop work animations.
- Real local time controls the sky, windows and room lighting. Clouds, plants, coffee steam, idle moods and pets are decorative, not work evidence. Respect reduced motion, animation off/low, hidden views and explicit pause.
- Keep a resident cat and 1–2 randomly selected visiting pets per Office mount. Optional quiet, short cat easter eggs stay in the lounge, with no sound or blocking UI.
- User refinement during implementation: quiet/hidden teams may leave the building. Open the ground-floor door for departures; active arrivals walk in and take the elevator to a desk. Presence paths are display animations and do not claim assignment/delivery evidence. Retain identities for absent agents so they return with the same look.
- Clicking a character or its accessible label opens the existing evidence detail panel for that character's actual team. Support narrow desktop widgets and wider windows with scrolling and clear dark scrollbars.
- Reuse read-only snapshots already sent by the relay; add no database writes, T3 actions, dependencies or fabricated agents. Build and package a runnable desktop artifact after checks. Do not close the user's app or replace a locked installation merely to build.

Approach selected: React for accessible labels and interaction, Canvas 2D for pixel art and 2.5D geometry. A full WebGL scene would add runtime/dependency cost without helping this small vertical viewer; a static illustration would lose live movement and state.
