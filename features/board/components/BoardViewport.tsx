"use client";

/**
 * BoardViewport — the pannable, zoomable plane. Owns input and the ONE
 * world transform; knows nothing about what the tiles contain.
 *
 * Input (engine/wheel-input.ts decides what a scroll means):
 *   mouse wheel ................... zoom at cursor   pinch / ⌘-ctrl + scroll ... zoom
 *   trackpad two-finger swipe ..... pan              drag empty space ......... marquee-select (a finger pans)
 *   shift/⌘-click a tile .......... add / remove     ⌘A ....................... select all
 *   space + drag, middle drag ..... pan anywhere     shift+1 / shift+2 ........ fit all / selection
 *   shift+0 ....................... 100%             + / - .................... zoom
 *   enter ......................... focus selected   esc ...................... leave focus / tool, then deselect
 *   V H T F N P R O L ⇧L .......... tools (engine/tools.ts)   ⇧G ........... layout guides
 *   ⌘' / Ctrl+' ................... snap to grid      hold ⌘ / Ctrl / Alt while dragging ... no snapping
 *   arrows ........................ nudge the selection (shift ×10); nothing selected: move the view
 *                                   (in focus: previous / next tile)
 * Scroll over a TILE never moves the board (engine/wheel-input.ts `routeWheel`):
 * content that can scroll scrolls, content that can't doesn't. Pinch and
 * ctrl/⌘+scroll zoom the board everywhere, tiles included (Figma).
 * Tiles: click selects (drag moves from anywhere), double-click or a press on a
 * control inside starts interacting (native input), Esc steps back out.
 *
 * The camera is written straight to the DOM (no React render per frame) and
 * mirrored into `#cam=x,y,z` so a view is a shareable link.
 */

import { useTileNavigationGuard } from "../engine/tile-navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { type EditableCaret, subscribeEditableCaret } from "@ai-matrx/rich-content/selection-toolbar/selection-zones";
import { replaceAddressWithoutNavigating } from "@/lib/url-state/addressWithoutNavigating";
import {
  type Camera,
  cameraFromHash,
  cameraShowsContent,
  cameraToHash,
  panBy,
  screenToWorld,
  wheelZoomFactor,
  zoomAt,
} from "../engine/camera";
import { type Insets, BoardCameraStore, cameraIsUnreadable } from "../engine/camera-store";
import { type WheelMode, routeWheel } from "../engine/wheel-input";
import { isCreationTool, toolForKey } from "../engine/tools";
import { boardOwnsKey, isTyping } from "../engine/key-target";
import { isAccidentalScroll } from "../engine/native-scroll";
import { type ScreenRect, clipToVisible, panToReveal, shouldReveal } from "../engine/reveal";
import { FocusHostContext, BoardCameraStoreContext } from "../engine/react";
import { FocusLayer } from "./FocusLayer";
import { SnapGuidesLayer } from "./SnapGuidesLayer";
import { SelectionBox } from "./SelectionBox";
import { allSelectable, boundsOf, groupMoveSet, marqueeHits, rectFromCorners, shiftMoves } from "../engine/selection";
import { startPointerGesture } from "../engine/pointer-gesture";
import { claimLoadFocus } from "../engine/claim-load-focus";
import { beginSnap } from "../engine/snap-gesture";
import { GRID_SIZE } from "../engine/snapping";
import { loadSnapSettings, saveSnapSettings } from "../engine/snap-preference";

/** A view smaller than this in either direction is still laying out: the first fit waits. */
const MIN_FIT_VIEW = 160;

const HASH_THROTTLE_MS = 400;
/** Screen px kept between a revealed element and the board's edge. */
const REVEAL_MARGIN_PX = 24;
const REVEAL_MS = 140;
const REVEAL_SETTLE_MS = 700;
/** World px an arrow key nudges the selection (shift: ×10); with snap to grid, one grid cell. */
const NUDGE_PX = 8;
/** Screen px a press must travel before it is a marquee rather than a click. */
const MARQUEE_SLOP_PX = 3;
/** Screen px a press may miss a thin stroke by and still select it. */
const SHAPE_HIT_SLOP_PX = 6;
/** What a press on these never reaches a shape under it through. */
const NOT_THROUGH_TO_SHAPES =
  "[data-board-chrome], [data-board-resize], [data-board-shape-editor], [data-board-focus], [data-board-creation], [data-board-marquee]";

