# Seasonal garden assets

Generated with the built-in imagegen tool from `surface-foreground.webp`, then resized to 1000 × 563 WebP (quality 88, alpha preserved). The sky remains transparent for the live daylight canvas. Each season has an open foreground and a matching closed-hatch overlay; the overlay is clipped to the hatch region at runtime.

Files: `surface-hot.webp`, `surface-rainy.webp`, `surface-cool.webp`, and the corresponding `surface-*-closed.webp` files.

Shared prompt: Edit the reference foreground in the same hand-painted game style and composition. Keep the trunk, picnic table, bench, coffee cart, open hatch, lawn edge and soil cross-section in their original positions. Preserve transparent sky, neutral daylight, no text, people, animals or new furniture. Change the botanical appearance and ground vegetation throughout the foreground.

Season additions:

- Hot: Thai tropical summer; mango-green canopy, golden-yellow flowering branches, pink bougainvillea, straw-gold grass patches, sunflowers, terracotta soil. No barren or leafless tree.
- Rainy: deep emerald canopy, glossy broad leaves, lush mossy grass, ferns, mushrooms, purple/blue flowers, damp soil and small puddles. No baked rain streaks.
- Cool: sage/olive and amber-green canopy with scattered copper leaves, golden grass tips, white/lavender cosmos and chrysanthemums. Thai cool season; no snow or bare winter branches.

Flower correction prompt: Remove every sunflower plant, including the large yellow/brown flower groups along both edges and mid-left. Replace in the same planting spots with rainy-season fern/glossy foliage and blue-purple hydrangea clusters, or cool-season white/pale-lavender/pink cosmos and chrysanthemums. Preserve all other objects, hatch open/closed state, composition and transparent sky. Sunflowers remain in the hot-season variant only.

Closed-hatch prompt: Change only the right-hand open hatch: lay the wooden lid flat over its opening with a small brass pull handle; remove the raised lid and reveal matching seasonal grass behind it. Preserve all other objects, colors, composition and sky transparency.

Seasonal animals, moving flowers, weather, room decorations and calendar events are drawn by code rather than baked into these images.
