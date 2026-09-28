# FEATURE.md — `spatial` (working name: Spatial view)

> **Status:** proof of concept, live at `/demos/spatial` (demos build). Working name only — "desk" is
> retired vocabulary and "Canvas" is the side-sheet artifact host (`features/canvas`); the product
> name goes to Arman before this leaves demos. Project plan and research:
> `../common-docs/projects/spatial-view/PLAN.md`.

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

`workspace.spatial_boards` (token `spatial_board`, certified, soft delete, versioned; columns
`title`, `description`, `camera`, `nodes`, `edges`, `settings`, `last_opened_at` + the base
contract). The stored shape is `board/document.ts` (parse reports every malformed node; groups and
shapes ride in `nodes` flagged; JSON Canvas 1.0 export). The home board is the row whose
`settings.home` is true, per person per organization. Service + hook: `persistence/` (see The Board).

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
  from anywhere on it moves it; the wheel still zooms the board) → double-click, or a press on a
  control (input, button, link, editor) = *interacting* (native input: typing, text selection, its
  own scrolling, "Interacting · Esc" pill). Esc steps back one state; the header always drags.
  While a tile is interacting only Esc reaches the board's keys.
- **Scrolling (`engine/wheel-input.ts`, knob `WheelMode`, per-viewer):** `auto` (default) — a mouse
  wheel zooms at the cursor, a trackpad swipe pans, a pinch zooms; `zoom`; `pan`. One decision per
  gesture burst so an inertia tail never flips device. Drag empty space / space+drag / middle-drag
  pans. **The one exception:** the INTERACTING tile, under the pointer, with room to scroll that way,
  scrolls itself.
- **Focus (`FocusLayer`):** Enter, F, the tile's expand button or the menu → the tile's live card
  portals into the focus layer and fills the board area (not browser fullscreen), growing out of its
  on-board rect. ←/→ step in reading order; Esc returns to the exact camera. Double-click = fly to.
- **Throws (`engine/throw.ts`):** a header drag released at ≥ 1.1 px/ms after ≥ 70px travel, on a
  dominant axis. Defaults (`DEFAULT_THROW_ACTIONS`, a knob): → park on the shelf · ↑ save to Notes
  and close · ↓ delete from the board after a consequence-naming confirm · ← unassigned. The action
  is named on the tile BEFORE release; every result toasts an Undo.
- **Right-click (`SpatialBoardMenu`):** the ONE v3 menu, one per board; the clicked tile's actions
  come first (`primary`), then Board (fit, 100%, Scrolling, Parked).
- **Keys:** shift+1 fit all · shift+2 fit selection · shift+0 100% · +/- zoom · arrows nudge · esc
  leaves focus, then deselects.
- **Board model (`board/useBoard.ts`):** tiles, positions, shelf, frames, shapes, connections, one
  undo stack, remove-with-undo, `moveMany` (an arrangement = one step), and `addTile` with
  auto-placement in the nearest free space clear of tiles AND frames (`engine/placement.ts`;
  `within` lets it join one frame) — the one path gestures, the menu and agents change a board
  through. Operations read a live snapshot (`read()`), so commands issued in one tick see each
  other before React re-renders.

## Agent tools — the board is a surface

Every host wraps its board in **`components/SpatialBoardSurface.tsx`**: it mounts the
`matrx-user/spatial-board` surface runtime (values `board_title`, `board_tiles`, `selected_tile`)
and registers the board's client tools, so ANY agent running while a board is on screen (the chat
beside it, a shortcut, a mandate) receives them automatically (`listLiveSurfaceClientTools` →
tool injection; no per-agent arming, no aidream change).

| Piece | File |
|---|---|
| Tool declarations: `board_read`, `board_add_tile` (note / markdown / text / html / image), `board_update_tile`, `board_remove_tile`, `board_move_tiles`, `board_arrange` (grid / tidy / row / column / align / distribute), `board_group` (named frame), `board_connect`, `board_focus`, `board_park`, `board_undo` | `tools/board-tools.ts` (carried by `features/surfaces/manifests/spatial-board.manifest.ts`) |
| Handlers — host-agnostic, drive `useBoard` + the store; errors come back as `{ok:false, error}` with a remedy; remove toasts an Undo; adding never moves the camera | `tools/useBoardAgentTools.ts` |
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
Note (`NoteTileBody` `text` prop creates/saves it). Wired: the demo; the meeting board
(`features/meet/components/board/MeetingBoard.tsx` — markdown / html page or `srcDoc` / image; a
"note" is the board's own scratchpad and "text" becomes markdown; the live meeting sections refuse
content edits); the workflow run board (`features/workflow-runtime/components/spatial/WorkflowRunSpatialView.tsx`
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
| Page: the ONE chat-beside-a-canvas layout (`ChatCanvasWorkspace`, `features/canvas/workspace`) with the saved board as canvas; title menu Rename / New board / All boards; byline shows save state | `home/BoardPage.tsx`, `app/(core)/board/**` |
| The board: placement, Add menu, Start panel (empty board), drop + paste, tools, shelf, layers, agent tools host | `home/UserBoard.tsx`, `home/AddMenu.tsx` |
| What a paste/drop of text becomes (a link → web page / image, other text → a new Note) | `home/board-intake.ts` |
| Saving: `useSavedBoard({home:true} \| {boardId})` — debounced autosave (`AUTOSAVE_DELAY_MS`), flush on unmount and pagehide. `saveBoardDocument(id, doc, { expectedVersion, baseFingerprint })` is version-guarded (`guardedUpdate`): a version moved only by a rename or the opened stamp retries; a document changed elsewhere is a `conflict` the person is told about | `persistence/` |
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
- **Down-throw and Delete take a tile off the board** ("remove"): the record lives on where it lives.

## Change Log

- 2026-09-28 — File tile: the body is the single-file page's own working area (`SingleFileWorkspace`: name menu,
  Copy link / Download / More, per-tab rail, all seven tabs) and its surface is `matrx-user/file` through the
  page's own host (`SingleFileSurfaceHost` as `surface.Host`). Default size 800×600.

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