interface BoardViewportProps {
  initialCamera?: Camera;
  /** Fit every registered item once the first layout lands (ignored when the
   * URL carries a camera). */
  fitOnMount?: boolean;
  children: ReactNode;
  /** Chrome drawn over the plane in screen space (HUD, minimap, toolbars). */
  overlay?: ReactNode;
  /** Screen px the overlay covers on each edge; fits keep content clear of it. */
  insets?: Partial<Insets>;
  /** What a scroll does (see `engine/wheel-input.ts`). Default "auto". */
  wheelMode?: WheelMode;
  /** Receives the store once, for hosts that drive the camera or focus. */
  onStore?: (store: BoardCameraStore) => void;
  /** A double-click on empty board, at this WORLD point (the host places plain text there). */
  onEmptyDoubleClick?: (at: { x: number; y: number }) => void;
  className?: string;
}

export function BoardViewport({
  initialCamera = { x: 0, y: 0, z: 0.6 },
  fitOnMount = true,
  children,
  overlay,
  insets,
  wheelMode = "auto",
  onStore,
  onEmptyDoubleClick,
  className,
}: BoardViewportProps) {
  const [store] = useState(() => new BoardCameraStore(initialCamera));
  // Read at the moment of the double-click (the listener is bound once per store).
  const onEmptyDoubleClickRef = useRef(onEmptyDoubleClick);
  useEffect(() => {
    onEmptyDoubleClickRef.current = onEmptyDoubleClick;
  });
  // A tile's content never navigates the board away (engine/tile-navigation.tsx).
  useTileNavigationGuard();
  const [focusHost, setFocusHost] = useState<HTMLElement | null>(null);
  const { top = 0, right = 0, bottom = 0, left = 0 } = insets ?? {};
  useEffect(() => {
    store.setWheelMode(wheelMode);
  }, [store, wheelMode]);
  // The viewer's snapping choices (smart guides, snap to grid): read once on
  // mount, written on every change — the same browser-only home as wheelMode.
  useEffect(() => {
    store.setSnapSettings(loadSnapSettings());
    let saved = store.getSnapSettings();
    return store.subscribeUi(() => {
      const now = store.getSnapSettings();
      if (now === saved) return;
      saved = now;
      saveSnapSettings(now);
    });
  }, [store]);
  useEffect(() => onStore?.(store), [store, onStore]);
  useEffect(() => store.setInsets({ top, right, bottom, left }), [store, top, right, bottom, left]);
  const rootRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const zoomVarRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);

  // ── frame listener: camera → DOM ─────────────────────────────────────────
  useEffect(() => {
    const world = worldRef.current;
    const zoomVar = zoomVarRef.current;
    const grid = gridRef.current;
    if (!world || !zoomVar || !grid) return;
    let writtenZ = 0;
    let writtenWillChange = "";
    const apply = () => {
      const { x, y, z } = store.getCamera();
      world.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${z})`;
      // Only on a real flip: `will-change: transform` changes the containing
      // block for every descendant, so each write restyles the subtree.
      const willChange = store.isInteracting() ? "transform" : "auto";
      if (willChange !== writtenWillChange) {
        writtenWillChange = willChange;
        world.style.willChange = willChange;
      }
      // `--board-z` drives counter-scaled labels. It lives on an INNER
      // element, never the world: an inline style carrying a custom property
      // makes every mutation of it (each pan frame's transform) restyle the
      // whole subtree. Written only when zoom moved ≥ 1.5%.
      if (Math.abs(z - writtenZ) / z >= 0.015) {
        writtenZ = z;
        zoomVar.style.setProperty("--board-z", String(z));
      }
      // Dot grid: one CSS background that fades out as it gets dense. A pan
      // moves it by TRANSFORM within one cell (compositor only); changing
      // background-position instead repaints the whole viewport every frame.
      const step = GRID_SIZE * z;
      const shown = step >= 7 && (store.getGuides() || store.getSnapSettings().grid);
      grid.style.opacity = shown ? String(Math.min(1, (step - 7) / 10)) : "0";
      const size = `${step}px ${step}px`;
      if (grid.style.backgroundSize !== size) grid.style.backgroundSize = size;
      const ox = (((x % step) + step) % step) - step;
      const oy = (((y % step) + step) % step) - step;
      grid.style.transform = `translate3d(${ox}px, ${oy}px, 0)`;
    };
    apply();
    return store.subscribeFrame(apply);
  }, [store]);

  // ── size + initial camera ────────────────────────────────────────────────
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const fromUrl = cameraFromHash(window.location.hash);
    let fitted = !!fromUrl || !fitOnMount;
    if (fromUrl) store.setCamera(fromUrl);
    // The first fit waits for the view to hold still: a board mounted in a pane that is still laying out is
    // measured a few px wide first, and fitting then lands at the minimum zoom (5%) and SAVES it.
    const tryFit = () => {
      const { w, h } = store.getSize();
      if (!fitted && w > MIN_FIT_VIEW && h > MIN_FIT_VIEW && store.getItems().size > 0) {
        fitted = true;
        store.fitOpening();
      }
    };
    let settled: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      store.setSize({ w: width, h: height });
      if (fitted) return;
      if (settled) clearTimeout(settled);
      settled = setTimeout(() => {
        settled = null;
        tryFit();
      }, 120);
    });
    ro.observe(root);
    // Tiles register after the first layout: fit when the first ones arrive, not only on a resize.
    // Deferred one tick so every tile of the same commit has registered before the fit measures them.
    let tick: ReturnType<typeof setTimeout> | null = null;
    const offItems = store.subscribeItems(() => {
      if (fitted || tick) return;
      tick = setTimeout(() => {
        tick = null;
        tryFit();
      }, 0);
    });

    // A restored or linked camera that shows none of the content (a view saved before the tiles
    // moved, a stale link) is "lost in space": once the tiles have settled, fit to content instead.
    // Skipped when the person has already moved the camera themselves.
    const restored = fitted;
    const applied = store.getCamera();
    let settle: ReturnType<typeof setTimeout> | null = null;
    let checked = false;
    const checkLost = () => {
      const items = [...store.getItems().values()];
      if (checked || items.length === 0) return;
      if (store.getSize().w <= 1) return settleSoon();
      checked = true;
      if (store.getCamera() === applied && (!cameraShowsContent(applied, store.getSize(), items) || cameraIsUnreadable(applied, store.getSize()))) store.fitOpening();
    };
    const settleSoon = () => {
      if (settle) clearTimeout(settle);
      settle = setTimeout(checkLost, 350);
    };
    // Tiles register in their own effects, which run before this one: check once now as well as on every change.
    if (restored) settleSoon();
    const offLost = restored ? store.subscribeItems(settleSoon) : () => undefined;
    return () => {
      ro.disconnect();
      offItems();
      offLost();
      if (tick) clearTimeout(tick);
      if (settled) clearTimeout(settled);
      if (settle) clearTimeout(settle);
    };
  }, [store, fitOnMount]);

  // ── camera → URL hash ────────────────────────────────────────────────────
  // Throttled, not debounced: the address trails the camera by at most
  // HASH_THROTTLE_MS, so a reload right after a move keeps it (by `pagehide`
  // the browser has already chosen the URL to reload). 400ms stays under
  // Safari's ~100 replaceState calls per 30s.
  useEffect(() => {
    let last = 0;
    let t: ReturnType<typeof setTimeout> | null = null;
    const write = () => {
      t = null;
      last = performance.now();
      replaceAddressWithoutNavigating(
        `${window.location.pathname}${window.location.search}#${cameraToHash(store.getCamera())}`,
      );
    };
    const unsub = store.subscribeFrame(() => {
      if (t) return;
      t = setTimeout(write, Math.max(0, HASH_THROTTLE_MS - (performance.now() - last)));
    });
    return () => {
      unsub();
      if (t) clearTimeout(t);
    };
  }, [store]);

  // ── the board never scrolls natively (engine/native-scroll.ts) ──────────
  // focus() / scrollIntoView() inside a tile can scroll the clipped board
  // root, the pane it sits in, or a tile card; only the camera moves the
  // board, so any such scroll is put straight back.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onScroll = (e: Event) => {
      const el = e.target;
      if (!(el instanceof Element) || !isAccidentalScroll(el, root)) return;
      if (el.scrollLeft !== 0) el.scrollLeft = 0;
      if (el.scrollTop !== 0) el.scrollTop = 0;
    };
    document.addEventListener("scroll", onScroll, true);
    return () => document.removeEventListener("scroll", onScroll, true);
  }, []);

  // ── what has focus stays on screen (engine/reveal.ts) ────────────────────
  // What a native scroll would have done, the camera does: keyboard focus (a
  // grid cell, find-next) or an editor caret moving off the visible board
  // pans by the smallest amount, never a zoom. Not for a click's focus, and
  // not while a pointer is down (drag, pan, pinch).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const down = new Set<number>();
    let pressedAt = -Infinity;
    let keyAt = -Infinity;
    const onKey = () => {
      keyAt = performance.now();
    };
    let frame = 0;
    let recheck: ReturnType<typeof setTimeout> | undefined;
    // A grid or editor often scrolls its own content to the focused element
    // a frame or two AFTER focus moves (and smooth scrolling keeps moving
    // it), so for a short window after a keyboard focus change the reveal
    // re-runs on those scrolls. Outside the window a scroll is the person's
    // own and never drags the board.
    let settleUntil = 0;
    let settling: { el: Node; measure: () => ScreenRect | null } | null = null;
    const onDown = (e: PointerEvent) => {
      down.add(e.pointerId);
      pressedAt = performance.now();
    };
    const onUp = (e: PointerEvent) => {
      down.delete(e.pointerId);
    };
    // The smallest camera pan that brings `r` inside the visible board.
    const panInto = (r: ScreenRect | null, animate: boolean) => {
      if (!r || (r.right - r.left === 0 && r.bottom - r.top === 0)) return;
      const box = root.getBoundingClientRect();
      const inset = store.getInsets();
      const { dx, dy } = panToReveal(
        r,
        { left: box.left + inset.left, top: box.top + inset.top, right: box.right - inset.right, bottom: box.bottom - inset.bottom },
        REVEAL_MARGIN_PX,
      );
      if (dx === 0 && dy === 0) return;
      const next = panBy(store.getCamera(), dx, dy);
      if (animate) store.flyTo(next, REVEAL_MS);
      else store.setCamera(next);
    };
    // What of `rect` the content inside the tile lets anyone see: clipped by
    // every non-visible-overflow box between it and the tile (its own grid
    // scroller, the card). A cell hidden past a grid's edge is the grid's to
    // scroll, not the camera's to chase.
    const visible = (host: Element | null, rect: ScreenRect | null): ScreenRect | null => {
      if (!host || !rect) return rect;
      const clips: ScreenRect[] = [];
      for (let el = host.parentElement; el && !el.matches("[data-board-tile]"); el = el.parentElement) {
        const st = getComputedStyle(el);
        if (st.overflowX !== "visible" || st.overflowY !== "visible") clips.push(el.getBoundingClientRect());
      }
      return clipToVisible(rect, clips);
    };
    const reveal = (from: Node | null, measure: () => ScreenRect | null) => {
      const el = from instanceof Element ? from : from?.parentElement ?? null;
      const inTile = !!el && root.contains(el) && !!el.closest("[data-board-tile]");
      const now = performance.now();
      if (!shouldReveal({ inTile, pointersDown: down.size, msSincePress: now - pressedAt, msSinceKey: now - keyAt })) return;
      if (from) {
        settling = { el: from, measure };
        settleUntil = performance.now() + REVEAL_SETTLE_MS;
      }
      cancelAnimationFrame(frame);
      // After layout settles (a grid scrolls its own cell into view first).
      frame = requestAnimationFrame(() => {
        panInto(measure(), true);
      });
      // Once more after the flight lands: content that re-laid itself out
      // meanwhile (a virtualised grid) is caught without a scroll event.
      clearTimeout(recheck);
      const mine = settling;
      recheck = setTimeout(() => {
        if (settling === mine && down.size === 0) panInto(measure(), false);
      }, REVEAL_MS + 120);
    };
    const onContentScroll = (e: Event) => {
      if (!settling || performance.now() > settleUntil) return;
      const target = e.target;
      if (!(target instanceof Element) || !target.contains(settling.el)) return;
      const { measure } = settling;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        panInto(measure(), false);
      });
    };
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as Element | null;
      reveal(el, () => visible(el, el?.getBoundingClientRect() ?? null));
    };
    // The caret comes from the ONE selection listener (the selection toolbar root).
    const onCaret = ({ node, host, rect }: EditableCaret) => {
      reveal(node, () => visible(host, rect()));
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
    window.addEventListener("keydown", onKey, true);
    root.addEventListener("focusin", onFocusIn);
    const stopCaret = subscribeEditableCaret(onCaret);
    document.addEventListener("scroll", onContentScroll, true);
    return () => {
      document.removeEventListener("scroll", onContentScroll, true);
      cancelAnimationFrame(frame);
      clearTimeout(recheck);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      root.removeEventListener("focusin", onFocusIn);
      stopCaret();
    };
  }, [store]);

  // ── wheel (non-passive: we own the gesture) ──────────────────────────────
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      const tile = target?.closest<HTMLElement>("[data-board-tile], [data-board-card]") ?? null;
      const route = routeWheel({
        // Focus mode and chrome own their own scrolling.
        overChrome: !!target?.closest("[data-board-focus], [data-board-chrome]"),
        overTile: !!tile,
        zoomGesture: e.ctrlKey || e.metaKey,
        innerCanScroll: !!tile && contentScrolls(e, tile),
      });
      if (route === "ignore" || route === "native") return;
      // "block": over a tile that cannot scroll this way — nothing moves, and
      // the scroll must not chain out to the page.
      e.preventDefault();
      if (route === "block") return;
      const intent = store.wheel.intent(e);
      const bounds = root.getBoundingClientRect();
      const cam = store.getCamera();
      if (intent === "zoom") {
        const sx = e.clientX - bounds.left;
        const sy = e.clientY - bounds.top;
        store.setCamera(zoomAt(cam, sx, sy, cam.z * wheelZoomFactor(e.deltaY, e.deltaMode)));
        return;
      }
      const unit = e.deltaMode === 1 ? 16 : 1;
      const dx = e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX;
      const dy = e.shiftKey && e.deltaX === 0 ? 0 : e.deltaY;
      store.setCamera(panBy(cam, -dx * unit, -dy * unit));
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, [store]);

  // ── pointer: drag-pan + two-finger pinch ─────────────────────────────────
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let panning = false;
    let pinchDist = 0;
    let spaceDown = false;
    // A select-tool drag on empty board draws a marquee (Figma / tldraw); a finger still pans.
    let marquee: {
      pointerId: number;
      sx: number;
      sy: number;
      start: { x: number; y: number };
      base: readonly string[];
      drawn: boolean;
    } | null = null;
    const endMarquee = () => {
      marquee = null;
      const el = marqueeRef.current;
      if (el) el.style.display = "none";
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && boardOwnsKey(e.target)) {
        spaceDown = true;
        root.style.cursor = "grab";
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceDown = false;
        root.style.cursor = toolCursor(store.getTool());
      }
    };

    // The board takes the keyboard on any press inside it: a composer or field OUTSIDE the board
    // (the chat beside it, focused since the page loaded) never keeps Delete / ⌘Z / typing from a
    // canvas interaction. A press on a control inside a tile still moves focus there natively.
    const takeKeyboard = () => {
      const active = document.activeElement;
      if (active === root || (active instanceof Node && root.contains(active))) return;
      if (active instanceof HTMLElement) active.blur();
      root.focus({ preventScroll: true });
    };

    const stopClaim = claimLoadFocus(root);

    // A press on a drawn shape (tldraw / FigJam): select it — shift / ⌘ add or remove — and drag
    // the selection with smart guides, ONE undo step; a click in a group narrows to it.
    let shapeGesture: (() => void) | null = null;
    const pressShape = (e: PointerEvent, id: string) => {
      // Leave the field you were typing in (a tile's input, an editor): Delete, ⌘Z and the tool
      // keys now act on the drawing, never type into the tile (Figma).
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== root && root.contains(active)) {
        active.blur();
        root.focus({ preventScroll: true });
      }
      const additive = e.shiftKey || e.metaKey;
      const inGroup = store.isSelected(id) && store.getSelection().length > 1;
      // A second click on the one selected sticky / text types in it (FigJam).
      const soleBefore = store.getSelection().length === 1 && store.isSelected(id);
      if (additive) {
        store.toggleSelected(id);
        if (!store.isSelected(id)) return;
      } else if (!store.isSelected(id)) store.select(id);
      if (store.getEditing() && store.getEditing() !== id) store.setEditing(null);
      const mover = store.getMover();
      const set = groupMoveSet(store.getSelection(), store.getItems());
      const box = boundsOf(set.values());
      const px = e.clientX;
      const py = e.clientY;
      let moved = false;
      const snap = mover && box ? beginSnap(store, new Set(set.keys())) : null;
      shapeGesture?.();
      shapeGesture = startPointerGesture(e, root, {
        onMove: (m) => {
          if (!mover || !box || !snap) return;
          if (!moved && Math.hypot(m.clientX - px, m.clientY - py) < MARQUEE_SLOP_PX) return;
          moved = true;
          const z = store.getCamera().z;
          const at = snap.move({ ...box, x: box.x + (m.clientX - px) / z, y: box.y + (m.clientY - py) / z }, m);
          mover.dragMany(shiftMoves(set, at.x - box.x, at.y - box.y));
        },
        onEnd: (how) => {
          shapeGesture = null;
          snap?.end();
          if (how === "escape" && moved && mover) mover.dragMany(shiftMoves(set, 0, 0));
          else if (how === "up" && !moved && !additive && inGroup) store.select(id);
          else if (how === "up" && !moved && !additive && soleBefore && store.getShapeHost()?.clickEdits?.(id)) store.setEditing(id);
        },
      });
    };
    const shapeAt = (e: { clientX: number; clientY: number }, background: boolean): string | null => {
      const host = store.getShapeHost();
      if (!host) return null;
      const bounds = root.getBoundingClientRect();
      const cam = store.getCamera();
      return host.hit(screenToWorld(cam, e.clientX - bounds.left, e.clientY - bounds.top), SHAPE_HIT_SLOP_PX / cam.z, {
        background,
      });
    };

    const onDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // Only the bare plane starts a pan. Tiles, chrome and any control keep
      // their own pointer input — capturing it here would swallow their clicks.
      const onBackground = !(e.target as HTMLElement).closest(
        "[data-board-tile], [data-board-chrome], [data-board-frame-strip], [data-board-frame-border], [data-board-resize], button, a, input, textarea, select, canvas",
      );
      if (!(e.target as HTMLElement).closest("[data-board-chrome], [data-board-focus]")) takeKeyboard();
      // Drawings sit ABOVE tiles: a press on a stroke or a filled body selects the drawing even
      // over a tile; a hollow interior counts only on empty board (the tile under it wins).
      if (
        pointers.size === 1 &&
        e.button === 0 &&
        !e.ctrlKey &&
        !spaceDown &&
        store.getTool() === "select" &&
        !(e.target as HTMLElement).closest(NOT_THROUGH_TO_SHAPES)
      ) {
        const hit = shapeAt(e, onBackground);
        if (hit) {
          e.stopPropagation();
          e.preventDefault();
          pressShape(e, hit);
          return;
        }
      }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        panning = false;
        endMarquee();
        return;
      }
      const onChrome = !!(e.target as HTMLElement).closest("[data-board-chrome]");
      const handTool = store.getTool() === "hand";
      // A creation tool owns a left-press on the board (the capture layer).
      const creating = isCreationTool(store.getTool()) && e.button === 0 && !spaceDown;
      const selectTool = store.getTool() === "select";
      if (
        !onChrome &&
        !creating &&
        onBackground &&
        selectTool &&
        e.button === 0 &&
        !spaceDown &&
        e.pointerType !== "touch" &&
        pointers.size === 1
      ) {
        const additive = e.shiftKey || e.metaKey;
        if (!additive) store.select(null);
        const active = document.activeElement;
        if (active instanceof HTMLElement && active.closest("[data-board-tile], [data-board-card]")) active.blur();
        const bounds = root.getBoundingClientRect();
        const sx = e.clientX - bounds.left;
        const sy = e.clientY - bounds.top;
        marquee = {
          pointerId: e.pointerId,
          sx,
          sy,
          start: screenToWorld(store.getCamera(), sx, sy),
          base: additive ? store.getSelection() : [],
          drawn: false,
        };
        root.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
      if (
        !onChrome &&
        !creating &&
        (e.button === 1 || spaceDown || (e.button === 0 && (onBackground || handTool)))
      ) {
        panning = true;
        root.setPointerCapture(e.pointerId);
        root.style.cursor = "grabbing";
        if (onBackground && e.button === 0 && !spaceDown && !handTool) {
          store.select(null);
          // A press on the empty board leaves the tile you were typing in
          // (Figma): the capture below keeps the browser from moving focus, so
          // ⌘Z would otherwise still undo inside that tile's editor.
          const active = document.activeElement;
          if (active instanceof HTMLElement && active.closest("[data-board-tile], [data-board-card]")) active.blur();
        }
        // Hand / space / middle pan wins over whatever is underneath (a tile
        // header would otherwise start dragging the tile).
        if (!onBackground) e.stopPropagation();
        e.preventDefault();
      }
    };
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      // A mouse whose button is up was released somewhere we never heard
      // (over an iframe, outside the window): end the press here, never pan on.
      if (e.pointerType === "mouse" && e.buttons === 0) {
        onUp(e);
        return;
      }
      const next = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, next);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const bounds = root.getBoundingClientRect();
        const cx = (a.x + b.x) / 2 - bounds.left;
        const cy = (a.y + b.y) / 2 - bounds.top;
        const cam = store.getCamera();
        if (pinchDist > 0) store.setCamera(zoomAt(cam, cx, cy, cam.z * (dist / pinchDist)));
        pinchDist = dist;
        return;
      }
      if (marquee && marquee.pointerId === e.pointerId) {
        const bounds = root.getBoundingClientRect();
        const sx = next.x - bounds.left;
        const sy = next.y - bounds.top;
        if (!marquee.drawn && Math.hypot(sx - marquee.sx, sy - marquee.sy) < MARQUEE_SLOP_PX) return;
        marquee.drawn = true;
        const el = marqueeRef.current;
        if (el) {
          el.style.display = "";
          el.style.left = `${Math.min(sx, marquee.sx)}px`;
          el.style.top = `${Math.min(sy, marquee.sy)}px`;
          el.style.width = `${Math.abs(sx - marquee.sx)}px`;
          el.style.height = `${Math.abs(sy - marquee.sy)}px`;
        }
        const area = rectFromCorners(marquee.start, screenToWorld(store.getCamera(), sx, sy));
        const hits = marqueeHits(area, store.getItems(), marquee.start);
        store.setSelection(marquee.base.length ? [...marquee.base, ...hits] : hits);
        return;
      }
      if (panning) store.setCamera(panBy(store.getCamera(), next.x - prev.x, next.y - prev.y));
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (marquee && marquee.pointerId === e.pointerId) endMarquee();
      if (pointers.size < 2) pinchDist = 0;
      if (panning && pointers.size === 0) {
        panning = false;
        root.style.cursor = spaceDown ? "grab" : toolCursor(store.getTool());
      }
    };

    // The window losing focus mid-press ends every press (its release goes elsewhere).
    const onBlur = () => {
      pointers.clear();
      endMarquee();
      pinchDist = 0;
      if (panning) {
        panning = false;
        root.style.cursor = spaceDown ? "grab" : toolCursor(store.getTool());
      }
    };

    // Double-click a rectangle or oval: type in it (FigJam). The press captured the pointer, so
    // the dblclick lands on the root — read the point, not the target.
    const onDoubleClick = (e: MouseEvent) => {
      if (store.getTool() !== "select" || (e.target as HTMLElement).closest(NOT_THROUGH_TO_SHAPES)) return;
      const onBackground = !(e.target as HTMLElement).closest("[data-board-tile], [data-board-frame-strip]");
      const hit = shapeAt(e, onBackground);
      if (!hit) {
        // Double-click on EMPTY board: plain text right there (tldraw / Figma).
        const empty = onBackground && !(e.target as HTMLElement).closest("[data-board-chrome]");
        const onEmpty = onEmptyDoubleClickRef.current;
        if (!empty || !onEmpty) return;
        e.preventDefault();
        e.stopPropagation();
        const bounds = root.getBoundingClientRect();
        onEmpty(screenToWorld(store.getCamera(), e.clientX - bounds.left, e.clientY - bounds.top));
        return;
      }
      if (!store.getShapeHost()?.editable(hit)) return;
      e.preventDefault();
      e.stopPropagation();
      store.select(hit);
      store.setEditing(hit);
    };

    root.addEventListener("pointerdown", onDown, true);
    root.addEventListener("dblclick", onDoubleClick, true);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      stopClaim();
      shapeGesture?.();
      root.removeEventListener("pointerdown", onDown, true);
      root.removeEventListener("dblclick", onDoubleClick, true);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [store]);

  // ── cursor follows the tool ──────────────────────────────────────────────
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const apply = () => {
      root.style.cursor = toolCursor(store.getTool());
    };
    apply();
    return store.subscribeUi(apply);
  }, [store]);

  // ── keyboard navigation ──────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Esc in the board's own chrome (a toolbar popover closing) is that chrome's — it never
      // also deselects or leaves the tool.
      if (e.key === "Escape" && (e.target as HTMLElement | null)?.closest?.("[data-board-chrome]")) return;
      // Esc in a field inside a tile leaves the field (Figma), so the next
      // Esc and the board's keys work again without reaching for the mouse.
      if (e.key === "Escape" && isTyping(e.target)) {
        const el = e.target as HTMLElement;
        if (el.closest("[data-board-tile], [data-board-card]")) {
          el.blur();
          e.preventDefault();
        }
        return;
      }
      // A key inside a tile's content (a grid cell, an editor, a control)
      // belongs to that content: Enter there never opens full screen.
      if (e.key !== "Escape" && !boardOwnsKey(e.target)) return;
      // ⌘A / Ctrl+A — select every tile and frame on the board.
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.code === "KeyA" && !isTyping(e.target)) {
        if (store.getEditing() && !store.getFocused()) return; // the tile's content owns ⌘A
        e.preventDefault();
        store.setSelection(allSelectable(store.getItems()));
        return;
      }
      // ⌘' / Ctrl+' — snap to grid (tldraw's grid shortcut; ⇧G is Layout guides).
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.code === "Quote" && !isTyping(e.target)) {
        e.preventDefault();
        store.setSnapSettings({ grid: !store.getSnapSettings().grid });
        return;
      }
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      // While a tile is interacting its content owns the keyboard (lists,
      // players, editors) — the board answers only Esc, which steps back out.
      if (store.getEditing() && !store.getFocused()) {
        if (e.key === "Escape") {
          store.setEditing(null);
          e.preventDefault();
        }
        return;
      }
      const size = store.getSize();
      const cam = store.getCamera();
      const centre = (z: number) => store.flyTo(zoomAt(cam, size.w / 2, size.h / 2, z), 220);
      const focused = store.getFocused();
      if (focused) {
        if (e.key === "Escape") store.unfocus();
        else if (e.key === "ArrowRight" || e.key === "ArrowDown") store.focusStep(1);
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") store.focusStep(-1);
        else return;
        e.preventDefault();
        return;
      }
      const tool = e.shiftKey && e.code !== "KeyL" ? null : toolForKey(e);
      if (tool) {
        store.setTool(tool);
      } else if (e.key === "Enter" && !e.shiftKey) {
        const sel = store.getSelected();
        if (!sel) return;
        // A drawing has no full screen: Enter types in a rectangle or oval (FigJam).
        if (store.isMark(sel)) {
          if (!store.getShapeHost()?.editable(sel)) return;
          store.setEditing(sel);
        } else store.focus(sel);
      } else if (e.shiftKey && e.code === "KeyG") store.setGuides(!store.getGuides());
      else if (e.shiftKey && e.code === "Digit1") store.fitAll();
      else if (e.shiftKey && e.code === "Digit2") {
        const sel = store.getSelected();
        if (sel) store.fitItem(sel);
      } else if (e.shiftKey && e.code === "Digit0") centre(1);
      else if (e.key === "+" || e.key === "=") centre(cam.z * 1.25);
      else if (e.key === "-" || e.key === "_") centre(cam.z / 1.25);
      else if (e.key === "Escape") {
        if (store.getTool() !== "select") store.setTool("select");
        else store.select(null);
      }
      else if (e.key.startsWith("Arrow") && store.getSelection().length > 0 && store.getMover()) {
        // Nudge the selection (Figma): one step, shift ×10; one grid cell with snap to grid.
        // Successive nudges are one undo step (`dragMany` coalesces like a drag).
        const unit = (store.getSnapSettings().grid ? GRID_SIZE : NUDGE_PX) * (e.shiftKey ? 10 : 1);
        const d = { ArrowLeft: [-unit, 0], ArrowRight: [unit, 0], ArrowUp: [0, -unit], ArrowDown: [0, unit] }[e.key];
        if (!d) return;
        const set = groupMoveSet(store.getSelection(), store.getItems());
        if (set.size === 0) return;
        store.getMover()!.dragMany(shiftMoves(set, d[0], d[1]));
      } else if (e.key.startsWith("Arrow")) {
        const step = e.shiftKey ? 320 : 80;
        const d = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[
          e.key
        ];
        if (!d) return;
        store.flyTo(panBy(cam, d[0], d[1]), 160);
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);

  return (
    <BoardCameraStoreContext.Provider value={store}>
      <FocusHostContext.Provider value={focusHost}>
      <div
        ref={rootRef}
        className={cn(
          "relative h-full w-full touch-none select-none overflow-clip bg-muted/40 outline-none",
          className,
        )}
        aria-label="Board — drag to pan, pinch or ctrl+scroll to zoom, shift+1 to fit everything"
        role="application"
        data-board-root
        tabIndex={-1}
      >
        <div
          ref={gridRef}
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -right-40 left-0 top-0 max-w-none [background-image:radial-gradient(hsl(var(--muted-foreground)/0.28)_1px,transparent_1.2px)]"
        />
        {/* World items are absolutely placed in a zero-width box, so the
            global mobile rule `* { max-width: 100% }` (globals.css) would
            clamp every one of them to 0 — each Board element opts out. */}
        <div ref={worldRef} className="absolute left-0 top-0 max-w-none origin-top-left">
          <div ref={zoomVarRef} className="max-w-none">
            {children}
            <SelectionBox />
            <SnapGuidesLayer />
          </div>
        </div>
        <div
          ref={marqueeRef}
          data-board-marquee
          aria-hidden
          className="pointer-events-none absolute z-[100000] rounded-sm border border-primary bg-primary/10"
          style={{ display: "none" }}
        />
        {overlay}
        <FocusLayer onHost={setFocusHost} />
      </div>
      </FocusHostContext.Provider>
    </BoardCameraStoreContext.Provider>
  );
}

