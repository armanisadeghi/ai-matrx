# FEATURE.md — `spatial` (working name: Spatial view)

> **Status:** proof of concept, live at `/demos/spatial` (demos build). Working name only — "desk" is
> retired vocabulary and "Canvas" is the side-sheet artifact host (`features/canvas`); the product
> name goes to Arman before this leaves demos. Project plan and research:
> `../common-docs/systems/workspace/boards/projects/spatial-view/PLAN.md`.

**What it is:** an infinite, pannable, zoomable plane where many live AI results (streaming
prose, structured kinds, images, generated HTML, pipelines) sit as tiles at their natural size.
Zoom replaces resizing, so a board holds 3 or 300 results without a layout fight. It is a
**platform primitive**: War Room, meetings and workflow results are meant to mount it, not fork it.

## The one idea that is ours: zoom-paced streaming

Every token still lands upstream at full rate. A tile only decides **when to re-render what has
arrived**, by its pace tier (`engine/lod.ts`):

| Tier | When | Commit cadence | Landing motion |
|---|---|---|---|
| `read` | body text ≥ 9.5px on screen | every animation frame (token by token) | none — the tokens are the motion |
| `glance` | zoom ≥ 0.28 | every 900 ms | settle (opacity rises — never a blur filter, it is the costliest raster) + smooth follow-scroll batched read-then-write across tiles (`tiles/follow-scroll.ts`), 70% of the interval |
| `overview` | zoom < 0.28 | never — the body is replaced by a counter-scaled title card + progress and skipped for layout (`content-visibility`) | progress bar eases |
| `offscreen` | culled | never | one catch-up commit on re-entry |

Stepping to a MORE detailed tier commits immediately (`shouldCommit`), so zooming in never shows
stale text. By construction a batched tile renders once per interval instead of once per frame.

## Shape of the thing

| Layer | File |
|---|---|
| Camera math (pure): zoom-at-cursor, fit, log-space fly-to, hash deep links | `engine/camera.ts` |
| Tiers + pacing rule (pure) | `engine/lod.ts` |
| Camera/item store OUTSIDE React: frame listeners write the DOM; coarse channels (tier, per-tile visibility, selection) via `useSyncExternalStore` | `engine/spatial-store.ts`, `engine/react.tsx` |
| The plane: input (wheel/pinch/drag/space/keys), ONE world transform, dot grid, `#cam=` sync | `components/SpatialViewport.tsx` |
| Tile (world rect, culling via `content-visibility`, overview card, header drag) | `components/SpatialTile.tsx` |
| Frames (named regions, counter-scaled labels, click to fly), edges, HUD, minimap | `components/SpatialFrame.tsx`, `SpatialEdge.tsx`, `SpatialChrome.tsx` |
| Stream sources: `ReplayStream` (real `StreamBlockAccumulator`), `RequestStream` (live `activeRequests` row) | `streams/stream-source.ts` |
| The read-side throttle | `streams/usePacedSnapshot.ts` |
| Tile bodies: stream → `BlockRenderer`; sandboxed HTML; image; video | `tiles/` |
| Demo board | `demo/`, route `app/(dev)/demos/spatial/page.dev.tsx` |

## Rules for this directory

- **Never hand-render a stream.** Stream tiles render blocks through `BlockRenderer`, the one
  pipeline. Pacing sits between a source and that render — never upstream of the accumulator.
- **A `RequestStream` reader is a viewer.** Whoever mounts one must hold
  `useRetainRequestForViewer(requestId, …)` (LIVE-RUN-RETENTION.md).
- **No per-frame React.** The camera never goes through React state; only coarse channels do.
  `will-change: transform` is set only while the camera moves (permanently on = blurry text).
- **Every pointer gesture goes through `startPointerGesture` (`engine/pointer-gesture.ts`).** A
  resize, a tile drag or a drawing ends on pointerup, pointercancel, lost capture, window blur, the
  page hidden, Escape (puts it back), or the first move that reports the button up. A gesture that
  ended only on one `pointerup` reaching one element stayed open when that release was missed: the
  resize shield stayed over the page with a resize cursor and the board took no clicks (Arman,
  2026-10-01). The board pan heals the same way. `__tests__/SpatialTile.test.tsx` holds it.
