# CHANGELOG — Board (`features/board`)

History moved out of FEATURE.md; each rule it taught lives in FEATURE.md. Older entries use the retired names where the surface key or table is meant.

- 2026-10-04 — New board opens instantly; the Start panel clears the toolbar. "New board" mints the id in the browser (`beginBoardCreate`), navigates to `/board/<id>` at once and inserts in the background with an explicit `organization_id`; the page renders the empty board from the pending entry (`getPendingCreate`), a first save waits for the row, and a failed insert is the page's "could not be created" state with Try again (never a silent empty board). Browser on the shared preview: warm route change 0.3 s after the click, one board on a double click, row persisted on reload. Start panel: its frame now reserves the chrome band (72 px top, 56 px bottom, 160 px bottom between 768 and 1104 px for the minimap) and the panel scrolls inside what is left; measured 0 overlaps with the Add toolbar, zoom bar and minimap at 375, 800 and 1280 px. Guards: `__tests__/optimistic-board.test.tsx`, `create-board.test.tsx`, `start-panel-layout.test.tsx`.
- 2026-10-04 — Board fixes. Adding while zoomed out past 50% places and reveals at 50% (`READABLE_ADD_ZOOM`): Add → War Room on a Fit-sized board no longer leaves a 55 px speck (browser: 10% to 50%, room selected and readable); "Zoom to selection" joins the zoom menu. A dormant table says not loaded yet instead of 0 rows / read-only. War Room and workflow-run boards publish the two-request bridge (`TileSurfaceCapture`). New board measured: slow only on the first dev compile of `/board/<id>` (13.4 s cold, 0.7 s warm), recorded in Open.
- 2026-10-03 — Board comments (THREADS F4). The board header has the board's own thread (`spatial_board`); every tile has ONE comment door in its header — a record tile opens its record's own thread (`BoardItemType.comments`, platform token, never the item key); board-only tiles (write-up, label, web page, image, app page) and the data table (no entity token) post on the board's thread, say "Posted on the board", and name the tile in the remark; a draft has no door. Every comment made on the board (header, tile door, a task tile's own thread, a passage in a note/document tile, a record thread in the canvas) rides the board chat's next message as a remark naming its record when "With next message" is on (the ChatCanvasWorkspace registers the remark sink; `features/rich-document/annotations/comment-remarks.tsx`). Guards: `__tests__/every-tile-has-one-comment-door.test.ts`, chat `board-comments-ride-to-the-page-chat.test.ts`. Comments on one PART of a board (`part_anchor`) are built and proven on the clone only — the live apply is pending, so board-only tiles use the board thread until then.
- 2026-10-03 — Document tiles were drawn solid black (pixel 0,0,0,255) from first boot, every browser and theme. Cause: Univer 1.0 paints its own fills as theme tokens ("gray.0") and the editor's pass-through colour service handed them to the canvas unresolved (an unparseable fillStyle leaves the canvas default black); the theme hook also called the 0.x `getRenderById`. Not the kept-instance re-parenting. Fix and guard: features/data-tables/FEATURE.md.
- 2026-10-03 — Chat, task, research and project pass the core remount law with no waiver: what each tile shows is a store read kept in Redux by record and read once (`lib/redux/store-reads/useStoreRead.ts`), and the project's half-typed quick-add task is a draft in the store by project. research:quiet is green; chat:quiet (the @ai-matrx/associations conversation-files hook), task:quiet and project:quiet (EntityCustomFields) stay red with their owners named in the ledger. Browser (clone, admin's Workspace): sleep→wake and remove+Undo on all four read none of their records; the quick-add draft survives both.
- 2026-10-03 — The board's document item sleeps. A document is one working copy per tab (lib/working-copy, kind udt_document), kept warm after its last view; a wake or a removed-and-undone tile reads and writes nothing (remount harness udt_document + :quiet green; browser: slept, woke with its text, zero requests).
- 2026-10-03 — Table and record tiles read nothing on wake or Undo. The record store's data layer
  (`@ai-matrx/records` 0.65.0) owns every answer and the realtime subscription; the tiles' `Keep`
  (`RecordsTileKeep`, `useRecordsHold(tileId)`) holds them open while the body sleeps, and the body
  sits under `<RecordsHoldScope>`. A change made while asleep is on screen at wake.

- 2026-10-03 — Remount-safety guard over every board item type (`__tests__/remount-safety.*`,
  ledger `remount-safety/cases.ts`, cross-check `remount-ledger.test.ts`). Univer and the records
  grid stand in at their engine boundary; everything above runs for real.
