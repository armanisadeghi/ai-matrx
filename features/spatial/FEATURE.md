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
| `glance` | zoom ≥ 0.28 | every 900 ms | settle (opacity + blur clears) + smooth follow-scroll, 70% of the interval |
| `overview` | zoom < 0.28 | every 2.6 s; body replaced by a counter-scaled title card + progress | progress bar eases |
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

## Gestures (the Figma/FigJam/tldraw standard)

Wheel / two-finger pan · ⌘/ctrl+wheel or pinch zoom at cursor · drag empty space, space+drag or
middle-drag pan · shift+1 fit all · shift+2 fit selection · shift+0 100% · +/- zoom · arrows nudge ·
esc deselect · double-click a tile to fly to it · wheel over the SELECTED tile scrolls it.

## Change Log

- 2026-09-25 — Created: engine, zoom-paced streaming, demo board (research/study kinds, podcast
  pipeline, generated HTML, 100-stream stress test). Unit tests in `__tests__/engine.test.ts`.
