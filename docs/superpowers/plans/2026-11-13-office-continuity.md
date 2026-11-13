# Office continuity and seasonal flowers

User reported flowers repeating across seasons, rooms swapping floors and newly created agents teleporting.

- Reproduced floor reorder: `waiting_*` promoted a room ahead of other teams. Remove status priority from physical layout. Persist first-seen team order; append newcomers; keep dormant team slots in the ordering so returning teams keep relative identity. Finished rooms may still close as requested.
- Replace fixed sunflower groups in rainy/cool foregrounds and their closed-hatch overlays with season-specific plants. Preserve geometry and sky alpha. Hot-season sunflowers remain as one distinct seasonal motif.
- Newly observed actors enter through the hatch and walk/climb to their destination; keep initial history static. Hide their canonical destination bodies while entering, support staggered parallel arrivals and retain real task ownership.
- Verify regressions, full tests and TypeScript, inspect final assets/movement, build/package, commit and reopen.

Verification: floor-order regression failed before the fix, then 17/17 model tests passed. Arrival regressions verified red first, then 28/28 targeted tests and TypeScript passed. Integrated web suite: 245/245 passed; TypeScript and desktop build passed. All four corrected flower assets retain transparent sky at 1000 × 563. Prepared package: artifacts.local/desktop-office-continuity.