- 2026-10-02 — Table and record sleep. Their three gates (where the table lives, the store switch, the
  share check) keep their answers per record for the session (`lib/kept-answer`), so a wake or an
  Undo-remount draws the content on its first frame, asks none of those doors again, and never
  unmounts the grid ("Opening the table…" is gone from wake). Browser-checked on a Record tile:
  draft kept across sleep, 0 gate calls on wake and on remove+Undo. Still re-read on wake/remount:
  the records package's own hooks (`@ai-matrx/records` `useAsync`, realtime resubscribe).

- 2026-10-02 — War room and workflow run sleep. War room: the tile (body + a `Keep`) holds a
  ref-counted room view (`features/war-room/redux/roomViewSession.ts`) — one read and one "opened"
  per session, no skeleton on wake, remount or a second tile of the room. Workflow run: the run's
  workflow + surface are read once into Redux (`loadRunSurface`), its `Keep` holds the one stream
  adoption, and the tile's stage passes `floatOnLeave={false}` — waking, hiding or removing it never
  opens the floating run window. Guard: `__tests__/feature-items-remount.test.tsx`.
- 2026-10-02 — The file tile sleeps: its editor text, dirty state and undo come back after a sleep and a
  remount (one working copy per file in the store, features/files FEATURE.md 7b), Monaco re-creates on wake
  (never blank), one save, no repeated download — checked in the browser on a board with the file also open
  in a canvas tab.
- 2026-10-02 — Sleep census: chat, note, task, research and project now sleep, each checked in the
  browser (sleep → wake → text/scroll/draft kept, nothing relaunched or re-created, edits still save).
  Effects that threw work away on a re-run were made idempotent at their source: the Visual rich
  editor (Tiptap rebuilt from mount text), the inline file editor (reset + re-read), the composer
  autofocus (stole the caret), project name/description drafts and the project task list.
- 2026-10-02 — The meeting board is the canonical Board: `MeetingBoard` renders `UserBoard` over a
  saved board linked by `settings.meeting_id` (`getMeetingBoard`; a guest keeps the same document in
  the browser). Its five live sections became the registered item type `meeting_part`
  (`items/meeting-items.tsx`), placeable on any board; `recordKeyOf` keys a `meta.part` separately.
  The bespoke board (all-in-one `useBoard` host, own toolbar, scratchpad, localStorage tiles) is gone.

- 2026-10-02 — A tile never navigates the board away: pages it opens land on the board as Page
  tiles (or a new tab); Page tiles put any app page on the board with the shell chrome dropped.

- 2026-10-02 — Meeting tile: Join/Rejoin runs the live room inside the tile (the board stays); Leave
  returns to the meeting's home; the tile is held awake while the room is up (`MeetingBody`).
- 2026-10-02 — Stability round: tile lifecycle (opt-in sleep), full screen moves the card, per-tile
  hooks, one tile per record, agent undo never re-parks, close-safe saves, the camera follows only
  keyboard focus, a press on empty board blurs the tile's field. Root causes of the pan freeze and the
  menu freeze/crash were CSS (see "Two CSS traps"); measured on five long chats: pan/drag/resize 17 ms
  frames with no long tasks, a menu opens in ~0.2 s (was a hang and a crash), pan while two chats
  stream p95 17 ms (was 1,267 ms).

- 2026-10-02 — Every "Bring in" picker offers its type's "Start new" entries in its header, so no
  picker is a dead end. New starts: Meeting (`StartNewEntry.Dialog` — THE ONE MEETING FORM mounted bare,
  held behind the organization gate like `/meetings`), Workflow run (pick a workflow → its served
  `RunStartForm`), Research (the start wizard embedded via `ResearchInitForm onCreated`, steps in local
  state, never the address bar), Project (`ProjectCreatePanel`). Record stays bring-in only (a record
  is made inside its table tile).
- 2026-10-01 — Saved boards and agents stop fighting the person: the camera left the saved board
  (per-viewer, never in the version guard — two tabs no longer lock each other out); the document is
  built only when a save goes out and a save reads back only `version`; hide/close flushes as a
  keepalive PATCH; "Reload board" after a conflict dismisses the toast and resumes saving. Agents never
  move the camera, select or end typing while the person works in a tile, and `board_undo` undoes only
  the agent's changes (`BoardStore.runAs` / `undoActor`). Sequential adds fill the view in reading
  order instead of a diagonal staircase. Tests: `board-save`, `useSavedBoard`, `agent-actor`,
  `board-bridge`, `placement-run` — each failing on the old files.

- 2026-10-01 — No gesture can get stuck: `startPointerGesture` ends a resize, tile drag or drawing
  on every way a press can end (a missed release heals on the next move); Escape puts a resize or
  drag back. The board pan ends on a missed release or window blur too.

