---
type: Handoff
title: "The Board (/board) — status handoff"
description: "Where the Board stands on 2026-10-04 and what is still open; the feature's mechanics, vision and open list live in features/board/FEATURE.md."
status: active
updated: 2026-10-04
repos: [matrx-frontend, aidream]
scope: feature
feature: Board
vision: []
---

# The Board (/board) — status handoff

Everything durable (vision in Arman's words, mechanics, the one open list) is in [`features/board/FEATURE.md`](../../features/board/FEATURE.md). Read it first.

**Live at `/board` (the boards list, recents first), `/board/<id>` (one board; `/board/all` redirects to the list; `/board?add=<key>` opens the last-opened board and starts the item; no special home board) (2026-10-04, end of day):** Board is its own Workspace menu item with all 21 item types one click away; every tile type wakes without re-reading; agents reach every item through `board_items` → `board_open_item` → `board_item_act`, every write asks first; the feature is named Board in code, docs and the database (`projects.boards`, token `board`, surface `matrx-user/board`).

**Still open:** the numbered list under "Open" in FEATURE.md — first: with a tile live the agent still prefers knowledge_search over the Board's tools.

Tests: `pnpm -s jest --forceExit features/board ../aidream/apps/shared/chat/src/surfaces/runtime`. Browser: `docs/official/browser-testing.md`; `pnpm preview:start` then `pnpm dev-login /board`.