- **Tiles sleep only when proven to wake correctly (`TileLife` in `engine/spatial-store.ts`).** The store
  says live / frozen / discarded (needed = in view at a readable zoom, selected, worked in, full screen,
  keyboard focus inside, or `holdAwake`; frozen 8 s after it stops being needed; discarded beyond 12
  warm). A tile acts on it only with `sleeps` (React `<Activity mode="hidden">`) / `discardable`, set per
  item type (`BoardItemType.sleeps`) after a browser check — waking re-runs every effect, and content
  whose mount effect resets itself loses work. Sleeping (browser-checked 2026-10-02): label, image,
  chat, note, task, research, project, war room, workflow run, table, record. Awake, with the reason: document (Univer is rebuilt from the
  server snapshot), file (`@monaco-editor/react` never re-creates its editor; previews re-download). What must outlive a sleeping body (a chat's live run, holding the
  tile awake while the agent works) is the type's `Keep`, mounted outside the boundary.
- **Nothing inside a tile takes over the board** (`engine/tile-navigation.tsx`). A tile body sees a
  board-provided app router; a page it opens (router push, link, `location.assign`, form) lands ON the
  board as a Page tile (`BoardNavigationContext`), else in a new tab — never in this one. A meeting
  tile's Rejoin used to replace the board with the meeting room (2026-10-02).
- **Any page of the app is a Page tile** (`items/page-items.tsx`): the app's own page framed from its
  origin, its shell chrome dropped (`<html data-board-embed>`, styles/shell.css §13d). The fallback
  until a feature is a native item; its agent surface stays inside the frame (known gap).
- **Full screen MOVES the card element** into the focus layer and back (`moveBefore` where available);
  it never renders the card in a second place (that remounted editors and reloaded iframes).
- **Per-tile hooks only** (`useIsSelected/Focused/Editing(id)`, `useIsLiveTile(id)`, `useTileLife(id)`):
  a hook returning the selected id re-renders every tile on every click.
- **A record is on a board once** (`recordKeyOf`): a second bring-in shows the existing tile.
- **Two CSS traps measured on this board (2026-10-02):** a `[style…]` selector with a descendant part
  makes every inline-style change restyle its whole subtree (guard
  `styles/__tests__/no-style-attribute-descendant-selectors.test.ts`); an unscoped `::highlight()`
  rule is computed for every element on the page (guard
  `features/rich-document/annotations/__tests__/highlight-rules-scoped.test.ts`). Together they made a
  pan frame or a menu opening cost seconds on a board of long chats.
- **The board model is never host React state.** It lives in a `BoardStore` (`board/board-store.ts`)
  outside React; a tile reads its own record (`useBoardTile`), a host reads structure only
  (`useBoardLayout` — tile ids, shelf, frames, shapes, connections, undo-ability). A drag or resize
  wakes the one tile it touches; a tile body's props never include the rect, so moving a tile never
  re-renders what it shows. Persistence subscribes to the store, never to a render. A host's
  `useState` board re-rendered every tile and body per pointer frame and locked `/board` on the
  first resize (`__tests__/board-store.test.tsx` holds the class).
- **Generated HTML is `sandbox="allow-scripts"` with no `allow-same-origin`**, inert until its
  tile is selected, and unloads 20 s after leaving the viewport.
- **Every element placed in world space carries `max-w-none`.** World items sit in a zero-width
  absolute box, and globals.css applies `* { max-width: 100% }` under 768px.
- **Components that assume the viewport break inside the plane:** `WindowPanel` (portals to
  `document.body`, window-relative drag bounds) and anything `position: fixed` cannot be tile
  bodies. A kind tuned for the 720px chat column needs a ≥ 720px tile.

## Connecting agents — the seam (for the agent-integration session)

The board takes a real run the same way it takes a replay. Nothing else is needed:

1. Launch the run the normal way (agent/shortcut/workflow execution, or `adoptForeignStream` for a
   server-orchestrated pipeline) and take its `requestId`.
2. `const source = useRequestSource(requestId)` (`streams/useRequestSource.ts`) — a `PacedSource`
   over the same `activeRequests` row `MarkdownStream` reads, holding the viewer retention.
3. `board.addTile({ id, title, rect: { x: 0, y: 0, w, h }, content: { type: "stream", stream: source } }, near)`
   (`board/useBoard.ts`) — `near` is usually the viewport centre in world px
   (`screenToWorld(store.getCamera(), w/2, h/2)`); the tile lands in the nearest free space.
4. For a saved board, the node is `{ source: { kind: "stream", requestId } }` (`board/document.ts`).
A pipeline (notes → script → media) is several tiles plus `SpatialEdge`s inside a `SpatialFrame`;
each stage's tile is added when that stage's request starts.

## Saved boards