- 2026-09-30 — The board model moved out of React into `BoardStore` with per-tile, layout and
  whole-board subscriptions; `/board` renders tiles by id (`useBoardTile`), the body sits behind a
  rect-free `TileContent`, edges follow their two tiles, the layers list reads the whole board only
  while open, and autosave subscribes to the store. `useBoard` keeps its API with stable operations
  (the old per-render closures defeated the React Compiler, so every tile re-rendered on every
  frame) — the demo, meeting and workflow boards inherit that. `DocumentDraftBody`'s create moved
  out of the component so the compiler compiles it.

- 2026-09-30 — What has focus stays on screen (`engine/reveal.ts`): keyboard focus moving to an element
  inside a tile that is off the visible board (tabbing grid cells, find-next) or a contenteditable
  caret leaving it pans the CAMERA by the smallest amount, 24px margin, never a zoom (Figma, Excel) —
  what a native scroll would have done now that the board never scrolls natively. Not for a click's
  focus (within 400ms of a press) and never while a pointer is down. It reveals only what the content
  itself shows (`clipToVisible`: a cell hidden past a grid's own scroll edge brings at most that edge on
  screen — the grid scrolls its content), and re-checks for 700ms while the content settles (a grid
  scrolling its own cell into view a frame later).

- 2026-09-30 — Keys and scroll belong to their owner: `engine/key-target.ts` (`isTyping`, `boardOwnsKey`)
  is the one guard for every board key — a key inside a tile's content (grid cell, editor, Monaco
  EditContext, textbox) is the content's, so Enter there never opens full screen and Backspace never
  takes the tile off (`useBoardKeys` shares it). `engine/native-scroll.ts`: the board never scrolls
  natively — the root is `overflow: clip`, and a `focus()`/`scrollIntoView()` scroll of the root, a
  clipped ancestor pane or a tile card is reset at once; only the camera moves the board.

- 2026-09-30 — Browser verification of every item type (note, file, chat, table, record, task, project) and
  the bridge. Two fixes: the board's key guard (`isTyping`, `components/BoardViewport.tsx`) now treats
  an EditContext host (Monaco, the file tile's editor) and `role="textbox"` as typing — Space-to-pan was
  eating every space typed into a file (`__tests__/typing-target.test.ts`); the File tile adopts the file's
  current name as its title, so a rename no longer leaves the board and `board_items` on the old name.

- 2026-09-30 — The gaps, closed as one class: `onResize` is required on `BoardTile` and wired on
  every `useBoard` host (War Room opts out explicitly), guarded by `resize-wiring.test.ts`; a finger
  on a tile body scrolls its content instead of dragging the tile or panning the board
  (`pressAction`); full screen joined a shared layer stack so one Escape closes only the top layer,
  and top toasts drop below the exit bar.

- 2026-09-30 — Documents on the Board (`udt_document`): the tile renders `DocumentRecord`, the one
  component `/documents/[id]` now renders too, with the `matrx-user/documents` surface — which gained the
  body text (read + ask-first write through Univer's command service). Create happens on the tile's
  Create click; bring in via `DocumentsResourcePicker`; legacy `{kind:"document"}` tiles render.
  Tests: `items/__tests__/document-items.test.tsx`.
- 2026-09-30 — Board interaction musts (Arman, from real use): every `/board` tile resizes from
  eight handles (constant screen hit area, min size, Shift aspect, drag shield, one undo step,
  persisted); a wheel over any tile never pans or zooms the board (pinch / ctrl-wheel still zoom);
  double-click the header flies to a tile and makes it live (the header fly had never fired —
  pointer capture retargeted the dblclick); full screen is viewport-fixed with an always-visible
  Close and an Escape that works from inside a chat composer. The full-screen trap, reproduced on
  a chat tile: the board read Escape inside any field of a tile as "leave the field" (blur and
  stop) BEFORE "leave full screen", and the chat composer keeps its focus, so every Escape was
  eaten (two presses, still full screen, focus still in the composer); and the layer was sized
  from the board pane, so it moved and resized with the workspace around it. Pure rules + tests:
  `engine/tile-gestures.ts`, `routeWheel`, `__tests__/tile-gestures.test.ts`.

- 2026-09-28 — Custom data: Table tile (`data-table`) renders `/data-v2`'s own table (`UnifiedTable`, shared
  with the route) and carries `matrx-user/data-tables` via `RecordStoreTableSurface`; Record tile renders
  `Peek` and carries `matrx-user/data-tables` scoped to that one row (`RecordStoreRecordSurface`). The table
  surface mounts only under the merged grid (`data_tables.merged_grid` knob, default off until merge step 8).
  Board-item surfaces declare `briefValues` for `board_items` basics.

- 2026-09-28 — The bridge: every tile registers its surface into a per-tile capture (live or dormant);
  `board_items` replaces `board_tiles` (every item + a dormant item's basics); `board_open_item` /
  `board_item_act` read and act on ANY item in the same turn through the canonical writeback and
  client-tool runtimes (approval flow included). `board_focus` no longer says "act next turn".

- 2026-09-28 — Feature tiles carry their feature's full surface: Task (`matrx-user/tasks`, already in
  `TaskEditorBody`), War Room (`WarRoomSurfaceHost`, body now the room's `StageView`; the tile hydrates
  without taking the active room), Research (`ResearchTopicSurfaceHost`), Project
  (`ProjectRecordWorkspace` — the whole workspace, not just its task list), Meeting (NEW
  `matrx-user/meeting`, body now `MeetingDetail` embedded) and Workflow run (NEW
  `matrx-user/workflow-run`). Each host is shared with the feature's own page.

- 2026-09-28 — Note tile is the real notes core (`NoteWorkspace`) instead of a plain-text `NoteEditorCore`;
  `tiles/NoteTileBody.tsx` deleted (label body moved to `tiles/TextTileBody.tsx`); "Note" starts a note
  the /notes way; agent and pasted text become real notes; agent `text` on a real note refuses with the
  `note_content` remedy. Note tiles default to 560×620.

- 2026-09-28 — File tile: the body is the single-file page's own working area (`SingleFileWorkspace`: name menu,
  Copy link / Download / More, per-tab rail, all seven tabs) and its surface is `matrx-user/file` through the
  page's own host (`SingleFileSurfaceHost` as `surface.Host`). Default size 800×600.

