# Shared Office Stations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task by task. Work in the current authorized checkout and preserve unrelated sky files.

**Goal:** Replace identical desks with shared tools that reflect real agent activities, and fix completed rooms and walking flashes.

**Architecture:** Pure station layout and occupancy helpers feed the model, motion and React station controls. Separate generated shell and tool sprite assets remain behind the existing canvas actors. The RAF owns moving frames.

**Tech Stack:** TypeScript, React, canvas, WebP, existing node tests.

**Spec:** ../specs/2026-11-13-shared-office-stations.md

- [x] Reproduce hidden failed-worker room retention; remove terminal failures from room liveness; verify regression.
- [x] Reproduce walking position jumps with a real mounted component; keep RAF ownership during clock updates; verify continuous frame positions.
- [x] Add tested deterministic station layout, current-work occupancy and tool classification.
- [x] Integrate separate empty-room/tool assets, standing actor locations, matching walk targets and inspectable station controls.
- [x] Add distinct character silhouettes, work/rest/party props and selectable leisure objects.
- [x] Share ladder geometry, steady climbing, floor landings and automatic/manual hatch operation.
- [x] Reserve captions and connection status space; preserve valid trips across reconnecting.
- [x] Verify the full web suite, type check, visual examples and walking continuity; build/package and reopen the application.

Validation: 231 web tests passed, TypeScript passed, desktop build and packaging passed. Production character/ladder drawing commands rendered to PNG; the earlier mounted walking fixture reproduced then eliminated position resets. Native automated screenshot capture was unreliable, so full interactive visual confirmation is still a manual check. Reconnect regressions failed before implementation and passed afterward. Package: artifacts.local/desktop-shared-office-final.
