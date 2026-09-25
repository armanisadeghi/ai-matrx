/**
 * Spatial view — the camera + item store. Lives OUTSIDE React.
 *
 * A pan or zoom fires at pointer rate (120 Hz on a trackpad). Routing that
 * through React state would re-render every tile per frame, so the camera is
 * a mutable value with frame listeners that write the world transform
 * straight to the DOM. React only hears about COARSE changes, each through
 * its own `useSyncExternalStore` channel:
 *   - the detail tier (read / glance / overview) — changes a few times per zoom
 *   - each tile's visibility (culling) — changes only when a tile crosses the edge
 * Both are recomputed at most once per animation frame.
 */

import {
  type Camera,
  type Rect,
  type Size,
  easeInOutCubic,
  fitRect,
  inflateRect,
  lerpCamera,
  rectsIntersect,
  unionRects,
  visibleWorldRect,
} from "./camera";
import { type DetailTier, detailTierForZoom } from "./lod";

type Listener = () => void;

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Tiles within this many SCREEN px of the viewport edge stay mounted-visible,
 * so a tile is already painted by the time a pan brings it in. */
const CULL_MARGIN_SCREEN_PX = 240;

export class SpatialStore {
  private camera: Camera;
  private size: Size = { w: 1, h: 1 };
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private items = new Map<string, Rect>();

  private frameListeners = new Set<Listener>();
  private tierListeners = new Set<Listener>();
  private visibleListeners = new Map<string, Set<Listener>>();
  private selectionListeners = new Set<Listener>();

  private tier: DetailTier;
  private visible = new Set<string>();
  private selected: string | null = null;
  private coarseScheduled = false;
  private flight: number | null = null;
  private interacting = false;
  private interactingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(initial: Camera) {
    this.camera = initial;
    this.tier = detailTierForZoom(initial.z);
  }

  // ── camera ────────────────────────────────────────────────────────────────

  getCamera = (): Camera => this.camera;
  getSize = (): Size => this.size;

  setCamera(next: Camera, opts: { keepFlight?: boolean } = {}): void {
    if (!opts.keepFlight) this.cancelFlight();
    this.camera = next;
    this.markInteracting();
    for (const l of this.frameListeners) l();
    this.scheduleCoarse();
  }

  setSize(size: Size): void {
    this.size = size;
    for (const l of this.frameListeners) l();
    this.scheduleCoarse();
  }

  /** Animated camera move (the "fly-to" every canvas tool ships). */
  flyTo(target: Camera, ms = 520): void {
    this.cancelFlight();
    const from = this.camera;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      this.setCamera(lerpCamera(from, target, easeInOutCubic(t), this.size), {
        keepFlight: true,
      });
      this.flight = t < 1 ? requestAnimationFrame(step) : null;
    };
    this.flight = requestAnimationFrame(step);
  }

  /** Screen px covered by overlay chrome; fits frame content inside the rest. */
  setInsets(insets: Insets): void {
    this.insets = insets;
  }

  /** `fitRect` inside the viewport minus the overlay insets. */
  private fitClear(target: Rect, padding: number, maxZ: number): Camera {
    const { top, right, bottom, left } = this.insets;
    const inner = {
      w: Math.max(1, this.size.w - left - right),
      h: Math.max(1, this.size.h - top - bottom),
    };
    const cam = fitRect(target, inner, padding, maxZ);
    return { ...cam, x: cam.x + left, y: cam.y + top };
  }

  fitAll(padding = 48): void {
    const bounds = unionRects([...this.items.values()]);
    if (bounds) this.flyTo(this.fitClear(bounds, padding, 1));
  }

  fitItem(id: string, padding = 40): void {
    const r = this.items.get(id);
    if (r) this.flyTo(this.fitClear(r, padding, 1.25));
  }

  private cancelFlight(): void {
    if (this.flight !== null) cancelAnimationFrame(this.flight);
    this.flight = null;
  }

  /** True while the camera moved within the last ~140ms. Consumers use it to
   * set `will-change: transform` ONLY during motion — left on permanently it
   * pins a giant GPU layer and rasterises text blurry at the next zoom. */
  isInteracting = (): boolean => this.interacting;

  private markInteracting(): void {
    if (!this.interacting) {
      this.interacting = true;
      for (const l of this.frameListeners) l();
    }
    if (this.interactingTimer) clearTimeout(this.interactingTimer);
    this.interactingTimer = setTimeout(() => {
      this.interacting = false;
      for (const l of this.frameListeners) l();
    }, 140);
  }

  subscribeFrame = (l: Listener): (() => void) => {
    this.frameListeners.add(l);
    return () => this.frameListeners.delete(l);
  };

  // ── items (world rects, for culling / fit / minimap) ──────────────────────

  registerItem(id: string, rect: Rect): () => void {
    this.items.set(id, rect);
    this.scheduleCoarse();
    return () => {
      this.items.delete(id);
      this.visible.delete(id);
    };
  }

  getItems = (): ReadonlyMap<string, Rect> => this.items;

  // ── coarse channels ───────────────────────────────────────────────────────

  getTier = (): DetailTier => this.tier;

  subscribeTier = (l: Listener): (() => void) => {
    this.tierListeners.add(l);
    return () => this.tierListeners.delete(l);
  };

  isVisible = (id: string): boolean => this.visible.has(id);

  subscribeVisible(id: string, l: Listener): () => void {
    let set = this.visibleListeners.get(id);
    if (!set) {
      set = new Set();
      this.visibleListeners.set(id, set);
    }
    set.add(l);
    return () => set.delete(l);
  }

  getSelected = (): string | null => this.selected;

  select(id: string | null): void {
    if (this.selected === id) return;
    this.selected = id;
    for (const l of this.selectionListeners) l();
  }

  subscribeSelection = (l: Listener): (() => void) => {
    this.selectionListeners.add(l);
    return () => this.selectionListeners.delete(l);
  };

  private scheduleCoarse(): void {
    if (this.coarseScheduled) return;
    this.coarseScheduled = true;
    requestAnimationFrame(() => {
      this.coarseScheduled = false;
      this.recomputeCoarse();
    });
  }

  /** Exposed for tests; normally driven by rAF. */
  recomputeCoarse(): void {
    const nextTier = detailTierForZoom(this.camera.z);
    if (nextTier !== this.tier) {
      this.tier = nextTier;
      for (const l of this.tierListeners) l();
    }
    const view = inflateRect(
      visibleWorldRect(this.camera, this.size),
      CULL_MARGIN_SCREEN_PX / this.camera.z,
    );
    for (const [id, rect] of this.items) {
      const now = rectsIntersect(rect, view);
      const was = this.visible.has(id);
      if (now === was) continue;
      if (now) this.visible.add(id);
      else this.visible.delete(id);
      const ls = this.visibleListeners.get(id);
      if (ls) for (const l of ls) l();
    }
  }
}
