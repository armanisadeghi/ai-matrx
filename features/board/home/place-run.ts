/**
 * Where the board's own "ways in" put new tiles (pure) — the Add menu, the
 * Start panel, a picker, a paste, a drop.
 *
 * A RUN of adds fills the view in reading order (`placeInFlow`): the first
 * tile lands centred where the person is looking, the next ones fill the row
 * across the view, then the next row down — like text (Miro, FigJam). The run
 * continues while the person's view is where the last add left it; a pan or
 * zoom starts a new run where they now look.
 *
 * The camera never flies to a new tile any more: it pans by the smallest
 * amount that brings it on screen, and only when it is not (`revealCamera`).
 * Flying to each new tile is what made 15 adds a 7,000-unit staircase: the
 * next add searched from the centre of the last one.
 *
 * A drop passes `at` (the drop point): the tile goes to the nearest free spot
 * there and no run is kept.
 */

import { type Camera, type Rect, panBy, screenToWorld, visibleWorldRect } from "../engine/camera";
import { flowForView, type PlacementFlow } from "../engine/placement";
import { panToReveal } from "../engine/reveal";
import type { BoardTileBase } from "../board/board-store";

export interface PlacementRun {
  flow: PlacementFlow;
  /** The camera the last add of this run left the view at. */
  camera: Camera;
}

export interface PlacementView {
  camera: Camera;
  size: { w: number; h: number };
  /** Screen px of chrome over the board (tool bar, HUD). */
  insets: { top: number; right: number; bottom: number; left: number };
}

/** Screen px kept between a revealed tile and the board's edge. */
const REVEAL_MARGIN = 48;

/**
 * THE READABLE FLOOR FOR ADDING. A tile added while the person is zoomed out past this (a Fit of 12
 * tiles sits at ~15%, title-card level) would land as a speck in a gap — "I added a War Room and
 * nothing appeared" — so an add measures and places at this zoom around the view's centre and the
 * camera flies there. Fit itself never changes: it stays exact (every tile in view, whatever the zoom).
 */
export const READABLE_ADD_ZOOM = 0.5;

/** The view as it is at the readable floor (same centre), or itself when it is already readable. */
export function atReadableZoom(view: PlacementView): PlacementView {
  if (view.camera.z >= READABLE_ADD_ZOOM) return view;
  const { camera, size, insets } = view;
  const sx = insets.left + (size.w - insets.left - insets.right) / 2;
  const sy = insets.top + (size.h - insets.top - insets.bottom) / 2;
  const centre = screenToWorld(camera, sx, sy);
  const z = READABLE_ADD_ZOOM;
  return { ...view, camera: { z, x: sx - centre.x * z, y: sy - centre.y * z } };
}

/** The board area not under chrome, in world px. */
export function clearView(view: PlacementView): Rect {
  const { camera, size, insets } = view;
  const all = visibleWorldRect(camera, size);
  const z = camera.z;
  return {
    x: all.x + insets.left / z,
    y: all.y + insets.top / z,
    w: Math.max(1, (size.w - insets.left - insets.right) / z),
    h: Math.max(1, (size.h - insets.top - insets.bottom) / z),
  };
}

/** The same view, give or take rounding (a flight's last frame). */
export function sameView(a: Camera, b: Camera): boolean {
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.z - b.z) / b.z < 1e-3;
}

/** The camera that brings `rect` on screen by the smallest pan (never a zoom), or null when it already is. */
export function revealCamera(rect: Rect, view: PlacementView): Camera | null {
  const { camera, size, insets } = view;
  const z = camera.z;
  const el = {
    left: camera.x + rect.x * z,
    top: camera.y + rect.y * z,
    right: camera.x + (rect.x + rect.w) * z,
    bottom: camera.y + (rect.y + rect.h) * z,
  };
  const area = { left: insets.left, top: insets.top, right: size.w - insets.right, bottom: size.h - insets.bottom };
  const { dx, dy } = panToReveal(el, area, REVEAL_MARGIN);
  return dx === 0 && dy === 0 ? null : panBy(camera, dx, dy);
}

export function placeTiles<T extends BoardTileBase>(
  board: {
    addTile: (tile: T, near?: { x: number; y: number }, opts?: { flow?: PlacementFlow }) => Rect;
  },
  tiles: T[],
  view: PlacementView,
  run: PlacementRun | null,
  at?: { x: number; y: number },
): { rects: Rect[]; run: PlacementRun | null; reveal: Camera | null } {
  const rects: Rect[] = [];
  if (tiles.length === 0) return { rects, run, reveal: null };
  if (at) {
    for (const tile of tiles) rects.push(board.addTile(tile, at));
    return { rects, run: null, reveal: revealCamera(rects[rects.length - 1], view) };
  }
  // Zoomed out past the readable floor: place (and reveal) as if at the floor, so the tile lands
  // near where the person looks, at a size they can read.
  const wide = view;
  view = atReadableZoom(wide);
  const zoomedIn = view !== wide;
  const area = clearView(view);
  const fresh = !run || !sameView(run.camera, wide.camera);
  const flow = fresh ? flowForView(area, tiles[0].rect, REVEAL_MARGIN / view.camera.z) : run.flow;
  const centre = { x: area.x + area.w / 2, y: area.y + area.h / 2 };
  tiles.forEach((tile, i) => {
    rects.push(board.addTile(tile, fresh && i === 0 ? centre : undefined, { flow }));
  });
  const reveal = revealCamera(rects[rects.length - 1], view) ?? (zoomedIn ? view.camera : null);
  return { rects, run: { flow, camera: reveal ?? view.camera }, reveal };
}

/** The world point at the centre of the board area not under chrome. */
export function clearViewCentre(view: PlacementView): { x: number; y: number } {
  const { camera, size, insets } = view;
  return screenToWorld(
    camera,
    insets.left + (size.w - insets.left - insets.right) / 2,
    insets.top + (size.h - insets.top - insets.bottom) / 2,
  );
}
