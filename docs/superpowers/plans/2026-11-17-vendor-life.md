# Garden cart: quiet work between customers

Keep the original painted cart, garden, clerk and seasonal wardrobe. Add a small joined preparation shelf, seasonal bunting and visible seasonal wares. The clerk alternates preparing a tray, wiping the shelf and handling a stock tin, with rest gaps and smooth hand reach. Feet remain at the existing grounded origin.

Use the existing Canvas painter and motion clock. A real pickup overrides chores immediately and retains its real recipient and single-parcel handoff. Chores never mark a purchase, change stock, create an actor, reserve travel or write source state. Wet staff remain sheltered and still; night remains closed. Motion time zero leaves the clerk idle.

Implementation: `office-vendor-art.ts` owns bounded cosmetic chores/accents; `office-art.ts` passes hand targets and turn into the existing avatar. Existing shop runtime and lift routing stay unchanged.

Validation: a regression first failed because every sampled frame was idle. The focused vendor/handoff suite passed after implementation. A final full web test/type/build/package run and Claude review are required before delivery. Canvas evidence: `artifacts.local/office-verification/qa-runtime/vendor-life-study.png` (fixture with actual painter/assets, not a native app capture). Native UI testing remains unavailable because the computer-use tool cannot activate the running window; do not claim native motion verification.

Claude review found a real mismatch: `supportHands` alone did not activate contact targets, and seasonal wares could cover the sheltered clerk. Both were reproduced by failing regression tests. `officeVendorAvatarPose` now enables the existing supported-contact paint path, with the left hand outside the foreground apron; wet staffed windows omit foreground wares. The production painter and contact tests share this pose helper. Focused vendor/handoff checks pass 17/17, including actual returned palm versus prop positions at widths 240/450/700. No shop or agent runtime state was changed.

Final verification after those fixes, 2026-11-17: web 479/479, TypeScript, desktop build and candidate package all passed (driver finished 03:14:12 UTC). Details are in `artifacts.local/office-verification/vendor-life-checks-status.json`. Native motion verification is still not claimed. The review findings were fixed directly with regression coverage; the original review did not approve the pre-fix tree.