function toolCursor(tool: string): string {
  if (tool === "hand") return "grab";
  if (tool === "select") return "";
  if (tool === "text") return "text";
  return "crosshair";
}

/**
 * True when the key belongs to a text field, so the board must not act on it (Space pans, letters
 * pick tools). A field is not only an input or a contenteditable: Monaco (the file tile's editor)
 * types into an EditContext host — a plain div with `editContext` set — and ARIA editors expose
 * `role="textbox"`. Missing those ate every space typed into a file.
 */

/** True when some scroll container between the pointer and the tile has room
 * to scroll in the wheel's direction. Any scroll container counts — tile
 * bodies need no special marker. */
function contentScrolls(e: WheelEvent, tile: HTMLElement): boolean {
  const target = e.target as HTMLElement | null;
  const vertical = Math.abs(e.deltaY) >= Math.abs(e.deltaX);
  const delta = vertical ? e.deltaY : e.deltaX;
  for (let el: HTMLElement | null = target; el && el !== tile.parentElement; el = el.parentElement) {
    const style = getComputedStyle(el);
    const overflow = vertical ? style.overflowY : style.overflowX;
    if (overflow !== "auto" && overflow !== "scroll") continue;
    if (vertical) {
      if (delta > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
    } else if (delta > 0 ? el.scrollLeft + el.clientWidth < el.scrollWidth - 1 : el.scrollLeft > 0) return true;
  }
  return false;
}
