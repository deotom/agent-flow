# Office background assets

User-supplied, approved shipping artwork from `artifacts.local/office-concept`.
The `room-break*.webp` decors were generated in the same Figma file and encoded with Pillow WebP q78.
The concept image is not included. Encoded with Electron canvas WebP quality .83,
1000 px wide (2x a 500 px scene); no runtime image dependency.

| File | Bytes |
| --- | ---: |
| surface.webp | 88,520 |
| room-a.webp | 64,752 |
| room-b-lead.webp | 106,046 |
| room-c-big.webp | 123,150 |
| bottom.webp | 46,372 |
| room-break.webp | 72,084 |
| room-break-game.webp | 66,026 |
| room-break-garden.webp | 103,712 |
| room-break-reading.webp | 88,596 |
| Total | 759,258 |

Seat and monitor coordinates are normalized against the original full image in
`OFFICE_SLOTS` in `web/lib/office-model.ts`. Rooms overlap their soil bands by
10%; the cap crops its sky margin in CSS. Canvas draws one continuous side shaft
over the incompatible ladders in the separate artworks. CSS URLs bundle into the desktop and
extension builds, without absolute filesystem or HTTP paths.

`surface-foreground.webp` (136,796 bytes) is an imagegen edit of `surface.webp`,
with the sky, clouds and painted sun removed to alpha. It preserves the garden
composition and was encoded to 1000 × 563 WebP with alpha. A separate canvas behind
it draws local-clock daylight; the foreground brightness changes with the same clock.
The original opaque surface remains as the source asset. The sun follows a decorative
06:00–18:00 arc; it does not request location permission or claim astronomical accuracy.
