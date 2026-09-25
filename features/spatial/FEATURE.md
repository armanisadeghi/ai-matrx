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
- **Components that assume the viewport break inside the plane:** `WindowPanel` (portals to
  `document.body`, window-relative drag bounds) and anything `position: fixed` cannot be tile
  bodies. A kind tuned for the 720px chat column needs a ≥ 720px tile.

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

## Gestures (the Figma/FigJam/tldraw standard)

Wheel / two-finger pan · ⌘/ctrl+wheel or pinch zoom at cursor · drag empty space, space+drag or
middle-drag pan · shift+1 fit all · shift+2 fit selection · shift+0 100% · +/- zoom · arrows nudge ·
esc deselect · double-click a tile to fly to it · wheel over the SELECTED tile scrolls it.

## Change Log

- 2026-09-25 — Created: engine, zoom-paced streaming, demo board (research/study kinds, podcast
  pipeline, generated HTML, 100-stream stress test). Unit tests in `__tests__/engine.test.ts`.
  Same day: browser pass fixed controls swallowed by the pan handler, fit under the toolbar
  (`insets`), and the performance rules above; far-zoom tiles no longer commit at all.
