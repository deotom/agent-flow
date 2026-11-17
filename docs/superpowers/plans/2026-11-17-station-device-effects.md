# Working devices in the underground Office

User asks for blinking equipment lights and lit displays that make workstations feel interactive. Keep the original painted station assets, room theme, camera, hardware angles, click targets and inspector. Add localized Canvas effects on the actual displays, indicator rows, lamp bulbs and book surface.

Development benches show scrolling decorative code lines; operations consoles show moving traces and softly changing rack indicators; verification equipment shows a trace and warm lens light; research corners have a warm lamp and subtle page highlights. These traces are cosmetic, not actual command output or test results. Idle devices stay dim and static. Waiting/failed states have static colours. A last-known source or disabled/reduced motion freezes the display while retaining its lit state. Device phases vary by stable floor/station key.

Activity comes only from a visible stationary actor in the same floor and desk zone, physically near the matching work point. Hidden, faded, walking and lift actors do not power a tool. Priority is failed, waiting, working, idle. No source or runtime state is written.

Use normalized landmarks within each tight atlas frame. Screen content is clipped to a quadrilateral and interpolated on that plane, rather than placed on a screen-aligned rectangle. Front-view fallback uses front-view landmarks. Effects are interleaved with the equipment before foreground actors, preserving depth occlusion. Hide the old floating DOM light when Canvas art is available; fallback buttons keep their existing indicator.

Verification: the initial regression failed because working frames were identical. Focused checks cover animation, static idle/waiting/failed/effects-off frames, finite coordinates, all twelve views, front fallback, physical presence and source immutability. Canvas fixture `artifacts.local/office-verification/qa-runtime/station-effects-study.png` shows all twelve asset views; it is not native UI evidence. Full checks and Claude review remain required before installation.

Claude review found no code blocker and confirmed all twelve atlas alignments. Its package-incomplete note was superseded by the completed 04:37:10 UTC driver. Review feedback led to stronger static waiting/failed screen contrast, clear bright/dim rack activity, and corrected left-to-right content winding in right-facing views. Added regression coverage for alert trace strength, independent rack indicators and inherited alpha; the new contrast/indicator tests first failed, then passed. Focused suite now passes 6/6.

The native computer-use attempt failed with `list_apps` timeout. No live animation or native visual verification is claimed. Additional 1x fixture `artifacts.local/office-verification/qa-runtime/station-effects-native-size.png` uses 68px stations and compares idle, working at two times, waiting and failed. It is explicitly a Canvas fixture, not a screen capture. Final full checks after the review refinements are in `artifacts.local/office-verification/station-effects-checks-status.json`.

Final post-review checks completed at 2026-11-17 04:48:32 UTC: web 490/490, TypeScript, desktop build and candidate package all exited 0. No new assets or production dependencies were added. Room layout, hardware placement, click targets, task state and command execution are unchanged.
