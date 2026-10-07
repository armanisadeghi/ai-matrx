# FEATURE.md — Board (`features/board`)

## Status — what is live at /board (2026-10-04)

- Routes: `/board` is the boards LIST (recents first by last opened; open, rename, duplicate, delete; deleted boards restorable, Archived filter; "New board"), `/board/<id>` opens one, `/board?add=<key>` opens the board the person opened last (a new one when they have none) and starts that item, `/board/all` redirects to `/board`. There is no special home board. Saved boards live in `projects.boards`.
- Board is its own Workspace menu item: Boards (the list) and one "Add to your board" row per item type (`/board?add=<item key>` starts that type on the last-opened board). `__tests__/board-menu-items.test.ts` fails when a type has no row or a row names a missing type. The nav has no feature-board sub-entries yet (Open item 1).
- Item types: note, file, chat, agent form (`agent-form`), table, record, picklist (`list`), document, task, war room, meeting, workflow run, research, project, flashcard deck (`fc_set`), study kit (`study-kit`, the education "study set"), scope, web page, image, write-up, label, meeting_part, Page (any app page as a tile).
- Every item type passes the remount quiet law (record, table, task, project, meeting, chat fixed 2026-10-04). The one source of which types sleep and which laws each passes is the ledger `__tests__/remount-safety/cases.ts` (enforced by `remount-ledger.test.ts`); never list sleepers in prose here.
- Agent bridge in two requests (`board_items` value, then `board_open_item` / `board_item_act`), 15 `board_*` tools, surface `matrx-user/board` (values `board_title`, `board_items`, `selected_tile`). Gather a topic: `board_find_records` → `board_add_items` → `board_group` (see Agents manage the board). Board comments: the Board's own thread plus one comment door per tile. Tile errors are isolated by an error boundary per tile.
- Note tiles never wait on the notes list for their body (the editor reads it itself; a stalled read says so with Retry). Picklist default tile is 1240 wide so the table's Name column is readable.
- Fixed 2026-10-04 (remount ledger all green, two-tab per-tile merge, placement in rows, phone toolbar, tap-target fixes): unsent chat tile no longer lost on reload; "New board" in the title menu opens the board; two-tab per-tile merge; tile placement in rows; phone toolbar "More tools"; documents no longer render black; file Versions loads in about 2.5 s.
- Opening a saved board never asks for an organization: tiles read the board's own (`items/board-organization.tsx`); only creating something goes through the gate. Right-click inside a multi-selection acts on the selection; Shift/⌘ also work from a click event alone; far-zoom status chips fall back to the tile's saved `basics` (details and open platform-level findings in CHANGELOG 2026-10-05).
- Feature boards mount the same engine: War Room (Board mode), meetings (`UserBoard` over a saved board linked by `settings.meeting_id`), workflow runs (run board).

## Vision — Arman's words

