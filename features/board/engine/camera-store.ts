/**
 * Board — the camera + item store. Lives OUTSIDE React.
 *
 * A pan or zoom fires at pointer rate (120 Hz on a trackpad). Routing that
 * through React state would re-render every tile per frame, so the camera is
 * a mutable value with frame listeners that write the world transform
 * straight to the DOM. React only hears about COARSE changes, each through
 * its own `useSyncExternalStore` channel:
 *   - the detail tier (read / glance / overview) — changes a few times per zoom
 *   - each tile's in-view state (culling) — changes only when a tile crosses the edge
 * Both are recomputed at most once per animation frame.
 */

import {
  type Camera,
  type Rect,
  type Size,
  clampZoom,
  easeInOutCubic,
  fitRect,
  inflateRect,
  MIN_ZOOM,
  lerpCamera,
  rectsIntersect,
  unionRects,
  visibleWorldRect,
} from "./camera";
import { type DetailTier, detailTierForZoom } from "./lod";
import { type WheelMode, WheelInterpreter } from "./wheel-input";
import type { BoardTool } from "./tools";
import { DEFAULT_SNAP_SETTINGS, type SnapSettings } from "./snap-preference";
import type { SnapOverlay } from "./snapping";

type Listener = () => void;

/** How a host moves several items as one gesture step (`BoardStore.dragMany`). */
export interface BoardMover {
  /** Put these items (tiles or frames, by id) at these positions; successive calls in one gesture are ONE undo step. */
  dragMany: (moves: { id: string; x: number; y: number }[]) => void;
}

/**
 * What a press at a world point selects among the board's drawn shapes.
 * `tolerance` is world px (a few SCREEN px at the current zoom);
 * `background`: the press is on empty board, so hollow interiors count.
 */
export type ShapeHitTester = (
  p: { x: number; y: number },
  tolerance: number,
  opts: { background: boolean; except?: ReadonlySet<string> },
) => string | null;

/** What the viewport asks the host's shapes layer. */
export interface ShapeHost {
  hit: ShapeHitTester;
  /** The shape takes text (double-click / Enter edits it). */
  editable: (id: string) => boolean;
  /** A click on this shape while it is already the one selected starts typing (a sticky, plain text — FigJam). */
  clickEdits?: (id: string) => boolean;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Tiles within this many SCREEN px of the viewport edge stay mounted-visible,
 * so a tile is already painted by the time a pan brings it in. */
const CULL_MARGIN_SCREEN_PX = 240;

/**
 * A tile's content lifecycle — what keeps 10–15 full pages on one board cheap.
 * Paint culling alone (`content-visibility`) still left every hidden tile's
 * editors, chats, channels and timers running forever.
 *   live       — rendered and running: in view at a reading/glance zoom, or
 *                selected, worked in, full screen, or held awake (an agent
 *                reaching it, a chat mid-reply).
 *   frozen     — kept (React state, DOM, an iframe's page) but paused: React
 *                `<Activity mode="hidden">` tears down its effects and store
 *                subscriptions. Chrome's tab freezing.
 *   discarded  — unmounted; it remounts from its saved source when needed.
 *                Only beyond the warm budget, least recently live first.
 *                Chrome's tab discarding.
 * The store only SAYS what a tile could be; a tile's content acts on it only
 * when its type is proven to wake correctly (`BoardTile` `sleeps`,
 * `discardable`): waking re-runs every effect, and content whose mount effect
 * resets its own state (an editor reloading its file) would lose work.
 */
export type TileLife = "live" | "frozen" | "discarded";

/** How long a tile stays live after it stops being needed (a pan past it, a zoom out and back). */
/** A view narrower than this is a phone. */
export const PHONE_VIEW_WIDTH = 640;
/** Below this zoom a tile's text is not readable on a phone; the first view opens on one tile instead. */
export const PHONE_MIN_READABLE_Z = 0.5;
/** The zoom the first tile opens at on a phone: just above the card threshold, so its real body shows. */
export const PHONE_OPEN_Z = 0.7;
/** On a phone a restored view under this zoom (a 27% fit-all saved at desktop width) is reopened on the first tile. */
export const PHONE_UNREADABLE_Z = 0.4;

/**
 * A restored view nobody chose: pinned at the minimum zoom (a fit measured mid-layout and saved), or under
 * `PHONE_UNREADABLE_Z` on a phone, where nothing is legible. The first view is opened again instead (`fitOpening`).
 */
export function cameraIsUnreadable(camera: { z: number }, size: { w: number }): boolean {
  return camera.z <= MIN_ZOOM * 1.01 || (size.w < PHONE_VIEW_WIDTH && camera.z < PHONE_UNREADABLE_Z);
}
export const FREEZE_AFTER_MS = 8000;
/** Frozen tiles kept warm; beyond this the least recently live are discarded. */
export const WARM_TILE_BUDGET = 12;

export class BoardCameraStore {
  private camera: Camera;
  private size: Size = { w: 1, h: 1 };
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private items = new Map<string, Rect>();
  /** Items that are drawn marks (shapes): selectable and fitted, but never a tile — no life, no reading order, no focus. */
  private marks = new Set<string>();
  /** The host's shapes (`setShapeHost`): hit testing and which ones take text. */
  private shapeHost: ShapeHost | null = null;

