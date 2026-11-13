# Shared Office stations

Characters keep stable identities with distinct hair silhouettes, face shapes, clothing and accessories. Rest and party props include books, coffee, games, watering, music and snacks; clicking a room object sends an eligible resident on a decorative round trip without modifying their actual job state.

Navigation shares a single shaft/landing geometry between drawing and motion. Actors approach floor doorways, grip the ladder, climb at constant speed and step onto the destination landing. The garden hatch opens for actual passage and can be toggled manually.

Connection status occupies a fixed-height toolbar row. Reconnecting pauses the current rendered position and drops stale queued events; reconnection resumes only trips still supported by the current snapshot. Activity captions reserve their own row above the message footer.

The user chose shared work stations and a central planning board. Replace repeated personal desks with separate research, development, quality and operations objects on an empty room shell. Preserve the existing garden, ladder, team break rooms and local-clock lighting.

Each team keeps a deterministic station order and wall accent. Current observed work determines an agent's station; new work moves the actor between tools. Tool activity lights the matching station, and clicking a station shows its current agents through the existing agent details action. Do not invent task completion, progress percentages, tool output or messages.

Only working/background agents or live input/approval requests keep an office open. Historical failures cannot keep empty offices open. Active-scope residents must match Flow's visible roster. A static clock or snapshot repaint must not overwrite an active animation frame with a seated frame.

Use the existing React, canvas and local WebP pipeline. Generated room/sprite assets must ship in the repository. Keep the shell and tools on separate layers so work is interactive without regenerating backgrounds. Larger teams get extra floor space, rather than duplicated desks.
