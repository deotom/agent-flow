# Room and daily prop atlas v1

Created 2026-11-14 using the built-in `image_gen` tool, transparent-background mode.

Project output: `room-daily-props-v1.webp`, 1536 × 1024, RGBA, WebP quality 90/method 6. Original existing artwork was not overwritten. The generated PNG alpha channel was checked: transparent gutter samples have alpha 0.

Selected source: `D:/Users/wanpiyar/.codex/generated_images/01a1d7f5-3bc8-75d1-a5d2-65f5981f5d3a/exec-13870d7f-5f32-4ac6-9294-55d431f36177.png`.

Style references inspected: project `room-stations.webp`, `work-stations.webp`, and `room-break.webp`. The requested `level-lift-office.png` was not found in the workspace; existing room assets provided the actual production style reference.

Atlas cells (equal 512 × 512 cells): studio / operations / research; quality / lead reading nook / lunch buffet. Draw code crops these cells and reuses the original painted game table for canteen dining tables. The garden food stall is the same compact buffet sprite, not a new person or task agent.

Generation prompt:

> Use case: stylized-concept. Asset type: transparent game sprite atlas, 3 columns by 2 rows, six equally sized rectangular cells; total image landscape 1536x1024, each cell 512x512, generous empty transparent gutters, all sprites wholly inside cells. References: the viewed warm hand-painted wooden office workstations and orange underground blank room. Match their rich detailed 2D painted storybook game artwork, brown ink edges, golden lamplight, realistic painted wood grain, front view with slight view of top surfaces. Create SIX DISTINCT isolated prop sets: TOP LEFT: creative studio wall display, rolled blueprints, pinned art studies, warm terracotta hanging cloth accent; TOP MIDDLE: operations wall display, aged teal control panel and organized brass pipe conduits, no floor desks; TOP RIGHT: research wall display, botanical specimen chart, shelves of sample jars, moss-green cloth accent. BOTTOM LEFT: quality assurance wall display, navy blue framed inspection diagrams and neat brass measuring tools, no floor desks. BOTTOM MIDDLE: cozy compact reading nook, a worn warm brown armchair with sage cushion, tiny side table holding coffee and report folders, small reading lamp. BOTTOM RIGHT: lunch buffet counter of warm carved wood with three food trays, ceramic plates and cups, lower cubby for returned trays, small brown parcel and thermos. No writing/text/letters, no characters, no room walls/background, no pastel flat vector style, no isometric dollhouse, no shadows outside own cell. Transparent background.

A second targeted transparency edit was generated and selected. Edit prompt: “Edit this sprite atlas: remove the entire brown background between and around the six prop groups, replace it with REAL alpha transparency. Keep all six painted sprite groups exactly in their current cells, colors, dimensions and arrangement. Each object should be isolated on a genuinely transparent background; no brown glow or panel backdrop. Preserve the warm painterly objects and their internal enclosed backgrounds. The standalone reading chair + table and buffet must have transparent surroundings all the way to their silhouette. No checkerboard painted into the image.”

Chrome headless alpha compositing was visually verified against a blue background: `artifacts.local/office-daily/alpha-check.png`. Raw image viewers may display the brown RGB values beneath fully transparent pixels; the browser renders the alpha correctly. No Python image editing was performed; Pillow was used only to inspect pixels and convert the selected PNG to WebP.
