# FEATURE.md — Board (`features/board`)

## Status — what is live at /board (2026-10-04)

- Routes: `/board` (the person's own board in the active organization), `/board/<id>` (any of their boards), `/board/all` (the list: open, rename, duplicate, delete; deleted boards restorable, Archived filter). Saved boards live in `projects.boards`.
- Board is its own Workspace menu item: My board, All boards, and one "Add to your board" row per item type (`/board?add=<item key>` starts that type on the person's board). `__tests__/board-menu-items.test.ts` fails when a type has no row or a row names a missing type. The nav has no feature-board sub-entries yet (Open item 1).
- Item types: note, file, chat, table, record, picklist (`list`), document, task, war room, meeting, workflow run, research, project, flashcard deck (`fc_set`), study kit (`study-kit`, the education "study set"), scope, web page, image, write-up, label, meeting_part, Page (any app page as a tile).
- Every item type passes the remount quiet law (record, table, task, project, meeting, chat fixed 2026-10-04). The one source of which types sleep and which laws each passes is the ledger `__tests__/remount-safety/cases.ts` (enforced by `remount-ledger.test.ts`); never list sleepers in prose here.
- Agent bridge in two requests (`board_items` value, then `board_open_item` / `board_item_act`), 13 `board_*` tools, surface `matrx-user/board` (values `board_title`, `board_items`, `selected_tile`). Board comments: the Board's own thread plus one comment door per tile. Tile errors are isolated by an error boundary per tile.
- Note tiles never wait on the notes list for their body (the editor reads it itself; a stalled read says so with Retry). Picklist default tile is 1240 wide so the table's Name column is readable.
- Fixed 2026-10-04 (remount ledger all green, two-tab per-tile merge, placement in rows, phone toolbar, tap-target fixes): unsent chat tile no longer lost on reload; "New board" in the title menu opens the board; two-tab per-tile merge; tile placement in rows; phone toolbar "More tools"; documents no longer render black; file Versions loads in about 2.5 s.
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

1. **Feature boards as Board menu sub-options.** Vision: the Board has its own menu item with each feature's board (War Room, Meetings, Workflow runs) as sub-options. Today the nav has only "My board" and "All boards"; the feature boards are views inside their features. Build gap, not a doc fix.
2. **Feature boards and the bridge (done 2026-10-04, with limits).** The meeting board is `UserBoard` and already had it. The War Room board (each part tile carries its thread's `matrx-user/war-room-thread` surface, `RoomBoardView.tsx`) and the workflow-run board (its Notes tiles carry `matrx-user/notes`, `WorkflowRunBoardView.tsx`) now pass `itemSurfaces` and wrap tile bodies in `TileSurfaceCapture`. A workflow STEP tile has no surface of its own (its data is on the run's `matrx-user/workflow-run` surface), so it is listed with identity only, by design. Part tiles of one thread share that thread's surface, so their basics repeat. Not browser-checked (agent chat is out of that lane).
3. **Dormant table says "not loaded yet" (done 2026-10-04).** A table whose grid has not drawn publishes `not_loaded_yet: true` and no `row_count` / `is_read_only` (`RecordStoreTableSurface`, `gridHasLoaded`); `board_open_item` says so in words. Guard `__tests__/dormant-table-not-loaded.test.tsx`.
3a. **"New board" is optimistic (done 2026-10-04).** The id is minted in the browser (`beginBoardCreate`, `persistence/boardsService.ts`), the route opens at once, and `useSavedBoard` renders the empty board from the pending entry while the insert lands; a failed insert shows Try again. On a cold dev server the first `/board/<id>` open still waits for Next to compile the route (13.4 s measured); production has no compile.
4. **Same-tab document sync.** Two views of one document in one tab (a Board tile plus a `/documents` page or canvas tab) do not Yjs-sync: `@ai-matrx/realtime` gives every holder in a tab the same client id and suppresses echoes (`SupabaseYjsProvider`). Fix in the package (`aidream/apps/shared/realtime`, local fan-out between holders of one topic), never on the Board. UNVERIFIABLE from code whether it is still open after the one-working-copy-per-tab change; one two-view check proves it.
5. **Saving a file another person owns and shared with edit rights is refused** (the files service resolves the upload path under the uploader). Real fix: a replace-by-id endpoint in aidream. `change_summary` sent with a file save is stored as null.
6. **Camera overshoot on table checkboxes.** On the "Grid Parity Fixture" table, Tab onto a row checkbox past the grid's own scroll edge panned 411 px where the rule predicts about 53 px (suspected: the settle-window re-check measuring mid-way through the grid's scroll).
7. **Caret following** is not built for plain `<textarea>`/`<input>` or Monaco.
8. **Lists, scopes, education: built 2026-10-04** (`items/list-items.tsx`, `scope-items.tsx`, `education-items.tsx`). Open from it: (a) DONE 2026-10-04: the deck (`fc_set`) and study kit (`study-kit`) tiles keep their reads in Redux (`useStoreRead`: deck, mastery, kit, progress, access, consent verdict, lineage) and sleep; the ledger rows are green. Gap: the kit remount case seeds an empty kit (no aids), so the progress read is proven by the shared hook, not by that case. (b) DONE 2026-10-04: the deck surface declares the Edit page's five write targets (name, topic, description, card content, matching card, add cards, delete card; ask first; handlers shared with the Edit page in `deckWriteHandlers.ts`; a view-only person is refused). Not agent-writable on the deck, as on the editor: who can see it, the class, deleting the deck, reordering. Study kit hub: rename, delete, remove-aid and (DONE 2026-10-04) add-saved-aids are wired for the agent: `KitHub` publishes `kit_member_candidates` (up to 25 recent saved aids not already in the kit, ids + names + kinds) and handles `add_kit_members` (ask first) through `parseKitMemberAdds` and `createManualKit`, the same write the add page runs. Still open: a person adds aids in the tile only through the link to `/education/kits/new?source=` (the picker lives inline in `ManualKitCreator`, not extracted); the agent sees only the 25 most recent candidates, not a search. (c) The Scope tile's `matrx-user/scope-detail` surface is new (name, description, context item values; entity + ask); no `sleeps` opt-in yet (core and quiet cases pass; not checked with typed work in a browser). (d) The picklist tile uses the table page's `matrx-user/data-tables` surface (what `/lists/<id>` mounts); lists' `add_list_items` targets belong to the List Manager window. (e) Scope type chooser in a new scope tile does not show the organization. (f) Study kit start-new is the manual kit creator (needs a saved source); the Start-from-material flow is `/education/start`.
9. **Agent multi-item run and the approval-card tool trace — untested, blocked.** Includes the open question: an agent once wrote a table row through a server-side records write tool with no approval card, then raised the Board's card for the same write. Trace which tool it was and raise it with the agent-tools owners (`common-docs/systems/agents/agent-tools/STATE.md`); agents never edit agent definitions themselves. UNVERIFIABLE without one live reproduction.
10. **A full `pnpm type-check` has never run** on this work (a cloud container lacks the memory); a scoped check over every file touched was clean.
11. **Next batch of interactions.** Arman: "There are a lot more things like that" — ask him; nothing else is known. A phone swipe from the left edge (x about 30) does not pan the Board (probably the workspace's edge-swipe claiming it; decide which wins). Resize on the demo and workflow-run boards is proven by the required prop and parse test, not in a browser.
12. **Record tile:** `RecordsProvider` memoizes its client on its config; `config.realtime` comes from `createRecordsRealtimePort(org)` in `useUnifiedTable` and relies on the React Compiler memoizing it, otherwise the record surface re-reads row actions every render.
13. **Small:** Notes tile has no comments of its own beyond the Board door (matches `/notes`) and mode labels collapse to icons below a 26rem tile; Files has no mobile host for `/files/f`; only the data-tables, notes-editor and documents briefs were chosen with their features in mind, review the other seven when touching those surfaces; Page tiles show an embedded page's surface to agents by title only; `check:reserved-icons` was failing on `WorkflowRunBoardView.tsx` (`docs/ui-drift-audit.md`).
14. **Composer-chrome leftovers** (from the ai-matrx-composer MAP, UNVERIFIED whether still true): the store reachable outside the viewport (Layers as a Properties tab), an insets callback for fit-to-view, ToolBar/ZoomMenu overlap at 390 px.
15. **A tile size contract for kinds.** Kinds are tuned to the 720 px chat column; add an optional compact/tile variant to the kind component contract (content-ir) with a scaled fallback.
16. **Annotations on any tile.** Generalise the PDF annotation layer and the image annotation window into one overlay; text anchors keep the rich-document sidecar.
17. **Multiplayer.** Supabase Realtime Broadcast for cursors, camera follow (opt-in, FigJam Spotlight style, never a yanked viewport) and presence; Postgres Changes only for persisted board edits.
18. **Conflicting statement to settle:** the retired handoff said the custom-data merged grid is "on platform-wide"; the old change log said `data_tables.merged_grid` defaults off until merge step 8. UNVERIFIABLE here: read the knob's live default (`platform.feature_knob`) and write one line.
19. **Testing on the nightly database copy** is impossible in a Claude cloud container (needs `../aidream`, a clone-wired server on :8200 and a password on Arman's Mac); walks there use ordinary UI records on live, all deleted or archived after.

20. **Final-walk tile defects (2026-10-04).** Fixed: narrow ProInput click-steal (project task-add), trashed projects in the Project picker (nav-tree RPC), archived picklists in the picker (`RecordList isArchived`), deck and kit titles following renames. Open: (a) the pill guard (design-system `pill-guard`, `overflowPast`) measures a pill in a tile panned off screen against the BROWSER viewport and flags it ("overflows the viewport by 81px"); the Board world clips, so the fix is a clip-root rule in the package (`aidream/apps/shared/design-system/src/pill-guard.ts`), released and adopted, never silenced here. (b) In a Picklist tile the canonical grid sizes the Name column near 96 px beside the pinned Actions column, so a typed row name shows truncated; the page shows it in full. Column sizing is the table package's. (c) Projects carry no archived flag (lifecycle `status`), so the Project picker has no archive reveal.

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
shapes ride in `nodes` flagged; JSON Canvas 1.0 export). The home board is the row whose
`settings.home` is true, per person per organization. Service + hook: `persistence/` (see The Board).

- **Delete is a soft delete, and a board comes back.** `/board/all`'s Archived filter (`query.archived`
  → `listBoards(archived)`) shows deleted boards; their row offers Restore (`restoreBoard` → Trash's
  `restoreFromTrash` / `entity_undelete`); /trash lists them too. ONE home: every reader takes the
  oldest live `settings.home` row (`pickHomeId`, same as `getHomeBoard`), and a deleted home restored
  while another home is live loses its flag before it comes back (`__tests__/board-trash.test.tsx`).

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

## Input, focus, gestures

- **Adding places at a readable zoom; Fit stays exact (2026-10-04).** An add (Add menu, Start panel, picker, paste) measures and places as if the view were at 50% (`READABLE_ADD_ZOOM`, `home/place-run.ts`) when the person is zoomed out past that, around the same view centre, then flies the camera there. A tile never lands as a title-card speck: Add → War Room on a 10% board used to leave the room 55 px wide. At 50% or closer an add only pans to reveal, as before. Fit everything (⇧1) is unchanged and exact: all tiles, whatever the zoom. Zoom to selection (⇧2, also in the zoom menu) flies to the selected tile. Guard `__tests__/placement-run.test.ts`.

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
- **Keys:** shift+1 fit all · shift+2 fit selection · shift+0 100% · +/- zoom · arrows nudge · esc
  leaves focus, then deselects.
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
  for a dormant item its **basics** (`surfaceBrief`: the manifest's `briefValues`, projected small),
  bounded (`BOARD_ITEMS_MAX`, `BOARD_ITEMS_BRIEF_BUDGET_CHARS`, stated in `limits`). The live item
  carries none: its full surface already reaches the agent as a surface-chain level.
- **Request two, same turn — `board_open_item(id)`**: the item's declared values (with descriptions,
  capped) and controls — write-target lines from `describeAgentWritableTargets` (the injected
  `apply_surface_write` wording) and client tools with schemas — and it selects the item (a parked
  one comes back). The item is held awake for the call (`holdAwake`, released ~2 s after). **`board_item_act(id, target+value | tool+input)`** runs through the canonical
  `applySurfaceWrite` / `executeSurfaceClientTool` with `source: capture` and the call's
  `agentWrite` (`SurfaceToolCall`): same type check, anchored patch, value contract, `validate`,
  apply policy (ask → this call's approval card) and `surfaceWriteToolOutput` envelope as on the page.
- A host without `itemSurfaces` (War Room, workflow boards) lists identity only.
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

`/board` is the person's home board in the active organization; `/board/<id>` any of their boards;
`/board/all` manages them (open, rename, duplicate, delete). The nav item "Board" lists My board, All boards and one "Add to your board" row per item type
(`/board?add=<key>`, guard `__tests__/board-menu-items.test.ts`). The feature boards (War Room, Meetings,
Workflow runs) are views inside their features, not nav entries yet (Open item 1).

| Piece | File |
|---|---|
| Page: the ONE chat-beside-a-canvas layout (`ChatCanvasWorkspace`, `packages/chat/src/canvas/workspace`) with the saved board as canvas; title menu Rename / New board / All boards; byline shows save state | `home/BoardPage.tsx`, `app/(core)/board/**` |
| The board: placement, Add menu, Start panel (empty board), drop + paste, tools, shelf, layers, agent tools host | `home/UserBoard.tsx`, `home/AddMenu.tsx` |
| What a paste/drop of text becomes (a link → web page / image, other text → a new Note) | `home/board-intake.ts` |
| Saving: `useSavedBoard({home:true} \| {boardId})` — debounced autosave (`AUTOSAVE_DELAY_MS`) of a lazily built document, flush on unmount, keepalive flush on hide / pagehide; the viewer's camera via `saveCamera` (see Saved boards). `saveBoardDocument(id, doc, { expectedVersion, baseFingerprint })` is version-guarded (`guardedUpdate`): a version moved only by a rename or the opened stamp retries; a document changed elsewhere is a `conflict` the person is told about | `persistence/` |
| Manage page | `boards/`, `app/(core)/board/all` |

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

- **The chat beside the board** is `ChatCanvasWorkspace`'s; the board publishes its own surface
  (the Board surface: values + `board_*` tools), so no page-level snapshot is passed.
- **A chat tile is /chat's conversation**: `CanvasChatColumn` (the one chat column, compact composer, agent
  switch) under `ChatConversationSurface` — the `matrx-user/chat` surface `/chat` mounts, scoped to the
  tile's conversation, so the chat beside the board reads what the tile's agent said (through the surface
  chain) and can send into it. A saved tile reopens through the canonical resume sequence, so a turn that
  was mid-run at reload reattaches. Add menu: "Chat" and "Chat with an agent" (the one agent picker).
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

`features/surfaces/FEATURE.md` (`SurfaceActivity`, captures) · `packages/chat/src/canvas/workspace/FEATURE.md` (the chat-beside-a-canvas layout) · `features/shell/FEATURE.md` (nav, chrome, floating clearance) · `features/war-room/FEATURE.md` · `features/meet/FEATURE.md` · `features/workflow-runtime/FEATURE.md` · `features/notes/FEATURE.md` · `features/data-tables/FEATURE.md`. Cross-repo node (pointer only): `common-docs/systems/workspace/boards/FEATURE.md`; vocabulary row: `common-docs/systems/platform/vocabulary/FEATURE.md`. Status handoff: `docs/handoffs/board.md`. Adding an item type: `.claude/skills/board-items/SKILL.md`. History: `CHANGELOG.md`.
