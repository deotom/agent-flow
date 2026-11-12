# Office background assets

User-supplied, approved shipping artwork from `artifacts.local/office-concept`.
The concept image is not included. Encoded with Electron canvas WebP quality .83,
1000 px wide (2x a 500 px scene); no runtime image dependency.

| File | Bytes |
| --- | ---: |
| surface.webp | 88,520 |
| room-a.webp | 64,752 |
| room-b-lead.webp | 106,046 |
| room-c-big.webp | 123,150 |
| bottom.webp | 46,372 |
| Total | 428,840 |

Seat and monitor coordinates are normalized against the original full image in
`OFFICE_SLOTS` in `web/lib/office-model.ts`. Rooms overlap their soil bands by
10%; the cap crops its sky margin in CSS. Canvas bridges the ladder only over
soil, preserving the painted room ladders. CSS URLs bundle into the desktop and
extension builds, without absolute filesystem or HTTP paths.
