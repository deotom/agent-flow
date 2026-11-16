# Office Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Root integrates this approved batch; a bounded native helper may own discovery component files.

**Goal:** Make existing Office information readable and interactive objects discoverable at369px, with direct navigation to people who need attention.

**Architecture:** Pure interaction helpers derive current actor details and stable waiting targets; OfficeView owns user-initiated navigation and one fixed detail surface. A separate discovery hook/component owns its versioned local preference and nonmodal tip.

**Tech Stack:** Existing React/TypeScript/CSS and Node tests; no dependencies.

**Spec:** ../specs/2026-11-16-office-clarity-design.md

## Global Constraints

Preserve art/camera, source snapshots, motion/lift ownership and hidden-team policy. No backend messages, automatic follow, sound or large assets. Use actual physical actor frames for reveal, source data for status/task. Respect reduced motion and normal pause. Keep composer outside fixed Office panels.

## Review Focus

- Waiting actor disappears/changes status between user clicks: rederive targets; no stale selection or room spawning.
- Actor in a private annex or moving lift: reveal the actual parent room without teleporting or overriding motion.
- Long Thai names/goals, narrow viewport and keyboard use: full wrapping details, internal scrolling and Escape/focus restoration.
- First visit/storage failure/hidden page/replay/reduced motion: no stolen focus or persistent animation.
- Existing station/planning panels and private peek: only one detail panel; close paths remain usable.

### Task1 — Information and navigation (root)

- [x] Add pure helpers and failing tests for stable waiting rotation, full source information and actual-floor reveal.
- [x] Add fixed agent/planning detail panel; integrate selection from public and private actors, explicit Board action, Escape and return focus.
- [x] Turn needs-you into cycle button and add Locate selected using current actor frames; validate unavailable actors via Board fallback.

### Task2 — Discovery (native helper)

- [x] Add isolated discovery hook, nonmodal tip and scoped CSS. Versioned dismissal; timed first display only while visible, manual replay.
- [x] Use one-shot highlights with static pause/reduced-motion fallback; verify component rendering and storage parsing as appropriate.
- [x] Root integrates controls and verifies existing hover/focus remains usable.

### Task3 — Review and delivery (root)

- [x] Focused tests, full web tests, TypeScript and native narrow-view checks; inspect actual screenshots and keyboard/navigation results.
- [x] Detailed Claude review and fix verified findings; desktop build/package, canonical normal-profile reopen and live check.
- [x] Local commit with clean working tree, no push.

## Delivery verification — 2026-11-16

Implemented the approved first three priorities. Expanded planning reads complete source task names and all items while the painted board stays concise. Source status, request kind and deliberately expandable task results remain available; detailed evidence/context stays accessible through Board.

Final verification:383/383 web tests passed; TypeScript, desktop build and packaging passed. Pure/SSR regressions were observed failing before implementation and passing afterward. Native369px profiles validated complete Thai names/model strings, five-item planning expansion, attention cycling, private Locate, stable user-only scrolling, static off/reduced-motion cues and tip dismissal/replay. A7-team repro exposed the last actor hidden beneath the inspector; measured scroll clearance fixed it. Final selected actor stood at y337–397 above inspector y542, with scroll1129 stable across ordinary ticks. Tip contrast was10.23:1.

Claude completed a detailed source/artifact review with no blockers. Fixed restored-selection focus theft, Escape outside the inspector, exclusive tips/details, empty task-name fallback, duplicate assignment text and retained request/result content. Nine native post-review checks passed. A rapid close-inspector/open-door post-install check exposed a deferred focus-restore race; restore now respects newer focus ownership, and the identical live check passes.

Normally reopened the canonical app/profile from artifacts.local/desktop/Agent Flow-win32-x64. Final package is artifacts.local/desktop-clarity-20261116-final/Agent Flow-win32-x64; installed/source ASAR SHA256 both1764B28388816B0632B135FDD92DBF6FDB20B708EF25FEC128565BB728010F82. Live app Connected; station details, private peek, Back and focus restoration all passed. Evidence under artifacts.local/office-verification/clarity-*. No Sonar binding/scanner configuration found. Local commit only; no push.
