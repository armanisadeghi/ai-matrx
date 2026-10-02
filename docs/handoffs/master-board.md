---
type: Handoff
title: "The master Board (/board) — handoff"
description: "Arman's own canvas, meant to become the one main UI: drop in any platform feature, work in it for real, and let agents reach every item."
status: active
updated: 2026-09-30
repos: [matrx-frontend, aidream]
scope: feature
feature: Spatial Board
vision: []
---

# The master Board (/board) — handoff

**What this is:** a zoomable canvas at `/board` (its own menu item, with feature boards such as War Room as
sub-options) where a person drops in anything the platform supports (notes, files, chats, custom data
tables and records, tasks, meetings, research, projects, workflow runs, web pages, images) and works in
the REAL feature component inside the tile, while agents can read and change every item.
**Seen from his seat:** open `/board`, press Add, pick an item type, start a new one or bring in an
existing one, work in it; chat with the board's agent about several items at once.

## Vision — Arman's words

- "the user's master one and it's got it's own menu item... show all of the supported features as
  suboptions... drop in anything... If we do it properly, it will eventually be the only ui we ever
  need... The big key is that you can choose form supported options to drop things into the ui and just
  get started on them immediately."
- "each item that is added properly declares it's FULL surface values and actions because if the agent
  can't do the exact same things as on the normal screen, it doen't work well"
- "The 'notes' you added are fake. it's not our real notes ui... Ideally, we give them literally the same
  ui but if not the same ui, then at least the same core part"
- "it still needs to offer all of the items that are open and the agent should be able to reach them
  with two requests. The first carries the active surface and a list of all other open items... give the
  agent enough info to know what that item is, including the name and some basics. If the agent wants to
  do something with the non-open items, it fiirst requests that item and it gets the state and controls
  for it."
- On a multi-item ask: "We're working on redoing the website and I have some images here and I have the
  notes with the color options. Look at what this other agent said and then see if you think for our
  website the colors I have set in the table make sense and update them for what you think is best."
- "the things on the canvas don't have proper controls for resizing... You have to easily and freely
  resize"; "scrolling the page DOES NOT WORK if you are hovering over one of these items. We cannot ever
  have the scroll move the canvas when you're over one of these"; full screen on a chat tile "changed
  sizes" and he "couldn't get out... you cannot allow that to happen"; "a double click on any node needs
  to move to it, zoom it in and bring it into focus." "There are a lot more things like that."

## Where it stands

