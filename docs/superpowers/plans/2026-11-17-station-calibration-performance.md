# Station calibration, live inspection and measured rendering work

User authorized the remaining review suggestions: inspect the actual screen, measure CPU/FPS, and align hardware lights and right-facing views precisely. Retain the original underground artwork, geometry and interactive controls.

## Evidence before changes

Opened the actual installed app's HTTP renderer in T3 Preview at a 380×1000 CSS viewport, connected to its real read-only event feed. This is a live app renderer, not a fixture; it is not a Windows-window capture. The saved before screenshot is under `artifacts.local/office-verification`. Native computer-use activation/listing remained unreliable. The Preview pause action timed out; a later DOM check confirmed motion was still enabled, so no paused comparison is claimed and the user setting was not changed.

One live Preview sample recorded 4.76 rAF callbacks/s, approximately 5.12 canvas clears/s, 333ms p95 rAF interval, and 5 displayed agents with 8 stations. A separate six-second sample measured 12.51ms mean paint-stack work and 16.4ms p95. These are Preview/browser observations under variable load, not native Electron FPS and not a controlled before/after performance claim. A single eight-second native Agent Flow process-group CPU sample used 3.23 CPU seconds across 12 logical cores (about 3.28% of host capacity); this includes the app's other processes, not just Office.

The isolated CPU Canvas benchmark showed that physical-station presence checks were small relative to painting. Keep status reads fresh; do not introduce a cache of actor activity. Benchmark data, sample variation and scenarios are in `artifacts.local/office-verification/qa-runtime/station-perf-bench.json` and `station-mixed-uncached.json` / `station-mixed-cached.json`. The mixed scenario uses identical final code/assets with the raster path enabled or disabled: 8 stations, 1 working and 7 idle. It is a microbenchmark, not native FPS.

## Changes

- Separate atlas landmarks into `office-station-hardware.ts`. Every right-facing view has its own measured screen, lamp and page coordinates rather than a reflected left view. Terminal indicators use actual lit pixel-component centroids, including console buttons, instead of regular grids over blank slots. Source-image verification checks 101 light landmarks within two source pixels, plus bounds and reading order for all 12 views.
- Batch terminal lights into bright/dim paths while retaining each physical light's phase. Screens and other device animations remain live.
- Cache only static equipment rasters. Working animation always bypasses the cache; idle, waiting, failed and frozen displays can reuse pixels. State, source image, size, depth, device scale and pixel phase are part of the key. Moved placements reuse appropriate pixels; changed state or artwork cannot show old pixels.
- Bound the LRU to 32 entries and two million raster pixels (about 8MB RGBA backing, excluding implementation/GPU overhead). No disk cache or new production dependency. Faded parents, custom compositing/filtering, rotated/nonuniform transforms, disabled smoothing and unavailable OffscreenCanvas use direct painting.
- Align raster blits to device pixels and preserve the original subpixel phase inside the raster. Initial pixel comparison exposed softened edges; the corrected 12-view, 68px, 2×-density comparison has mean RGB error 0.056/255 and no pixels exceeding a 24-channel-value difference. The regression rejects the previous compiled raster implementation and passes the correction.

## Verification and limits

Focused device/cache checks pass 7/7, including reuse, live bypass, changed status/artwork, moved placement, faded-parent fallback and pixel-aligned blits. Source-light validation passes 101/101. Pixel and asset fixtures live in `artifacts.local/office-verification/qa-runtime`; the root inspected both the actual live renderer and the enlarged direct/cache comparison. Full tests/types/build/package are being run in `station-polish-checks-status.json`; Claude review is required before installation.

No native animation capture or native FPS improvement is claimed. The Preview's low cadence is not proven to be caused by station effects. Isolated benchmark improvements must not be presented as whole-app performance gains.

## Review and final verification

Claude found no blockers in hardware calibration, cache keys, pixel alignment, bounds, eviction or fallbacks. Following the review, repository tests now check display reading order for every view, entry-limit eviction, pixel-budget eviction, oversized-layer bypass and missing-OffscreenCanvas fallback. New art ids invalidate content; old rasters remain bounded until LRU eviction.

Runtime checks passed 491/491 with types, desktop build and package. After the test-only guard additions, the full web suite passed 494/494, focused device/cache checks passed 10/10, and TypeScript passed. No runtime source changed after the reviewed build. Installed ASAR SHA256: `3d2ec407be142dd8c7d4fe5428eba3d15589e2f3612b9b8e8926d5ec6cbf5907`; previous package is retained as last-good. The native process responded after installation. Launching from this harness used an explicit child environment without `ELECTRON_RUN_AS_NODE`.

Post-install actual live renderer validation at 380×1000 found no console or network errors. Over 166 paints it used 1,162 OffscreenCanvas raster blits and 166 direct station-atlas draws: seven static stations reused pixels while one active station stayed live. Mean observed paint-stack work was 4.3ms. A separate four-second Preview sample observed 46.98 rAF callbacks/s and 26.49 canvas paints/s. The live workload and load conditions changed, so these are observations, not a controlled whole-app gain or native Windows FPS.

Evidence: `artifacts.local/office-verification/station-polish-live-proof.json`, `station-live-after.png`, `station-polish-review-web-tests.log` and `station-polish-checks-status.json`. The owned Preview tabs were closed. Native-window visual capture and native FPS remain unverified.