`projects.spatial_boards` (token `spatial_board`, certified, soft delete, versioned; columns
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
- `--spatial-z` lives on an inner element and is written only on a ≥1.5% zoom change.

Measured in this container (headless Chromium, software raster, dev build, 4 vCPU), 112 tiles:
standing still with 100 live streams 58 fps (was 21); panning with 100 live streams 21–24 fps (was
7–8); panning when nothing streams 60 fps; the 12-tile board pans at 60 fps. Re-measure on real
hardware with a production build before tuning further.

## Input, focus, gestures

- **A tile has three states (`SpatialTile`, store `editing`):** *idle* → click = *selected* (drag
  from anywhere on it moves it) → double-click, or a press on a control (input, button, link,
  editor) = *interacting* (native input: typing, text selection, "Interacting · Esc" pill). Esc
  steps back one state; the header always drags. While a tile is interacting only Esc reaches the
  board's keys.
- **Frame gestures every item type inherits (`engine/tile-gestures.ts`, drawn by `SpatialTile`; a host
  must pass `onResize`):**
  - *Resize:* four edge + four corner handles, a 12px SCREEN hit area at any zoom (world size
    `px / --spatial-z`), mostly outside the edge so it never covers a scrollbar; min 160×96; Shift keeps
    the aspect ratio (corner: the axis that moved most leads; edge: the other axis scales about its
    centre); left/top handles move the origin. Pointer capture + a page-wide shield portalled to
    `body`, so an iframe or editor in the tile can never steal the drag, even while interacting.
    `useBoard.resizeTile` coalesces a resize into ONE undo step, like a move; `/board` persists it
    through the board document. At the overview tier (a tile a few px on screen) only the SELECTED
    tile shows handles, so a drag there moves instead of resizes (Figma). `onResize` is a REQUIRED prop, so no board can
    forget it: every `useBoard` host passes `board.resizeTile` (/board — which the meeting board now is —, the demo,
    the workflow run board); War Room passes `null` with its reason (its parts are sized by the
    thread layout, which stores positions only). `__tests__/resize-wiring.test.ts` walks every
    `<SpatialTile>` in `features/` and fails on a movable tile with no resize decision.
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
- **Right-click (`SpatialBoardMenu`):** the ONE v3 menu, one per board; the clicked tile's actions
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

Every host wraps its board in **`components/SpatialBoardSurface.tsx`**: it mounts the
`matrx-user/spatial-board` surface runtime (values `board_title`, `board_items`, `selected_tile`)
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
| Tool declarations: `board_read`, `board_add_tile` (note / markdown / text / html / image), `board_update_tile`, `board_remove_tile`, `board_move_tiles`, `board_arrange` (grid / tidy / row / column / align / distribute), `board_group` (named frame), `board_connect`, `board_focus`, `board_open_item`, `board_item_act`, `board_park`, `board_undo` | `tools/board-tools.ts` (carried by `features/surfaces/manifests/spatial-board.manifest.ts`) |
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
yet, and a real note's text changes through `note_content`). Wired: the demo; `/board` and the meeting board (which renders `UserBoard` itself); the workflow run board (`features/workflow-runtime/components/spatial/WorkflowRunSpatialView.tsx`
— real Note / markdown / text / html / image beside the steps; a step refuses content edits, and
`describe` gives its family + declared kind and live status). Both render `board.frames` and
`board.connections`; the War Room board (`features/war-room/components/board/roomBoardAgent.ts`, an
adapter over its own `spatial_layout` model — parts are tiles, threads are frames; move / arrange
within one thread / park / remove / focus work and persist, `text` on a Notes part writes the
thread's note, add / group / connect / undo / rename / resize refuse with the remedy; see the War
Room FEATURE.md Board section).

## The Board (`/board`) — a person's own canvas, the main way in

`/board` is the person's home board in the active organization; `/board/<id>` any of their boards;
`/board/all` manages them (open, rename, duplicate, delete). The nav item "Board" lists My board,
All boards and each feature's board view (War Room, Meetings, Workflow runs).

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
  (`matrx-user/spatial-board`: values + `board_*` tools), so no page-level snapshot is passed.
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

## Change Log

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
  the bridge. Two fixes: the board's key guard (`isTyping`, `components/SpatialViewport.tsx`) now treats
  an EditContext host (Monaco, the file tile's editor) and `role="textbox"` as typing — Space-to-pan was
  eating every space typed into a file (`__tests__/typing-target.test.ts`); the File tile adopts the file's
  current name as its title, so a rename no longer leaves the board and `board_items` on the old name.

- 2026-09-30 — The gaps, closed as one class: `onResize` is required on `SpatialTile` and wired on
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
  768px (global `* { max-width: 100% }` in globals.css — every spatial element is `max-w-none`),
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
  (`SpatialBoardSurface` host each). The meeting board now saves `{tiles, frames}` (older bare-array
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