- Item registry + Add menu: `features/spatial/items/` (`catalog.ts`, `*-items.tsx`, contract in `types.ts`); every item declares `surface`.
- Real components in tiles: notes (`NoteWorkspace`), file (`SingleFileWorkspace`, 7 tabs), chat (`ChatConversationSurface`, shared with `/chat`), custom-data Table (`UnifiedTable`, shared with `/data-v2`) and Record (`Peek`), document (`DocumentRecord`, shared with `/documents/[id]`; agents read and write its body), task, War Room, meeting, workflow run, research, project.
- Agent reach in two requests: `board_items` value (every item + `basics` from each manifest's `briefValues`), then `board_open_item` / `board_item_act` (`features/spatial/tools/item-surfaces.ts`); only the live tile registers globally (`SurfaceActivity`), every tile registers into its own capture.
- Skill for adding an item type: `.claude/skills/board-items/SKILL.md`, proven RED/GREEN (`evals.md`).
- Every core item type, the two-request agent bridge, a multi-item agent run and the board gestures are browser-proven; the custom-data merged grid (agent access to tables) is on platform-wide.

## Future — everything still open

1. **Board interactions — the next batch.** Built and browser-proven (see "Board gestures" in `features/spatial/FEATURE.md`): 8-handle resize on every board (`SpatialTile.onResize` is required; `features/spatial/__tests__/resize-wiring.test.ts` fails on a board that forgets it); wheel and touch over a tile never move the board (`routeWheel`, `pressAction`); the board never scrolls natively and the camera follows keyboard focus (`native-scroll.ts`, `reveal.ts`); keys inside tile content belong to the content (`key-target.ts`); full screen fills the viewport with a fixed Close and one Escape per layer (`pushFullScreenLayer`, `features/shell/canvas-chrome/open-layer.ts`); double-click on chrome flies to a tile. Open:
   - Arman: "There are a lot more things like that" — ask him for the next batch; nothing else is known.
   - A phone swipe starting at the screen's left edge (x≈30) does not pan the board — probably the workspace's edge-swipe gesture claiming it; decide which wins.
   - Resize on the demo, meeting and workflow-run boards is proven by the required prop and the parse test, not in a browser.
2. **Browser verification — what is left.** Proven from the user's seat with real data (add, real task, visible on the feature's page, one registration, reached by an agent while dormant): note, file, chat, custom-data table and record, task, document, brought-in project (read only); plus a real multi-item run in the board's side chat (the agent read a "Website colors" note and set a table row's color through `board_open_item` → `board_item_act` and the approval card). Still open:
   - Not walked: meeting, War Room and workflow-run tiles; edits in a project tile; the saved file's content on `/files`.
   - **An agent wrote to a table through a server-side records write tool with NO approval card, then raised the board's card for the same write.** The board path is correct; the question is why an agent holding the surface's write target also holds a direct server write tool for the same record. Trace which tool it was (the conversation's tool calls) and raise it with the agent-tools owners (`../common-docs/systems/agents/agent-tools/STATE.md`); agents never edit agent definitions themselves.
   - Before its grid loads, a dormant table reports `row_count` 0 and `is_read_only` true; it should say "not loaded yet".
   - Testing on the nightly database copy is impossible in a Claude cloud container (the clone preview needs `../aidream`, a clone-wired server on :8200 and a password kept on Arman's Mac). Walks here used ordinary UI records on live, all deleted or archived afterwards; on Arman's Mac use the clone.
3. **Documents — two things left** (aidream + frontend):
   - **Two tiles of ONE document in one tab do not sync live, and both autosave** (the later snapshot wins). `@ai-matrx/realtime` gives every holder in a tab the same client id and suppresses echoes (`SupabaseYjsProvider`), so same-tab Yjs peers never hear each other and each elects itself host. Fix in the package (`aidream/apps/shared/realtime`, THE SAME-SESSION LAW) with local fan-out between holders of one topic; never on the board. Cross-tab collaboration could not be tested in the container (the realtime WebSocket handshake answered 500).
   - Univer's page canvas renders black/transparent in the container's headless Chromium on `/documents/<id>` and in the tile alike (the text is there: word count, saves, agent reads). Check in a real browser before calling it a product defect.
4. **More core items** Arman asked for ("custom data, files, and more"): scopes, lists, and an education board (study sets, flashcards). Follow the `board-items` skill.
5. **Known weaknesses:**
   - Files: every editor save now goes through `saveFileNewVersion` (`features/files/redux/thunks.ts`), but saving a file another person owns and shared with edit rights is REFUSED with a message, because the files service resolves the upload path under the uploader; the real fix is a replace-by-id endpoint in aidream. The `change_summary` sent with a save is stored as null. The Versions tab sat on "Loading versions…" for 8+ s in a walk. Earlier broken saves left real "name (1)/(2)" copies in people's files; leave them to their owners.
   - Camera follows focus: on the "Grid Parity Fixture" table, Tab onto a row checkbox the grid keeps past its own scroll edge panned 411px where the rule predicts ~53px and left the grid edge ~50px off screen (suspected: the settle-window re-check measuring mid-way through the grid's own scroll). Caret following is not built for plain `<textarea>`/`<input>` or Monaco.
   - Record tile: `RecordsProvider` memoizes its client on its config; `config.realtime` comes from `createRecordsRealtimePort(org)` in `useUnifiedTable` and relies on the React Compiler memoizing it; if it doesn't, the record surface re-reads row actions every render.
   - Notes tile has no comments (matches `/notes`, which has none); mode labels collapse to icons below a 26rem-wide tile.
   - Meeting, War Room and workflow-run feature boards don't yet publish `board_items` basics.
   - Files: no mobile host for `/files/f`.
   - Only the data-tables, notes-editor and documents briefs were chosen with their features in mind; the other seven were chosen mechanically; review them when you touch those surfaces.
   - A full `pnpm type-check` has never run on this work (a cloud container lacks the memory). A scoped check over every board, surface-runtime, table, chat, notes, documents and files file this work touched is clean.

## Resources

- Mechanics: `features/spatial/FEATURE.md` (Board section + change log); item contract `features/spatial/items/types.ts`; surfaces runtime `packages/chat/src/surfaces/runtime/SurfaceRuntimeContext.tsx` (`SurfaceActivity`, `createSurfaceCapture`, `useSurfaceDormant`); bridge `features/spatial/tools/item-surfaces.ts`, `useBoardAgentTools.ts`, `board-tools.ts`; board manifest `features/surfaces/manifests/spatial-board.manifest.ts`.
- Tests: `pnpm -s jest --forceExit features/spatial packages/chat/src/surfaces/runtime features/unified-data/__tests__/one-record-carries-the-data-tables-surface-for-that-row-only.test.tsx`.
- Browser: `docs/official/browser-testing.md`; `pnpm preview:start` then `pnpm dev-login /board`; admin's Workspace in the org picker. In a Claude cloud container, Chromium needs `--ignore-certificate-errors-spki-list` with the egress CA pins (never `ignoreHTTPSErrors`) and the proxy bypassing `.localhost`; the dev server uses ~8.5 GB, so run one browser at a time and no full type-check alongside it.
- Skills: `board-items`, `surface-authoring`, `surface-write-targets`.
