# Compact private lounge and smooth room creation

The user requested a smaller lounge entered from the main office, smoother new-room insertion, new rooms always at the bottom, a construction scene, and a rotating red ceiling light for rooms awaiting an answer.

Implementation: each team's resting roster belongs to a virtual annex sharing its parent's bounds. It adds no building height and has no public ladder landing. A doorway in the workshop opens the private lounge as a cutaway over the same floor; Back returns to work. Resting actors, objects, seasonal props and Board overflow remain accessible there. Actor trips enter/leave through the interior doorway and retain their physical room segment so bodies do not appear in the wrong room.

Physical admission order tracks active rooms only. Quiet rooms close; newly activated rooms append, including returning teams. Initial history remains a snapshot. A new floor grows over900ms with a worksite overlay; existing geometry changes ease over420ms. Metadata refreshes cannot restart the transition; reconnect freezes it. New arrivals wait for the room to finish. Scroll anchoring is disabled to keep viewport position stable.

Waiting rooms show a gently rotating ceiling beacon based only on current waiting status; Effects off freezes the sweep. It disappears when the source no longer requests input.

Verify: model annex height/roster, private doorway motion without rides, arrival retargeting, layout interruption/freeze, admission ordering, accessible lounge/door/beacon, full tests, TypeScript, visual cutaways, build/package, commit and reopen.

Verification:257/257 web tests passed, TypeScript passed. Actual bundled-hook smoke verified freeze/resume, metadata updates, interrupted geometry and explicit pause. The final doorway-clearance regression failed before staging positions were adjusted, then45/45 affected tests passed. Production drawing commands rendered public/private cutaways together; two virtual annexes add no height to the833.4375-unit two-office fixture. Chrome HTML preview timed out after20seconds, so full browser screenshot verification remains unavailable. Package directory:artifacts.local/desktop-office-annex.

Claude Haiku review completed before commit. Addressed keyboard focus/Back/Escape, same-floor hidden overflow controls, door-to-shaft clearance and clipped rest spots; numeric seam regressions failed before fixes. The cutaway remains deliberately user-opened (not automatically opened by a passing actor), with a transit marker on its doorway. This modeless cutaway leaves other visible floors usable; only obscured controls in its own floor are removed from keyboard navigation. Destination-specific construction waiting is intentional. Review link:[Review compact Office lounges and room motion](t3-thread://v2/a51896ff-ecce-4c04-b1df-fb75bd4b7e5a/thread:delegated-task:command%3Amcp%3A81aa4dfc-2a4a-46cc-9e11-0137c0e025ec%3Adelegate-task%3A4530988f-4347-434b-b592-7bb962d52846).

After review fixes:259/259 tests passed and TypeScript passed. Actual bundled peek-component smoke verified mount focus and Escape handling. Right-side name tags align inward to avoid the cutaway seam. Full browser verification remains limited by the Chrome preview timeout.

Final detail: walkers fade through the interior threshold on both sides over280ms, instead of disappearing in one frame; canvas and name-tag opacity agree. The behavior regression failed before implementation, then the full260-test suite passed with TypeScript, production build and packaging.