(Verbatim from the retired `docs/handoffs/master-board.md`, written 2026-09-30. Per the docs skill, §5 these also belong in a node `VISION.md`; the owner's instruction put them in this file.)

- "the user's master one and it's got it's own menu item... show all of the supported features as suboptions... drop in anything... If we do it properly, it will eventually be the only ui we ever need... The big key is that you can choose form supported options to drop things into the ui and just get started on them immediately."
- "each item that is added properly declares it's FULL surface values and actions because if the agent can't do the exact same things as on the normal screen, it doen't work well"
- "The 'notes' you added are fake. it's not our real notes ui... Ideally, we give them literally the same ui but if not the same ui, then at least the same core part"
- "it still needs to offer all of the items that are open and the agent should be able to reach them with two requests. The first carries the active surface and a list of all other open items... give the agent enough info to know what that item is, including the name and some basics. If the agent wants to do something with the non-open items, it fiirst requests that item and it gets the state and controls for it."
- On a multi-item ask: "We're working on redoing the website and I have some images here and I have the notes with the color options. Look at what this other agent said and then see if you think for our website the colors I have set in the table make sense and update them for what you think is best."
- "the things on the canvas don't have proper controls for resizing... You have to easily and freely resize"; "scrolling the page DOES NOT WORK if you are hovering over one of these items. We cannot ever have the scroll move the canvas when you're over one of these"; full screen on a chat tile "changed sizes" and he "couldn't get out... you cannot allow that to happen"; "a double click on any node needs to move to it, zoom it in and bring it into focus." "There are a lot more things like that."
- Naming, 2026-10-04: "Let's go with "Board" everywhere and ensure that Sonnet agents go through and completely and 100% replace everything in all docs and the code comments, componens, etc. so there is no confusion."

## Open — the one list

Closed 2026-10-04 (details in CHANGELOG.md): Board as its own menu item with every item type; feature boards publish `board_items`; dormant table says "not loaded yet"; optimistic "New board"; same-tab document sync (`@ai-matrx/realtime` 0.9.0); shared-file saves by id (`POST /files/{id}/versions`, `change_summary` stored); every tile type passes the remount quiet law; lists, scopes, flashcard decks and study kits; the Board's tools stay with a live or closed tile; a fresh inline tool definition replaces the remembered one each turn (aidream `merge.py`); pill guard clip-root rule (design-system 0.61.15); a full type-check of every file this work touched is clean.

1. **The agent reaches for knowledge_search first when a tile is live.** Live two-turn run 2026-10-04 (test@test.com): with a table tile live, turn 1 went `knowledge_search → knowledge_open → apply_surface_write` and landed the right value after approval; with nothing live, turn 2 went through `board_open_item → board_item_act`. The request now leads with the Board's items (`hostLead`, `surface-chain.ts`) and says "never knowledge_search", and the model still prefers its knowledge tools. Next lever: which tools the agent is given while on the Board (agent definition / surface defaults — agents never edit agent definitions; raise with the agent-tools owners).
2. **Camera overshoot on table checkboxes.** On the "Grid Parity Fixture" table, Tab onto a row checkbox past the grid's own scroll edge panned 411 px where the rule predicts about 53 px.
3. **Caret following** is not built for plain `<textarea>`/`<input>` or Monaco.
4. **Item leftovers.** Study kit: a person adds saved aids in the tile only through the link to `/education/kits/new?source=` (the picker is inline in `ManualKitCreator`); the agent sees the 25 most recent candidates, not a search. Scope: no `sleeps` opt-in yet; the new-scope type chooser does not show the organization. Projects carry no archived flag, so the Project picker has no archive reveal. Not agent-writable on a deck, as on its editor: visibility, class, delete, reorder.
5. **Next batch of interactions.** Arman: "There are a lot more things like that" — ask him. A phone swipe from the left edge pans the Board in the browser emulator; a real iOS edge swipe is untested.
6. **Small:** Files has no mobile host for `/files/f`; Page tiles show an embedded page's surface to agents by title only; only the data-tables, notes-editor and documents briefs were chosen with their features in mind.
7. **Composer-chrome leftovers** (UNVERIFIED): the store reachable outside the viewport (Layers as a Properties tab), an insets callback for fit-to-view.
8. **A tile size contract for kinds** (content-ir compact/tile variant with a scaled fallback).
9. **Annotations on any tile** (one overlay generalising the PDF and image annotation layers).
10. **Multiplayer** (Broadcast cursors, opt-in camera follow, presence).
11. **Merged grid knob:** read `data_tables.merged_grid`'s live default (`platform.feature_knob`) and write one line here.
12. **Agent form — which inputs layout is best** (Arman, 2026-10-06: "My guess is that we should use the form option or the one that has them all in one but I'm not sure. There could be an argument for the carrousel one or any of the others as well."). The tile defaults to Form and has a layout switch over all six (Inline, Wizard, Form, Stacked, Guided, Cards) so they can be compared on real agents. Seen 2026-10-06 on Flashcard Topic Deck Composer: Form shows required fields first with the rest folded; Cards shows every field but its Count stepper showed 1, not the agent's default 20; Wizard is one field per step (Next). Form caps its fields to a short scroll box (`max-h-72`), so in a tall tile the later inputs sit below the fold. Decide the default and whether the switch stays.
13. **Agent form leftovers.** An agent can place a past run (`record.place`) but not start a new one for a named agent (`board_add_items` needs an agent id field). "Run again" before sending, then a reload, shows the previous result again (the carried-over values live only in the browser until the run is sent). Comments follow the latest run's conversation, so a previous run's thread stops showing after Run again.

### Agents manage the board — `board_add_items`, `board_find_records` (2026-10-04)

- Fixed 2026-10-06: a titled new note (`{type:"note", new:true, title}`) keeps its title on the tile and the note draft (`meta.label`); "New board" stays busy until the new board is actually open (no second empty board on a slow route change; a cancelled organization pick creates nothing); a task tile with staged (unsaved) edits reads "Unsaved" in its header, as the task's own page stages status/priority/due date behind Save.
- `board_add_items` (batch, max 40): `{type, id}` places an existing record with the type's `record.place` (`BoardItemType.record`, the builder its bring-in picker uses); `{type, new: true}` runs the type's first `startNew` entry when it is a direct `create`, else answers `needs_person` (meeting, workflow run). Placement is UserBoard's one `place()` (dedup `board/plan-placement.ts`: `already_on_board` with the existing tile id, `duplicate` for a repeat in one call); the whole call is ONE undo step (`BoardStore.batch`). Only `UserBoard` passes `itemTypes`/`placeItems`; feature boards (War Room, meeting, run) refuse with a remedy.
- `board_find_records` (`tools/board-records.ts`): types with `record.searchToken` are read from the search projection `platform.search_items` as the person (`tools/search-items.ts`; the index `knowledge_search` reads; all their organizations; trashed rows are not projected) — chat (`conversation`), note, file, document, task, War Room, research, project, flashcard deck, scope. Types with `record.find` read their picker's own list service, name-matched (`items/record-finders.ts`): tables (`data_home_tables`), picklists (`pick_list_index_everywhere`, archived left out), meetings (the meeting picker's read, `readMyMeetings`: hosted or invited, archived left out), workflow runs (`fetchRuns`, `GET /runs`, named by workflow, matched on name + status), study kits (`listKits`; a non-file kit's id is `<sourceType>:<anchorId>`). Data records and meeting notes stay unsearchable (stated in the tool description). Lanes interleave so a cap never drops a type; a failed lane is named in `unsearched`. The asking conversation is never a candidate. Title match only.
- Not findable yet: meetings, workflow runs, study kits, data records, meeting notes (placeable by id where `record.place` exists: meeting, workflow run).
- The tool enums are literals (`BOARD_ADDABLE_ITEM_KEYS`, `BOARD_FINDABLE_ITEM_KEYS` in `tools/board-tools.ts`, so the manifest never imports tile bodies); `__tests__/board-add-items.test.tsx` fails when they and the catalog disagree.
- Live 2026-10-04 (test@test.com, board d64f1203): "I'm working on the Harborview move-out — put everything I have about it on my board and group it." → board_find_records → board_read → board_add_items → board_group: two notes, the table and two Harborview chats landed as real tiles in frame "Harborview Move-Out"; the unrelated note did not.

### The database names (renamed 2026-10-04)

- `projects.boards` (table, `.from("boards")` in `persistence/boardsService.ts`), entity token `board` (`BOARD_TOKEN`, `features/scopes/registry/entityRegistry.ts`, the knobs `access.shown_to_default.board`, `lists.landing_tab.board`, `lists.org_filter.board`).
- `war_rooms.metadata.board_layout` (`BOARD_LAYOUT_KEY` in `features/war-room/components/board/boardLayout.ts`).
- Surface key `matrx-user/board` (`BOARD_SURFACE_NAME`), a row in `ui.ui_surface`; list surface key `boards-browse` (`boards/listConfig.tsx`).
- Temporary: a pass-through view `projects.spatial_boards` keeps clients deployed before the rename working; it is dropped once both repos' new code is live. Never read or write it.
- Never reintroduce the retired names in code, docs or UI: Spatial view, Spatial Board, spatial board, master Board, Spatial, spatial canvas, `spatial_board`, `spatial_layout`.

## Saved boards

`projects.boards` (token `board`, certified, soft delete, versioned; columns
`title`, `description`, `camera`, `nodes`, `edges`, `settings`, `last_opened_at` + the base
contract). The stored shape is `board/document.ts` (parse reports every malformed node; groups and
shapes ride in `nodes` flagged; JSON Canvas 1.0 export). Every board is an ordinary saved record;
rows an older build flagged `settings.home` are plain boards (the flag is data nothing reads; a copy
drops it). Service + hook: `persistence/` (see The Board).

- **Delete is a soft delete, and a board comes back.** `/board`'s Archived filter (`query.archived`
  → `listBoards(archived)`) shows deleted boards; their row offers Restore (`restoreBoard` → Trash's
  `restoreFromTrash` / `entity_undelete`); /trash lists them too (`__tests__/board-trash.test.tsx`).
