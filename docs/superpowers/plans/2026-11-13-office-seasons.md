# Office seasons and calendar activities

User requested connecting the prepared Thai season model, seasonal random events, date-based activities, and decorations in both offices and break rooms. Continue the current canvas/React architecture and local clock; weather is decorative simulation. Preserve the real sun path and job state. Only eligible resting residents take short object trips, on clicks or occasional scheduled invitations.

- Connect the existing sky model and painter, fix event-start caching, add seasonal event pools.
- Add stable hourly seasonal activities and holiday overrides. Use the official 24 November 2026 Loy Krathong date as a checked calendar fixture (https://manage.dld.go.th/index.php/th/news-head/relations/calendar2569); other years use the existing approximate lunar calendar.
- Decorate each work/break room with bounded season and holiday props; keep station controls, boards and shaft clear.
- Add three transparent Thai-season garden foreground assets, preserving object positions and the live sun path. Vary trees, flowers, grass, soil and seasonal fauna across the whole garden. Built-in imagegen edits the original asset; no real weather feed. Generated prompt: preserve the original composition and transparent sky, changing only vegetation/ground to hot golden tropical blossoms, rainy emerald ferns/mushrooms/puddles, or cool sage/amber-green foliage/cosmos; no snow, people or shifted furniture.
- Verify calendar/event boundaries and drawing geometry, full tests, TypeScript and package; commit and reopen.

Verification: full web suite 241/241 passed. Targeted drawing/calendar tests also passed after correcting grass bounds and moving clouds behind tree artwork. Production drawing commands and the shipped assets were rendered together for all seasons and Christmas. Transparent sky samples checked on all six garden assets. Asset prompts and provenance: `web/components/agent-visualizer/office/assets/SEASONS.md`.