  private frameListeners = new Set<Listener>();
  private tierListeners = new Set<Listener>();
  private visibleListeners = new Map<string, Set<Listener>>();
  private selectionListeners = new Set<Listener>();
  private itemListeners = new Set<Listener>();
  private focusListeners = new Set<Listener>();
  private focused: string | null = null;
  /** The camera to return to when focus mode exits. */
  private focusReturn: Camera | null = null;
  readonly wheel = new WheelInterpreter();
  private tool: BoardTool = "select";
  private guides = true;
  private snapSettings: SnapSettings = DEFAULT_SNAP_SETTINGS;
  private snapOverlay: SnapOverlay | null = null;
  private snapOverlayListeners = new Set<Listener>();
  private uiListeners = new Set<Listener>();

  private tier: DetailTier;
  private visible = new Set<string>();
  /** Everything selected, in the order it was added (tiles and frames, by id). */
  private selection: readonly string[] = [];
  private selectionSet = new Set<string>();
  /** Items an agent's tool call is acting on right now (nested calls count). */
  private agentWork = new Map<string, number>();
  private agentWorkListeners = new Map<string, Set<Listener>>();
  /** The host's group mover (`registerMover`); absent on a board whose host keeps its own layout. */
  private mover: BoardMover | null = null;
  private editing: string | null = null;
  private editingListeners = new Set<Listener>();
  private coarseScheduled = false;
  private flight: number | null = null;
  private interacting = false;
  private interactingTimer: ReturnType<typeof setTimeout> | null = null;

  private life = new Map<string, TileLife>();
  private lifeListeners = new Map<string, Set<Listener>>();
  private lastNeededAt = new Map<string, number>();
  /** Tiles needed at the last evaluation — the grace period starts when one stops being needed. */
  private wasNeeded = new Set<string>();
  private holds = new Map<string, number>();
  private lifeTimer: ReturnType<typeof setTimeout> | null = null;

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

  getInsets = (): Insets => this.insets;

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