- **"Add to my board" = the last-opened board.** `getLastOpenedBoardId` / `pickLastOpenedId`: the live, non-meeting board with the newest `last_opened_at` (a never-opened board counts by its last edit). `boards/AddToBoardRedirect.tsx` sends `/board?add=<key>` to `/board/<id>?add=<key>`, where `UserBoard`'s `addKey` effect starts the item; with no board it makes one first. Guard `__tests__/boards-list-front-door.test.tsx`.

- **The saved board is CONTENT only** (`nodes`, `edges`). The camera is each viewer's own view
  (Figma, Miro): kept per person per board in this browser (`persistence/viewerCamera.ts`,
  localStorage `matrx.board.camera:<user>:<board>`, guarded) plus the `#cam=` address. A board opens
  at `#cam=`, else the viewer's last view, else fit-all (an empty board: the row's `camera`). The
  `camera` column is read for old rows and copied by duplicate; nothing writes it.
A meeting's board is the row whose `settings.meeting_id` is that meeting, per person
(`getMeetingBoard`, `useSavedBoard({ meeting })`; created with the meeting's notes); a copy drops
the link (`settingsForCopy`). It is outside the
  version guard's fingerprint (`documentFingerprint`), so a pan in one tab never makes another tab's
  edit a conflict — it did, and the conflict stopped that tab's autosave.
- **Saving is lazy and light.** `UserBoard` reports a BUILDER (`onChange(() => doc)`) on every store
  change; the document is built once, when the debounced write goes out (it was built per pointer
  frame of a drag). A save writes `nodes` + `edges` and reads back only `version`; the new
  fingerprint is computed from what was written.
- **The last edits survive closing the tab.** `visibilitychange` → hidden (the first step of closing
  a tab, with time to spare) and `pagehide` flush at once as a `keepalive` PATCH to the same PostgREST
  row (`keepalivePatch`: the person's own token from `selectAccessToken`, same `version` guard, same
  RLS; a body over 60 KB goes as an ordinary request). Residual: an ordinary save already in flight
  at the instant the page unloads can still be cancelled by the browser.
- **A real content conflict** stops this tab's autosave (writing on would overwrite the newer board):
  the byline reads "Not saved: …" and an error toast stays until "Reload board", which reopens the
  newer version and resumes saving (`__tests__/useSavedBoard.test.tsx`).

## Performance rules (each one measured on the 100-stream stress board)

- **Status is read in leaves.** `useTileStatus` lives in the dot and the overview card; subscribing
  a whole tile re-rendered 100 markdown bodies per progress step.
- **Nothing animates forever at far zoom.** The live dot pulses only at read tier; progress bars step
  (no transition) and use `scaleX`, never `width`.
- **No blur filters** in reveal motion — opacity only.
- **Scroll follow is batched** read-then-write across tiles (`tiles/follow-scroll.ts`).
- **Updates hold while the camera moves** (`isInteracting`): body commits and status ticks wait
  ~120 ms after motion stops, then catch up in one step.
- **One text node per changing label**, updated by `nodeValue` — node insertions trigger the shell's
  global `:has()` restyles (D349).
- `--board-z` lives on an inner element and is written only on a ≥1.5% zoom change.

Measured in this container (headless Chromium, software raster, dev build, 4 vCPU), 112 tiles:
standing still with 100 live streams 58 fps (was 21); panning with 100 live streams 21–24 fps (was
7–8); panning when nothing streams 60 fps; the 12-tile board pans at 60 fps. Re-measure on real
hardware with a production build before tuning further.

## Arrange, far-zoom cards, item status (2026-10-04)

- **Arrange** lives in the right-click menu: Board → Arrange (`BoardMenu` `onArrange`; `/board` passes it). Commands and keys: Tidy up ⌃⌥T · By type ⌃⌥G · Into frames by type · Grid · One row · One column · Align ⌥A/⌥H/⌥D (left/center/right), ⌥W/⌥V/⌥S (top/middle/bottom) · Distribute ⌃⌥H/⌃⌥V. Keys go through `useBoardKeys({ arrange })` → `arrangeCommandForKey` (reads `code`). Pure math: `engine/arrange.ts` (`planArrange`, `arrangeByType`, `boardUnits`); runner: `board/arrange-board.ts` (`runArrange`: one `moveMany` step, frames drawn in the same step, FLIP glide on `--matrx-motion-duration-panel` / `--matrx-motion-ease-panel`, skipped when the token is 0). Frames move as units with the tiles whose centre they hold; "Into frames by type" frames only loose tiles, titled with the plural type name. By-type order = the catalog (Add menu) order, frames first. With 2+ selected a command acts on the selection (`planArrange(…, only)` → `selectionScene`: selected frames carry the tiles inside them), otherwise on the whole board; the menu says which ("Arrange selection (3)" / "Arrange board"). By type packs blocks onto shelves (`columns` cells wide), so single-tile types share rows instead of one tall column.
- **Far-zoom card** (`components/TileFace.tsx` `OverviewCard`, sizes in `components/board-accents.css`): shown at the `overview` tier over the whole card (`data-board-overview`, treated as the header by press and double-click). Accent from `BoardItemType.accent` (`--board-accent-<name>`, 12 hues, light + dark), the type icon + name, title (2 lines), status chip. Sizes are `Npx / --board-z` capped by container units of the card, so text is a fixed screen size while it fits and shrinks with the tile when it does not; an aspect > 3 strip shows the title only. Cost: `contain: strict`, no animation, no extra subscriptions (the status leaf is the only reader).
- **Item status** (`BoardItemType.status`, required): `{ useStatus(source) }` — a hook over Redux the tile's body/`Keep` already fill, selecting primitives, null at rest — or `{ none: "<why>" }`. Hooks: `items/item-status.ts`. Rendered by `StatusChip` (svg tone dot + words; tones neutral/active/attention/success/danger on semantic tokens) in the header at read/glance (`BoardTile` `renderStatus`) and on the far-zoom card. **Agent working:** while `board_open_item` / `board_item_act` / an `apply_surface_write` resolved to a handed item is in flight, the camera store holds `beginAgentWork(id)` and the chip reads "Agent working" (active tone) in place of the item's own status (`BoardTile` `TileStatus` leaf, `useIsAgentWorking`). Not built: an unread-comments count — comments load only when their door opens and no read-state exists, so it is not cheaply known (the door shows its count once loaded).

## Input, focus, gestures

- **Adding places at a readable zoom; Fit stays exact (2026-10-04).** An add (Add menu, Start panel, picker, paste) measures and places as if the view were at 50% (`READABLE_ADD_ZOOM`, `home/place-run.ts`) when the person is zoomed out past that, around the same view centre, then flies the camera there. A tile never lands as a title-card speck: Add → War Room on a 10% board used to leave the room 55 px wide. At 50% or closer an add only pans to reveal, as before. Fit everything (⇧1) is unchanged and exact: all tiles, whatever the zoom. Zoom to selection (⇧2, also in the zoom menu) flies to the selected tile. Guard `__tests__/placement-run.test.ts`.

- **Snapping (`engine/snapping.ts`, `snap-gesture.ts`, `snap-preference.ts`, `SnapGuidesLayer`; 2026-10-04):** *Smart guides* (default ON): a tile drag or resize snaps left/centre/right and top/middle/bottom to nearby tiles within 6 SCREEN px (scale-aware), draws a guide line across the aligned tiles, and snaps to equal spacing (between two tiles, or repeating a neighbouring gap) with bracketed gap marks. Candidates = tiles AND frames (their own rect, title band off) in the viewport plus half a viewport of margin, collected once per gesture, minus everything the gesture moves. *Snap to grid* (default OFF, zoom menu, **⌘' / Ctrl+'** — ⇧G is Layout guides): positions and the moving resize edge round to `GRID_SIZE` = 24 board px; the dot grid shows when this or Layout guides is on, and only where dots are not noise (cell >= 7 screen px). Grid wins over guides for position. **Hold ⌘ / Ctrl / Alt while dragging to move freely** (tldraw / Figma). Shift (aspect lock) resizes are not snapped. Both choices are per viewer (`matrx.board.smartGuides`, `matrx.board.snapToGrid`). The snap runs in the gesture handler, before the store, so a snapped drag is still ONE undo step; guides are one leaf (`SnapGuidesLayer`) subscribed to `store.getSnapOverlay`, so a drag re-renders nothing else.
- **Selection (2026-10-04; Figma / tldraw / Miro; `engine/selection.ts`, camera store `selection`):** shift- or ⌘-click adds/removes a tile or frame; a mouse drag on empty board in the Select tool draws a marquee selecting every tile it touches and every frame it crosses from outside (a marquee started inside a frame selects its tiles; shift-marquee adds); a finger on empty board still pans; ⌘A selects all; Esc clears. `getSelected()` is the LONE selection only, so the live tile stays `focused ?? editing ?? the single selected tile` — with several selected none is live, none is held awake, and `board_items` marks each `selected: true` without full values. Two or more draw ONE box (`SelectionBox`, written from `subscribeItems`, no tile re-render). Dragging any selected tile moves all (`BoardMover.dragMany`, registered by the host: ONE undo step; smart guides snap the group's bounds); a click on a tile in the group without moving narrows to it. Arrows nudge the selection 8 board px (shift ×10; one grid cell with snap to grid), nothing selected = move the view. Delete removes everything selected as one step (`BoardStore.removeMany`); resize stays single-tile (no handles inside a multi-selection).
- **Frames (`BoardFrameView`):** the title strip and the border drag the frame and everything whose centre it holds, plus frames inside it (`groupMoveSet`, one undo step, Esc puts it back); a click without moving flies there. A selected frame has the eight resize handles — resizing moves no tile. Delete removes the frame only; right-click → "Delete with contents" removes it and its tiles (one step).
- **A tile has three states (`BoardTile`, store `editing`):** *idle* → click = *selected* (drag
  from anywhere on it moves it) → double-click, or a press on a control (input, button, link,
  editor) = *interacting* (native input: typing, text selection, "Interacting · Esc" pill). Esc
  steps back one state; the header always drags. While a tile is interacting only Esc reaches the
  board's keys.
- **Frame gestures every item type inherits (`engine/tile-gestures.ts`, drawn by `BoardTile`; a host
  must pass `onResize`):**
  - *Resize:* four edge + four corner handles, a 12px SCREEN hit area at any zoom (world size
    `px / --board-z`), mostly outside the edge so it never covers a scrollbar; min 160×96; Shift keeps
    the aspect ratio (corner: the axis that moved most leads; edge: the other axis scales about its
    centre); left/top handles move the origin. Pointer capture + a page-wide shield portalled to
    `body`, so an iframe or editor in the tile can never steal the drag, even while interacting.
    `useBoard.resizeTile` coalesces a resize into ONE undo step, like a move; `/board` persists it
    through the board document. At the overview tier (a tile a few px on screen) only the SELECTED
    tile shows handles, so a drag there moves instead of resizes (Figma). `onResize` is a REQUIRED prop, so no board can
    forget it: every `useBoard` host passes `board.resizeTile` (/board — which the meeting board now is —, the demo,
    the workflow run board); War Room passes `null` with its reason (its parts are sized by the
    thread layout, which stores positions only). `__tests__/resize-wiring.test.ts` walks every
    `<BoardTile>` in `features/` and fails on a movable tile with no resize decision.
  - *Press (`pressAction`), the pointer twin of `routeWheel`:* a control gets its own press; the
    header always drags; a mouse/pen press on the body of a tile you are not working in selects and
    drags it; a FINGER on a tile's body only selects it and stays native, so the content scrolls
    (the body is `touch-action: pan-x pan-y` under the board's `touch-action: none`). A finger on
    empty space pans the board.
  - *Double-click (`doubleClickAction`):* on the header / chrome (the frame edge — a resize handle —
    counts as chrome) → fly to the tile and make it live
    (select + `fitItem`, the state `board_focus` "fly" produces); on the body of a tile you are NOT
    working in → fly and start interacting (tldraw: double-click enters a shape); inside content you
    ARE working in, or on a control → native (word selection, cell edit). A header press captures the
    pointer, so the browser fires the dblclick at the tile — the rule reads the press's real target.
- **Scrolling (`engine/wheel-input.ts`, knob `WheelMode`, per-viewer):** `auto` (default) — a mouse
  wheel zooms at the cursor, a trackpad swipe pans, a pinch zooms; `zoom`; `pan`. One decision per
  gesture burst so an inertia tail never flips device. Drag empty space / space+drag / middle-drag
  pans. **Over a tile a plain wheel or trackpad scroll NEVER moves the board** (`routeWheel`), whether
  the tile is idle, selected or interacting: content with room to scroll that way scrolls, otherwise
  the event is swallowed so nothing chains out (the card is also `overscroll-contain`). **Pinch and
  ctrl/⌘+wheel zoom the board everywhere, tiles included** (Figma). Menus and popovers opened from a
  tile portal to `body`, outside the board, so the board never hears their wheel.
- **Full screen (`FocusLayer`):** Enter, F, the tile's expand button or the menu → the tile's live
  card portals into the focus layer, which is itself portalled to `body` and fixed to the VIEWPORT
  (`fixed inset-0 h-dvh`, z-50) — never sized from the tile, the camera or the board pane, so nothing
  the content does can move the way out. The exit bar (Close, ←/→ in reading order) is a fixed row
  above the content with a 44px button on phones. **Escape always exits**, even from inside a
  composer or editor, through the shared full-screen layer stack (`pushFullScreenLayer` in
  `features/shell/canvas-chrome/open-layer.ts`, also used by the chat workspace's full screen):
  capture phase, before the content; an open menu, popover or listbox keeps the key; ONE Escape
  leaves only the top layer (the most recently opened — a tile's full screen over the workspace's
  full screen closes first). While any layer is open `<html data-full-screen-layer>` moves top
  toasts below the exit bar (`app/globals.css`, FULL-SCREEN TOAST CLEARANCE). Leaving returns to the exact camera.
- **Throws (`engine/throw.ts`):** a header drag released at ≥ 1.1 px/ms after ≥ 70px travel, on a
  dominant axis. Defaults (`DEFAULT_THROW_ACTIONS`, a knob): → park on the shelf · ↑ save to Notes
  and close · ↓ delete from the board after a consequence-naming confirm · ← unassigned. The action
  is named on the tile BEFORE release; every result toasts an Undo.
- **Right-click (`BoardMenu`):** the ONE v3 menu, one per board; the clicked tile's actions
  come first (`primary`), then Board (fit, 100%, Scrolling, Parked).
- **Keys:** shift+1 fit all · shift+2 fit selection · shift+0 100% · +/- zoom · arrows nudge the
  selection (shift ×10; nothing selected: the view) · ⌘A select all · esc leaves focus, then deselects.
- **Board model (`board/board-store.ts`, hooks in `board/useBoard.ts`):** tiles, positions, shelf, frames, shapes, connections, one
  undo stack, remove-with-undo, `moveMany` (an arrangement = one step), and `addTile` with
  auto-placement in the nearest free space clear of tiles AND frames (`engine/placement.ts`;
  `within` lets it join one frame; `flow` fills a block in reading order) — the one path gestures,
  the menu and agents change a board through. Operations read a live snapshot (`read()`), so
  commands issued in one tick see each other before React re-renders. Changes made inside
  `runAs("agent", fn)` are the agent's: ⌘Z still walks the one shared stack, and
  `undoActor("agent")` reverts only the agent's latest change, record by record, keeping (and
  naming) anything the person changed since.
- **Placement on `/board` (`home/place-run.ts`):** a run of adds (Add menu, Start panel, picker,
  paste) fills the view in reading order — the first centred, then across the row, then the next row
  down — and the camera only pans (never zooms) when a new tile is off screen. A pan between adds
  starts a new run; a drop places at the drop point. Flying to each new tile made 15 adds a
  7,000-unit diagonal staircase (the next search started on the last tile).

## Agent tools — the board is a surface

Every host wraps its board in **`components/BoardSurface.tsx`**: it mounts the
`matrx-user/board` surface runtime (values `board_title`, `board_items`, `selected_tile`)
and registers the board's client tools, so ANY agent running while a board is on screen (the chat
beside it, a shortcut, a mandate) receives them automatically (`listLiveSurfaceClientTools` →
tool injection; no per-agent arming, no aidream change).

**THE BRIDGE — every item in two requests** (`tools/item-surfaces.ts`). Only the LIVE tile
(selected, worked in or focused) registers its feature surface globally (`SurfaceActivity`; the
one-live-registration law). Every tile ALSO registers into its own **capture**
(`<SurfaceActivity capture>`, `createSurfaceCapture` — features/surfaces FEATURE.md), live or
dormant; the host keeps them in an `ItemSurfaceIndex` (`BoardToolHost.itemSurfaces`).
- **Request one — `board_items`**, on every turn: each item's id, title, kind, surface, `live`, and
  for a dormant item its **basics** (`surfaceBrief`: the manifest's `briefValues` in order, projected
  small), plus one line `read_in_full`: `board_open_item(id)` reads any item. **Fair share**: each
  item with basics gets `BOARD_ITEMS_BRIEF_BUDGET_CHARS (8000) / count` characters, between
  `ITEM_BASICS_FLOOR_CHARS` (70: its name plus one fact, never zero) and `ITEM_BASICS_CEILING_CHARS`
  (1200: four values of 160 characters on a small board). The share sets how many values (4 → 3 → 2)
  and how long their text is (160 → 100 → 60 → 30, shortened further to fit); `limits` states the
  share in force. The first 80 items (`BOARD_ITEMS_MAX`) are listed in full; up to 300 more are a
  compact `more_items` tail (id + title), so nothing on the board is invisible.
- **Selected = full.** The live tile is `focused ?? editing ?? selected` (`useIsLiveTile`), the one
  tile registered globally, so with nothing else going on the selected tile IS live and its full
  surface is a chain level. When the person works in or focuses another tile, the selected tile is
  dormant: its row is marked `selected` and carries `full_values` (every declared value, capped at
  `SELECTED_FULL_MAX_CHARS`) instead of basics. `BoardSurface` marks exactly one row `live` (it used
  to mark the selected, worked-in and focused tiles all live, so a dormant selected tile read "its
  full surface is in your context" when it was not).
- **Always inline, every item known (Arman 2026-10-04).** "The agent should instantly know the basics of
  what I have on my board and if I have one selected, then it should have the full data for that one."
  `board_items` declares `inlineUpTo: 24_000` (= `BOARD_ITEMS_INLINE_CHARS`; the server's default
  inlines only values under 200 chars, so before this the whole list was deferred behind a lookup;
  `contextBudgetApproval` records the ruling) and `boardItemsOverview` never outgrows it: a board too
  big sheds the compact tail, then the non-live selected tile's full values (12,000 → 6,000 → 3,000),
  then the basics budget, then listed items. **Last-known basics** ride in the saved board per node
  (`BoardNode.basics = {values, at, stale?}`): `UserBoard` samples every awake tile's brief every
  `ITEM_BASICS_SAMPLE_MS` (10 s, tab visible) with `sampleItemBasics`, which returns only CHANGED
  basics (never a write loop), written `history: false` (undo never sees them) through the debounced
  autosave. A tile asleep, not loaded, or never mounted is listed with those basics fitted to its
  share (`fitStoredBasics`) plus `basics_at`; a tile never awake anywhere carries what the add knew
  (`{type, name}`, `basics_stale: true`). Two tabs: a basics-only change never overrides the other
  tab's move and is never a conflict; the later sample wins (`board/merge.ts`). Guard:
  `__tests__/board-items-always-inline.test.ts`.
  **Tables and picklists** (`matrx-user/data-tables`): their brief is `table_name`, `brief_columns`
  (header names), `row_count`, `brief_first_rows` (first 1-3 rows as one short line) — text on purpose,
  because a brief turns a list into `{ count }`. A table that has not drawn still offers name + columns
  (store reads, no row count) as stale basics until the grid loads. Guard: `__tests__/table-tile-basics.test.tsx`.
- **Request two, same turn — `board_open_item(id)`**: the item's declared values (with descriptions,
  capped) and controls — write-target lines from `describeAgentWritableTargets` (the injected
  `apply_surface_write` wording) and client tools with schemas — and it selects the item (a parked
  one comes back). The item is held awake for the call (`holdAwake`, released ~2 s after). **`board_item_act(id, target+value | tool+input)`** runs through the canonical
  `applySurfaceWrite` / `executeSurfaceClientTool` with `source: capture` and the call's
  `agentWrite` (`SurfaceToolCall`): same type check, anchored patch, value contract, `validate`,
  apply policy (ask → this call's approval card) and `surfaceWriteToolOutput` envelope as on the page.
- A host without `itemSurfaces` (War Room, workflow boards) lists identity only.
- **A live tile is introduced as one item of the Board.** When the stamped surface is mounted inside a host that declares `SurfaceManifest.hostLead`, `buildSurfaceChain` puts that sentence on the host level's first value (the `board_items` list rides in the same level): the agent reads the tile's surface, then "this is one item on the person's Board", then every item and how to reach it (`board_open_item` → `board_item_act`). Guard: `surface-chain.test.tsx`.
- **The person's view and selection are theirs while they work.** When a tile is interacting or full
  screen, no tool moves the camera, selects, or ends their typing: `board_open_item` opens without
  selecting (`live: false`), `board_add_tile` does not select, `board_focus` refuses with the remedy.
  Every tool change runs as the agent (`runAs`), and `board_undo` takes back only the agent's own
  latest change (`__tests__/agent-actor.test.tsx`).

| Piece | File |
|---|---|
| Tool declarations: `board_read`, `board_add_tile` (note / markdown / text / html / image), `board_update_tile`, `board_remove_tile`, `board_move_tiles`, `board_arrange` (grid / tidy / row / column / align / distribute), `board_group` (named frame), `board_connect`, `board_focus`, `board_open_item`, `board_item_act`, `board_park`, `board_undo` | `tools/board-tools.ts` (carried by `features/surfaces/manifests/board.manifest.ts`) |
| Handlers — host-agnostic, drive `useBoard` + the store; errors come back as `{ok:false, error}` with a remedy; remove toasts an Undo; adding never moves the camera | `tools/useBoardAgentTools.ts` |
| The bridge: per-tile capture index, `board_items` overview, open / act on any item | `tools/item-surfaces.ts` |
| Pure layout math | `engine/arrange.ts` |

A host supplies a `BoardToolHost`: `board` (a `BoardToolTarget` — the NARROW interface the
handlers call; `Board<T>` from `useBoard` satisfies it as-is), `createTile(id, input, size)` and
optional `editTile` for the kinds it can hold (answer a failure for the rest; an empty patch means
the host wrote the content into its own record), and `describe(tile)` for `board_read`. A host with
its own layout model supplies an adapter: `updateTile` / `addFrame` / `connect` / `undo` are
optional (absent = refused with `refusals[...]`, which names the remedy), `moveMany` may return a
failure (nothing moves), `checkArrange` refuses an arrangement that would break the host's layout,
and `read().removed` lists tiles off the board that `board_park parked:false` restores.
`board_focus` on a parked/removed tile restores it and moves the camera once it has rendered.
Markdown written by an agent renders through the stream pipeline (`tiles/MarkdownTileBody.tsx`,
an instant `ReplayStream` → `StreamTileBody`), never a second renderer; an agent's note is a real
Note in the notes core (`items/NoteItemBody.tsx`; its `text` is the note's seed while no note exists
yet, and a real note's text changes through `note_content`). Wired: the demo; `/board` and the meeting board (which renders `UserBoard` itself); the workflow run board (`features/workflow-runtime/components/board/WorkflowRunBoardView.tsx`
— real Note / markdown / text / html / image beside the steps; a step refuses content edits, and
`describe` gives its family + declared kind and live status). Both render `board.frames` and
`board.connections`; the War Room board (`features/war-room/components/board/roomBoardAgent.ts`, an
adapter over its own `board_layout` model — parts are tiles, threads are frames; move / arrange
within one thread / park / remove / focus work and persist, `text` on a Notes part writes the
thread's note, add / group / connect / undo / rename / resize refuse with the remedy; see the War
Room FEATURE.md Board section).

## The Board (`/board`) — a person's own canvas, the main way in

`/board` is the boards list (the canonical list shell, recents first); `/board/<id>` opens one board
(canvas chrome — the header steps aside); `/board/all` redirects to `/board`. The nav item "Board" lists Boards and one "Add to your board" row per item type
(`/board?add=<key>`, guard `__tests__/board-menu-items.test.ts`). The feature boards (War Room, Meetings,
Workflow runs) are views inside their features, not nav entries yet (Open item 1).

| Piece | File |
|---|---|
| Page: the ONE chat-beside-a-canvas layout (`ChatCanvasWorkspace`, `../aidream/apps/shared/chat/src/canvas/workspace`) with the saved board as canvas; title menu Rename / New board / Boards; byline shows save state | `home/BoardPage.tsx`, `app/(core)/board/**` |
| The board: placement, Add menu, Start panel (empty board), drop + paste, tools, shelf, layers, agent tools host | `home/UserBoard.tsx`, `home/AddMenu.tsx` |
| What a paste/drop of text becomes (a link → web page / image, other text → a new Note) | `home/board-intake.ts` |
| Saving: `useSavedBoard({boardId} \| {meeting})` — debounced autosave (`AUTOSAVE_DELAY_MS`) of a lazily built document, flush on unmount, keepalive flush on hide / pagehide; the viewer's camera via `saveCamera` (see Saved boards). `saveBoardDocument(id, doc, { expectedVersion, baseFingerprint })` is version-guarded (`guardedUpdate`): a version moved only by a rename or the opened stamp retries; a document changed elsewhere is a `conflict` the person is told about | `persistence/` |
| The boards list (`/board`) and the add-to-last-board redirect | `boards/`, `app/(core)/board/page.tsx` |

**Item types — how a feature gets onto every board.** `items/types.ts` is the contract: a
`BoardItemType` says how to start a new one (`startNew`, synchronous — the person starts at once),
how to bring in an existing one (`bringIn.Picker`), and its tile `Body`, which is ALWAYS the
feature's canonical component. Register it once in `items/catalog.ts` (via `work-items.tsx`,
`feature-items.tsx` or `content-items.tsx`) and the Add menu, Start panel, drop, paste and the
agent tools of every board offer it. A tile saves only a REFERENCE (`NodeSource`, usually
`{ kind: "entity", entity, id }`; `id` null until the record exists, `meta.seed` for pasted text).
A saved tile whose type is not registered renders an honest stand-in (`home/UnavailableItemBody.tsx`)
and is kept. Tile bodies are STATIC imports inside the page's one `ssr:false` edge (`BoardPage` →
`UserBoard`) — never `dynamic()` a body (code-splitting FRAGMENTATION LAW).

- **The chat beside the board** is the shell's (`ShellChatDock`, the one chat on every page), showing
  this board's own conversation (`shellChatHome`: `?chat=`, per-board cookie, open by default); the board
  publishes its own surface (values + `board_*` tools), so no page-level snapshot is passed.
- **A chat tile is /chat's conversation**: `CanvasChatColumn` (the one chat column, compact composer, agent
  switch) under `ChatConversationSurface` — the `matrx-user/chat` surface `/chat` mounts, scoped to the
  tile's conversation, so the chat beside the board reads what the tile's agent said (through the surface
  chain) and can send into it. A saved tile reopens through the canonical resume sequence, so a turn that
  was mid-run at reload reattaches. Add menu: "Chat" and "Chat with an agent" (the one agent picker).