- 2026-09-28 — Chat tile: mounts `matrx-user/chat` for its conversation (`ChatConversationSurface`, shared
  with `/chat`); reopening resumes through `resumeConversation` (reattaches a mid-run turn); its launch opts
  out of surface adoption like /chat's own. `startNew` may list several entries; chat adds "Chat with an
  agent". Bring-in is "Conversation".

- 2026-09-27 — Frame fly-to includes its title band in the fit target; War Room’s board-only down throw uses the reversible 'remove' action, distinct from destructive 'delete'.

- 2026-09-25 — Created: engine, zoom-paced streaming, demo board (research/study kinds, podcast
  pipeline, generated HTML, 100-stream stress test). Unit tests in `__tests__/engine.test.ts`.
  Same day: browser pass fixed controls swallowed by the pan handler, fit under the toolbar
  (`insets`), and the performance rules above; far-zoom tiles no longer commit at all.
  Independent verification (Sonnet) then found and this session fixed: header drag dropped after
  the first move (listeners re-bound mid-gesture — now ref-based), tiles collapsed to 2px under
  768px (global `* { max-width: 100% }` in globals.css — every Board element is `max-w-none`),
  a reload right after a move lost it (hash now throttled, not debounced), and a 1.8× zoom per
  mouse notch (now ~1.22×). Zoom-at-cursor measured exact to 0.1 world px over 23%→400%.
- 2026-09-27 — Owner round 2: wheel-zooms input model with the auto/zoom/pan knob, focus mode, throw
  gestures with pre-release hints and undo, the parked shelf, the v3 right-click menu, save-to-Notes,
  `useBoard` + auto-placement. Browser-verified (wheel vs trackpad, focus + arrows + Esc, throw
  right/down, shelf restore, delete confirm, menu), 0 console errors.
- 2026-09-27 — Tile interaction model (idle / selected / interacting). Board agent tools + the
  `matrx-user/spatial-board` surface; `useBoard` gains connections, `moveMany`, a live `read()`
  (fixes back-to-back commands reading stale state — test fails before, passes after) and
  frame-aware placement. All 11 tools driven in the browser on the demo, 0 page errors.
- 2026-09-27 — Board agent tools wired into the meeting board and the workflow run board
  (`BoardSurface` host each). The meeting board now saves `{tiles, frames}` (older bare-array
  boards still load) and keeps a scratchpad's text on the tile so an agent can write it.
- 2026-09-27 — The tools depend on `BoardToolTarget` (a narrow interface `Board<T>` satisfies)
  instead of the whole `useBoard` model, so a board with its own layout model can take them: the
  War Room board is wired through an adapter. Absent operations refuse with the host's remedy;
  `board_read` lists `removed` tiles; focusing a parked tile now waits for it to render before
  moving the camera (it used to fly nowhere). Tests: `features/war-room/components/board/__tests__/roomBoardAgent.test.tsx`
  drive the real handlers.
- 2026-09-27 — The Board: `/board`, `/board/<id>`, `/board/all`; the nav item with its feature
  boards; the item-type contract and catalog; Add menu, Start panel, drop and paste; saved boards
  (`useBoard` seeds parked tiles, shapes and connections; the document saves shapes, labels and
  entity sources). The interim `chat/` (BoardWithChat, BoardChatPanel, the DOM snapshot reader) is
  deleted — `ChatCanvasWorkspace` replaced it; the bounded snapshot `board_read` returns lives in
  `tools/board-snapshot.ts`. `useBoardKeys` is shared (`board/useBoardKeys.ts`).