  /**
   * The board's first view. A phone cannot read a whole board at once (fit-all lands at 5-15%), so when fitting
   * everything would be smaller than `PHONE_MIN_READABLE_Z` on a phone-width view, the camera opens on the FIRST
   * tile in reading order instead (top-left, one screen wide), and the rest is a pan away. Wider views and boards
   * that fit readably keep fit-all.
   */
  fitOpening(padding = 48): void {
    const rects = [...this.items.values()];
    const bounds = unionRects(rects);
    if (!bounds) return;
    const all = this.fitClear(bounds, padding, 1);
    if (this.size.w >= PHONE_VIEW_WIDTH || all.z >= PHONE_MIN_READABLE_Z) return this.flyTo(all);
    const first = [...rects].sort((a, b) => a.y - b.y || a.x - b.x)[0];
    const { top, right, left } = this.insets;
    const edge = 16;
    const z = clampZoom(Math.max(PHONE_OPEN_Z, Math.min((this.size.w - left - right - edge * 2) / first.w, 1)));
    this.flyTo({ z, x: left + edge - first.x * z, y: top + edge - first.y * z });
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

  /** Move/resize a registered item without unregistering it (a drag must
   * never drop the tile's selection or focus). */
  updateItem(id: string, rect: Rect): void {
    if (!this.items.has(id)) return;
    this.items.set(id, rect);
    this.scheduleCoarse();
    for (const l of this.itemListeners) l();
  }

  /** Any item's rect changed, or one came or went. For ONE leaf (the selection box), never per tile. */
  subscribeItems = (l: Listener): (() => void) => {
    this.itemListeners.add(l);
    return () => this.itemListeners.delete(l);
  };

  registerItem(id: string, rect: Rect, opts: { mark?: boolean } = {}): () => void {
    this.items.set(id, rect);
    if (opts.mark) this.marks.add(id);
    else if (!this.life.has(id)) {
      this.life.set(id, "live");
      this.lastNeededAt.set(id, performance.now());
    }
    this.scheduleCoarse();
    for (const l of this.itemListeners) l();
    return () => {
      this.items.delete(id);
      this.marks.delete(id);
      for (const l of this.itemListeners) l();
      this.visible.delete(id);
      this.life.delete(id);
      this.lastNeededAt.delete(id);
      this.wasNeeded.delete(id);
      if (this.focused === id) {
        this.focused = null;
        this.focusReturn = null;
        for (const l of this.focusListeners) l();
      }
      if (this.editing === id) this.setEditing(null);
      if (this.selectionSet.has(id)) this.setSelection(this.selection.filter((x) => x !== id));
    };
  }

  getItems = (): ReadonlyMap<string, Rect> => this.items;

  /** A drawn mark (a shape), not a tile or frame. */
  isMark = (id: string): boolean => this.marks.has(id);

  /** Register the host's shapes layer (hit test + editability); the returned function clears it. */
  setShapeHost(host: ShapeHost | null): () => void {
    this.shapeHost = host;
    return () => {
      if (this.shapeHost === host) this.shapeHost = null;
    };
  }

  getShapeHost = (): ShapeHost | null => this.shapeHost;

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

  /**
   * THE selected item — only when exactly one is selected. Everything that
   * acts on "the selected tile" (Enter, zoom to selection, the live tile, the
   * agent's `selected_tile`) reads this, so with several selected none of them
   * picks one at random (Figma: a multi-selection has no primary object).
   */
  getSelected = (): string | null => (this.selection.length === 1 ? this.selection[0] : null);

  /** Every selected id (tiles and frames), stable between changes. */
  getSelection = (): readonly string[] => this.selection;

  isSelected = (id: string): boolean => this.selectionSet.has(id);

  select(id: string | null): void {
    this.setSelection(id === null ? [] : [id]);
  }

  /** Replace the selection (a marquee, ⌘A, a group pick). */
  setSelection(ids: readonly string[]): void {
    const next = [...new Set(ids)];
    if (next.length === this.selection.length && next.every((id, i) => id === this.selection[i])) return;
    this.selection = next;
    this.selectionSet = new Set(next);
    // Selecting something else (or nothing) ends interaction with a tile.
    if (this.editing !== null && !(next.length === 1 && next[0] === this.editing)) this.setEditing(null);
    for (const l of this.selectionListeners) l();
    this.recomputeLife();
  }

  /** Shift / ⌘-click: add the item, or take it out when it is already selected. */
  toggleSelected(id: string): void {
    this.setSelection(this.selectionSet.has(id) ? this.selection.filter((x) => x !== id) : [...this.selection, id]);
  }

  // ── group moves: the host's one path for moving several items at once ───

  /** The host's mover (its board store): what a group drag, a frame drag and a nudge call. */
  registerMover(mover: BoardMover | null): () => void {
    this.mover = mover;
    return () => {
      if (this.mover === mover) this.mover = null;
    };
  }

  getMover = (): BoardMover | null => this.mover;

  // ── the agent is working on an item (a tool call in flight) ──────────────

  /** Mark `id` as being worked on by an agent until the returned function runs. Calls nest. */
  beginAgentWork(id: string): () => void {
    this.agentWork.set(id, (this.agentWork.get(id) ?? 0) + 1);
    this.notifyAgentWork(id);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const n = (this.agentWork.get(id) ?? 1) - 1;
      if (n <= 0) this.agentWork.delete(id);
      else this.agentWork.set(id, n);
      this.notifyAgentWork(id);
    };
  }

  isAgentWorking = (id: string): boolean => (this.agentWork.get(id) ?? 0) > 0;

