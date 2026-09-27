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

## Saved boards — status

`workspace.spatial_boards` is LIVE (2026-09-27, provisioned through `platform.create_entity_table`,
token `spatial_board`, entity variant, versioned, soft delete, personal visibility, list scope
`mine`, `iam.canonical_certify_ok` = true, `platform_admin_read` present). Columns: `title`,
`description`, `camera`, `nodes`, `edges`, `settings`, `last_opened_at` + the base contract. The
stored shape is `board/document.ts` (parse reports every malformed node; JSON Canvas 1.0 export).
**Blocked on one step:** `pnpm db-types` must be re-run on a machine holding the Supabase access
token (this cloud container has none, and the MCP generator emits only `public`), so the client
service, autosave (`mergeJsonColumn`, debounced) and the manage page (`<EntityListPage>`: open,
rename, duplicate, archive, delete) can compile against the generated row. No cast was used to
get around it.

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

- **Scrolling (`engine/wheel-input.ts`, knob `WheelMode`, per-viewer):** `auto` (default) — a mouse
  wheel zooms at the cursor, a trackpad swipe pans, a pinch zooms; `zoom`; `pan`. One decision per
  gesture burst so an inertia tail never flips device. Drag empty space / space+drag / middle-drag
  pans. **The one exception:** the SELECTED tile, under the pointer, with room to scroll that way,
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
- **Board model (`board/useBoard.ts`):** tiles, positions, shelf, remove-with-undo, and `addTile`
  with auto-placement in the nearest free space (`engine/placement.ts`) — the one path gestures,
  the menu and agents change a board through.

## Change Log

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

## Chat beside the board

`features/spatial/chat/` puts the platform's one chat on the left of a board (the Claude Design
shape). Live on `/demos/spatial`.

| Piece | File |
|---|---|
| `BoardWithChat` — v4 horizontal split, chat left (30%, min 300px, max 55%), board right; collapses to a 44px rail (button or Ctrl/Cmd + `\`), layout in the `panels:<id>` cookie; under 768px the chat is a bottom Drawer | `chat/BoardWithChat.tsx` |
| `BoardChatPanel` + `useBoardChatConversation` — mounts `AgentConversationColumn` under the `chat.default_new_chat` mandate (what `/chat/new` resolves; no agent id, no prompt in code) | `chat/BoardChatPanel.tsx` |
| `BoardContext` — bounded snapshot (60 tiles, 1,200 chars per excerpt, 24,000 total; focused/selected/in-view first; caps stated in the payload) + the DOM reader | `chat/board-context.ts` |

- **The board is CONTEXT, never user text.** One entry, key `spatial_board` (type `json`), written
  with `setContextEntries` when the conversation opens and again in the CAPTURE phase of every
  pointerdown / Enter / focus inside the chat — before the composer's send handler — so every turn
  carries the board as it is now. The composer's "Board" pill opens exactly what is sent.
- **First version reads the DOM** (`[data-spatial-tile]`, `[data-spatial-card]`, `[data-spatial-body]`,
  the status dot's `title`, the selection ring). Follow-up: a store-backed `getBoardContext` once
  the board exposes its `SpatialStore` (kind payloads, not rendered text; a real `selected` field).
- **Not yet a registered surface.** The platform's own submit-time path is a surface manifest +
  `SurfaceRuntimeProvider.beforeExecute` (`refreshSurfaceScope`), which needs the conversation
  stamped with a `surfaceName` — `launchMandate` does not pass one today. When a
  `matrx-user/spatial-board` surface is registered, move the refresh there and drop the capture
  handlers.
