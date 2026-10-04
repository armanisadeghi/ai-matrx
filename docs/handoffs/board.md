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

**Live at `/board`, `/board/<id>`, `/board/all`:** saved boards, every item type passing the remount quiet law (record, table, task, project, meeting, chat fixed 2026-10-04), the two-request agent bridge, board comments, Page tiles.
**Fixed 2026-10-04:** unsent chat tile reload; "New board" in the title menu opens the board; two-tab per-tile merge; tile placement in rows; phone toolbar "More tools"; documents no longer render black; file Versions loads in about 2.5 s.

**Still open (full wording in FEATURE.md "Open"):** feature boards (War Room, Meetings, Workflow runs) as Board menu sub-options and publishing `board_items` basics; dormant table says "not loaded yet"; same-tab document sync (realtime package); saving a file shared with edit rights (aidream replace-by-id); `change_summary` stored null; camera overshoot on table checkboxes; caret following in textarea/Monaco; more item types (lists, scopes, study sets, flashcards); agent multi-item run and approval-card tool trace (untested, blocked); a full `pnpm type-check` never run.

Tests: `pnpm -s jest --forceExit features/board packages/chat/src/surfaces/runtime`. Browser: `docs/official/browser-testing.md`; `pnpm preview:start` then `pnpm dev-login /board`.