  subscribeAgentWork(id: string, l: Listener): () => void {
    let set = this.agentWorkListeners.get(id);
    if (!set) {
      set = new Set();
      this.agentWorkListeners.set(id, set);
    }
    set.add(l);
    return () => {
      set.delete(l);
      if (set.size === 0 && this.agentWorkListeners.get(id) === set) this.agentWorkListeners.delete(id);
    };
  }

  private notifyAgentWork(id: string): void {
    const ls = this.agentWorkListeners.get(id);
    if (ls) for (const l of [...ls]) l();
  }

  // ── interacting: the ONE tile whose content receives input natively ─────
  //
  // A tile is idle → selected (one click: move it from anywhere, the wheel
  // moves the board) → interacting (double-click, or a press on any control
  // inside it: type, scroll, select text, click natively). Esc steps back.
  // tldraw's "editing" state, Miro's embed "click to interact".

  getEditing = (): string | null => this.editing;

  setEditing(id: string | null): void {
    if (this.editing === id) return;
    this.editing = id;
    if (id !== null && !(this.selection.length === 1 && this.selection[0] === id)) {
      this.selection = [id];
      this.selectionSet = new Set([id]);
      for (const l of this.selectionListeners) l();
    }
    for (const l of this.editingListeners) l();
    this.recomputeLife();
  }

  subscribeEditing = (l: Listener): (() => void) => {
    this.editingListeners.add(l);
    return () => this.editingListeners.delete(l);
  };

  subscribeSelection = (l: Listener): (() => void) => {
    this.selectionListeners.add(l);
    return () => this.selectionListeners.delete(l);
  };

  // ── tile lifecycle (see `TileLife`) ──────────────────────────────────────

  getLife = (id: string): TileLife => this.life.get(id) ?? "live";

  subscribeLife(id: string, l: Listener): () => void {
    let set = this.lifeListeners.get(id);
    if (!set) {
      set = new Set();
      this.lifeListeners.set(id, set);
    }
    set.add(l);
    return () => {
      set.delete(l);
      if (set.size === 0 && this.lifeListeners.get(id) === set) this.lifeListeners.delete(id);
    };
  }

  /** Keep a tile live until the returned release is called (an agent reaching
   * it, a chat mid-reply). Holds nest. */
  holdAwake(id: string): () => void {
    this.holds.set(id, (this.holds.get(id) ?? 0) + 1);
    this.recomputeLife();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const n = (this.holds.get(id) ?? 1) - 1;
      if (n <= 0) this.holds.delete(id);
      else this.holds.set(id, n);
      this.recomputeLife();
    };
  }

  /** Is the tile needed right now (as opposed to merely remembered)? */
  private needed(id: string): boolean {
    // A multi-selection keeps nothing awake: ⌘A on a 100-tile board must not wake 100 bodies.
    if (this.focused === id || this.getSelected() === id || this.editing === id) return true;
    if ((this.holds.get(id) ?? 0) > 0) return true;
    return this.visible.has(id) && this.tier !== "overview";
  }

  /** Exposed for tests; normally driven by every coarse change and a timer. */
  recomputeLife(now = performance.now()): void {
    if (this.lifeTimer) {
      clearTimeout(this.lifeTimer);
      this.lifeTimer = null;
    }
    let nextDue = Infinity;
    const next = new Map<string, TileLife>();
    const resting: string[] = [];
    for (const id of this.items.keys()) {
      if (this.marks.has(id)) continue;
      if (this.needed(id)) {
        this.lastNeededAt.set(id, now);
        this.wasNeeded.add(id);
        next.set(id, "live");
        continue;
      }
      if (this.wasNeeded.delete(id)) this.lastNeededAt.set(id, now); // stopped being needed just now
      const since = this.lastNeededAt.get(id) ?? now;
      const due = since + FREEZE_AFTER_MS;
      if (now < due) {
        // Was needed a moment ago: stay as it is until the grace period ends.
        next.set(id, this.life.get(id) === "live" ? "live" : (this.life.get(id) ?? "live"));
        nextDue = Math.min(nextDue, due);
        continue;
      }
      if (this.life.get(id) === "discarded") next.set(id, "discarded");
      else resting.push(id);
    }
    // Warm budget: keep the most recently needed frozen tiles, discard the rest.
    resting.sort((a, b) => (this.lastNeededAt.get(b) ?? 0) - (this.lastNeededAt.get(a) ?? 0));
    const warm = [...next.values()].filter((v) => v === "frozen").length;
    resting.forEach((id, i) => next.set(id, warm + i < WARM_TILE_BUDGET ? "frozen" : "discarded"));
    for (const [id, state] of next) {
      if (this.life.get(id) === state) continue;
      this.life.set(id, state);
      const ls = this.lifeListeners.get(id);
      if (ls) for (const l of [...ls]) l();
    }
    if (nextDue !== Infinity) {
      this.lifeTimer = setTimeout(() => this.recomputeLife(), Math.max(0, nextDue - performance.now()) + 20);
    }
  }