- **An agent form tile runs an agent with no chat display** (`items/AgentFormItemBody.tsx`, Arman
  2026-10-06): the agent's inputs in the composer's FORM style (`showFreeformInput` off — variables and one
  Run; an agent with no inputs keeps its text box), then the reply through `AgentAssistantMessage`, so a
  `__kind` reply renders as its shape. Same conversation hook, `matrx-user/chat` surface, status and Keep
  as the chat tile. Each run is its own conversation; the tile saves the latest (`id`), the agent
  (`meta.agentId`) and the chosen inputs layout (`meta.inputStyle`, default `form`). "Run again" starts a
  fresh run and carries the values over; the previous run stays saved until the new one is sent. Add menu: "Agent form" (the one agent picker).
- **`startNew` takes one entry or several** (`StartNewEntry`: `create` for an instant start, or `Picker` for
  a start that needs one choice first); `startNewEntries(type)` lists them for the Add menu and Start panel.
- **A note tile is the notes core**: `items/NoteItemBody.tsx` → `NoteWorkspace` (features/notes) in
  its own notes instance `board-note:<tileId>` — the /notes modes, outline / versions / clean-up, the
  note chip (rename, mic, "…" menu), `NoteContentEditor` (which mounts `matrx-user/notes` itself, so
  the item declares `surface: { name }` with no `Host`), metadata bar, save strip, version history.
  Lifecycle (`noteTilePlan`, `items/work-sources.ts`): a new tile starts a client-only draft exactly
  as /notes "New note" (Draft folder, organization via `useNewNoteOrganization`, no row until the
  first words; the tile saves `meta.draft` and restarts the draft under the same id after a reload);
  text from a paste or `board_add_tile` becomes a note at once through `NotesAPI.create`. The demo
  board and the workflow run board render the same body inside `SurfaceActivity`. The board's Text
  tool label is `tiles/TextTileBody.tsx`.