  // ── focus mode: one tile fills the board area; Esc returns ───────────────

  // ── tool bar state: the active tool, layout guides ───────────────────────

  getTool = (): BoardTool => this.tool;

  setTool(tool: BoardTool): void {
    if (this.tool === tool) return;
    this.tool = tool;
    for (const l of this.uiListeners) l();
  }

  getGuides = (): boolean => this.guides;

  setGuides(on: boolean): void {
    if (this.guides === on) return;
    this.guides = on;
    for (const l of this.uiListeners) l();
    for (const l of this.frameListeners) l();
  }

  /** Snapping choices (smart guides, snap to grid) — the viewer's, see `snap-preference.ts`. */
  getSnapSettings = (): SnapSettings => this.snapSettings;

  setSnapSettings(next: Partial<SnapSettings>): void {
    const merged = { ...this.snapSettings, ...next };
    if (merged.smartGuides === this.snapSettings.smartGuides && merged.grid === this.snapSettings.grid) return;
    this.snapSettings = merged;
    if (!merged.smartGuides && this.snapOverlay) this.setSnapOverlay(null);
    for (const l of this.uiListeners) l();
    // The dot grid is drawn from the frame listener.
    for (const l of this.frameListeners) l();
  }

  /** The guide lines of the drag in flight; null when none. */
  getSnapOverlay = (): SnapOverlay | null => this.snapOverlay;

  setSnapOverlay(next: SnapOverlay | null): void {
    if (next === null && this.snapOverlay === null) return;
    this.snapOverlay = next;
    for (const l of this.snapOverlayListeners) l();
  }

  subscribeSnapOverlay = (l: Listener): (() => void) => {
    this.snapOverlayListeners.add(l);
    return () => this.snapOverlayListeners.delete(l);
  };

  subscribeUi = (l: Listener): (() => void) => {
    this.uiListeners.add(l);
    return () => this.uiListeners.delete(l);
  };

  setWheelMode(mode: WheelMode): void {
    this.wheel.mode = mode;
  }

  getFocused = (): string | null => this.focused;

  focus(id: string): void {
    if (!this.items.has(id) || id.startsWith("frame:") || this.marks.has(id)) return;
    if (this.focused === null) this.focusReturn = this.camera;
    this.focused = id;
    this.select(id);
    for (const l of this.focusListeners) l();
    this.recomputeLife();
  }

  unfocus(): void {
    if (this.focused === null) return;
    const id = this.focused;
    this.focused = null;
    for (const l of this.focusListeners) l();
    this.recomputeLife();
    // Return to where the person was — with the tile they looked at in view.
    const back = this.focusReturn;
    this.focusReturn = null;
    const rect = this.items.get(id);
    if (back && rect && rectsIntersect(rect, visibleWorldRect(back, this.size))) this.setCamera(back);
    else this.fitItem(id);
  }

  /** Step focus through tiles in reading order (top-to-bottom, left-to-right). */
  focusStep(dir: 1 | -1): void {
    const order = this.readingOrder();
    if (order.length === 0) return;
    const at = this.focused ? order.indexOf(this.focused) : -1;
    const next = order[(at + dir + order.length) % order.length];
    this.focus(next);
  }

  /** Tile ids (frames excluded) in reading order: rows by top edge, then x. */
  readingOrder(): string[] {
    const tiles = [...this.items.entries()].filter(([id]) => !id.startsWith("frame:") && !this.marks.has(id));
    const ROW_SLOP = 80;
    tiles.sort(([, a], [, b]) => (Math.abs(a.y - b.y) <= ROW_SLOP ? a.x - b.x : a.y - b.y));
    return tiles.map(([id]) => id);
  }

  subscribeFocus = (l: Listener): (() => void) => {
    this.focusListeners.add(l);
    return () => this.focusListeners.delete(l);
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
    this.recomputeLife();
  }
}