- **Feature tiles are the feature's page body, with its surface** (`items/feature-items.tsx`). Each body
  mounts its surface through the SAME host the feature's page uses, so no feature item declares a
  `Host`: Task → `TaskEditor` (`TaskEditorBody` mounts `matrx-user/tasks`); War Room → the room's
  `StageView` under `RoomViewProvider` + `WarRoomSurfaceHost` (`matrx-user/war-room`; the tile
  holds a ref-counted view of the room — `useWarRoomView`, read and "opened" once per session — and
  never changes the active room); Research →
  `DocumentViewer` under `TopicProvider` + `ResearchTopicSurfaceHost`; Project →
  `ProjectRecordWorkspace chrome="embedded"` (the whole project workspace + `matrx-user/projects`);
  Meeting → `MeetingDetail chrome="embedded"` (sections and actions in a strip; it mounts
  `MeetingSurfaceHost`, `matrx-user/meeting`); Workflow run → `RunStage` under
  `WorkflowRunSurfaceHost` (`matrx-user/workflow-run`).
- **A document tile is `/documents/[id]`'s own component** (`items/document-items.tsx`, key `udt_document`):
  `DocumentRecord` (features/data-tables) — rename, Copy reference, Share, the Rulebook notice, the Univer
  editor with its save status, snapshot and History — which mounts `matrx-user/documents` itself, so the
  item declares `surface: { name }` with no `Host`. An agent reads and writes the name, the description AND
  the body text (`document_body_text` / `document_body`, applied through Univer's command service). "New
  document" places a draft tile that creates the document only on its Create click (org gate +
  `createDocument`, `items/DocumentDraftBody.tsx`); bring in is `DocumentsResourcePicker`; the older
  `{ kind: "document" }` source renders through the same item and is saved in the entity form.
- **Meeting notes are one part of one meeting** (`items/meeting-items.tsx`, key `meeting_part`,
  `meta.part` = transcript / notes / decisions / actions / summary; `recordKeyOf` keys a part as
  `meeting_part:<meeting>#<part>`, so all five sit on a board once each): the room's live AI seam
  while this tab is in that meeting, its durable record elsewhere (action items through the Record
  tab's `ActionItemsSection`); surface `matrx-user/meeting` via `MeetingSurfaceHost`
  (`useMeetingById` shares one read per meeting). The meeting board (`features/meet`) IS `UserBoard`
  over a saved board linked to the meeting and opens on these five in a "Meeting notes" frame.
- **Down-throw and Delete take a tile off the board** ("remove"): the record lives on where it lives.

## Neighbours that own their tile behaviour

`features/surfaces/FEATURE.md` (`SurfaceActivity`, captures) · `../aidream/apps/shared/chat/src/canvas/workspace/FEATURE.md` (the chat-beside-a-canvas layout) · `features/shell/FEATURE.md` (nav, chrome, floating clearance) · `features/war-room/FEATURE.md` · `features/meet/FEATURE.md` · `features/workflow-runtime/FEATURE.md` · `features/notes/FEATURE.md` · `features/data-tables/FEATURE.md`. Cross-repo node (pointer only): `common-docs/systems/board/boards/FEATURE.md`; vocabulary row: `common-docs/systems/platform/vocabulary/FEATURE.md`. Status handoff: `docs/handoffs/board.md`. Adding an item type: `.claude/skills/board-items/SKILL.md`. History: `CHANGELOG.md`.
