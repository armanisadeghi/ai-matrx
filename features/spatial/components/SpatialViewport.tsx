"use client";

/**
 * SpatialViewport — the pannable, zoomable plane. Owns input and the ONE
 * world transform; knows nothing about what the tiles contain.
 *
 * Input (engine/wheel-input.ts decides what a scroll means):
 *   mouse wheel ................... zoom at cursor   pinch / ⌘-ctrl + scroll ... zoom
 *   trackpad two-finger swipe ..... pan              drag empty space ......... pan
 *   space + drag, middle drag ..... pan anywhere     shift+1 / shift+2 ........ fit all / selection
 *   shift+0 ....................... 100%             + / - .................... zoom
 *   enter ......................... focus selected   esc ...................... leave focus / tool, then deselect
 *   V H T F N P R O L ⇧L .......... tools (engine/tools.ts)   ⇧G ........... layout guides
 *   arrows ........................ nudge the view (in focus: previous / next tile)
 * The one exception to "scroll moves the board": the INTERACTING tile, under
 * the pointer, with room to scroll that way, scrolls itself.
 * Tiles: click selects (drag moves from anywhere), double-click or a press on a
 * control inside starts interacting (native input), Esc steps back out.
 *
 * The camera is written straight to the DOM (no React render per frame) and
 * mirrored into `#cam=x,y,z` so a view is a shareable link.
 */

import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { replaceAddressWithoutNavigating } from "@/lib/url-state/addressWithoutNavigating";
import {
  type Camera,
  cameraFromHash,
  cameraToHash,
  panBy,
  wheelZoomFactor,
  zoomAt,
} from "../engine/camera";
import { type Insets, SpatialStore } from "../engine/spatial-store";
import type { WheelMode } from "../engine/wheel-input";
import { isCreationTool, toolForKey } from "../engine/tools";
import { FocusHostContext, SpatialStoreContext } from "../engine/react";
import { FocusLayer } from "./FocusLayer";

const GRID_WORLD_PX = 24;
const HASH_THROTTLE_MS = 400;

interface SpatialViewportProps {
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
  onStore?: (store: SpatialStore) => void;
  className?: string;
}

export function SpatialViewport({
  initialCamera = { x: 0, y: 0, z: 0.6 },
  fitOnMount = true,
  children,
  overlay,
  insets,
  wheelMode = "auto",
  onStore,
  className,
}: SpatialViewportProps) {
  const [store] = useState(() => new SpatialStore(initialCamera));
  const [focusHost, setFocusHost] = useState<HTMLElement | null>(null);
  const { top = 0, right = 0, bottom = 0, left = 0 } = insets ?? {};
  useEffect(() => {
    store.setWheelMode(wheelMode);
  }, [store, wheelMode]);
  useEffect(() => onStore?.(store), [store, onStore]);
  useEffect(() => store.setInsets({ top, right, bottom, left }), [store, top, right, bottom, left]);
  const rootRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const zoomVarRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

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
      // `--spatial-z` drives counter-scaled labels. It lives on an INNER
      // element, never the world: an inline style carrying a custom property
      // makes every mutation of it (each pan frame's transform) restyle the
      // whole subtree. Written only when zoom moved ≥ 1.5%.
      if (Math.abs(z - writtenZ) / z >= 0.015) {
        writtenZ = z;
        zoomVar.style.setProperty("--spatial-z", String(z));
      }
      // Dot grid: one CSS background that fades out as it gets dense. A pan
      // moves it by TRANSFORM within one cell (compositor only); changing
      // background-position instead repaints the whole viewport every frame.
      const step = GRID_WORLD_PX * z;
      const shown = step >= 7 && store.getGuides();
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
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      store.setSize({ w: width, h: height });
      if (!fitted && store.getItems().size > 0) {
        fitted = true;
        store.fitAll();
      }
    });
    ro.observe(root);
    return () => ro.disconnect();
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

  // ── wheel (non-passive: we own the gesture) ──────────────────────────────
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      // Focus mode and chrome own their own scrolling.
      if (target?.closest("[data-spatial-focus], [data-spatial-chrome]")) return;
      const intent = store.wheel.intent(e);
      // THE ONE EXCEPTION: the selected tile, under the pointer, with room to
      // scroll in that direction, scrolls itself instead of moving the board.
      if (!(e.ctrlKey || e.metaKey) && selectedTileScrolls(e, store.getEditing())) return;
      e.preventDefault();
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

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping(e.target)) {
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

    const onDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // Only the bare plane starts a pan. Tiles, chrome and any control keep
      // their own pointer input — capturing it here would swallow their clicks.
      const onBackground = !(e.target as HTMLElement).closest(
        "[data-spatial-tile], [data-spatial-chrome], button, a, input, textarea, select, canvas",
      );
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        panning = false;
        return;
      }
      const onChrome = !!(e.target as HTMLElement).closest("[data-spatial-chrome]");
      const handTool = store.getTool() === "hand";
      // A creation tool owns a left-press on the board (the capture layer).
      const creating = isCreationTool(store.getTool()) && e.button === 0 && !spaceDown;
      if (
        !onChrome &&
        !creating &&
        (e.button === 1 || spaceDown || (e.button === 0 && (onBackground || handTool)))
      ) {
        panning = true;
        root.setPointerCapture(e.pointerId);
        root.style.cursor = "grabbing";
        if (onBackground && e.button === 0 && !spaceDown && !handTool) store.select(null);
        // Hand / space / middle pan wins over whatever is underneath (a tile
        // header would otherwise start dragging the tile).
        if (!onBackground) e.stopPropagation();
        e.preventDefault();
      }
    };
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
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
      if (panning) store.setCamera(panBy(store.getCamera(), next.x - prev.x, next.y - prev.y));
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDist = 0;
      if (panning && pointers.size === 0) {
        panning = false;
        root.style.cursor = spaceDown ? "grab" : toolCursor(store.getTool());
      }
    };

    root.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      root.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
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
      // Esc in a field inside a tile leaves the field (Figma), so the next
      // Esc and the board's keys work again without reaching for the mouse.
      if (e.key === "Escape" && isTyping(e.target)) {
        const el = e.target as HTMLElement;
        if (el.closest("[data-spatial-tile], [data-spatial-card]")) {
          el.blur();
          e.preventDefault();
        }
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
        store.focus(sel);
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
      else if (e.key.startsWith("Arrow")) {
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
    <SpatialStoreContext.Provider value={store}>
      <FocusHostContext.Provider value={focusHost}>
      <div
        ref={rootRef}
        className={cn(
          "relative h-full w-full touch-none select-none overflow-hidden bg-muted/40",
          className,
        )}
        aria-label="Spatial view — drag to pan, pinch or ctrl+scroll to zoom, shift+1 to fit everything"
        role="application"
      >
        <div
          ref={gridRef}
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -right-40 left-0 top-0 [background-image:radial-gradient(hsl(var(--muted-foreground)/0.28)_1px,transparent_1.2px)]"
        />
        {/* World items are absolutely placed in a zero-width box, so the
            global mobile rule `* { max-width: 100% }` (globals.css) would
            clamp every one of them to 0 — each spatial element opts out. */}
        <div ref={worldRef} className="absolute left-0 top-0 max-w-none origin-top-left">
          <div ref={zoomVarRef} className="max-w-none">
            {children}
          </div>
        </div>
        {overlay}
        <FocusLayer onHost={setFocusHost} />
      </div>
      </FocusHostContext.Provider>
    </SpatialStoreContext.Provider>
  );
}

function toolCursor(tool: string): string {
  if (tool === "hand") return "grab";
  if (tool === "select") return "";
  if (tool === "text") return "text";
  return "crosshair";
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/** True when the wheel should scroll the interacting tile's own content: the
 * pointer is inside the INTERACTING tile (or its focused card) and the nearest
 * scrollable element between the pointer and the tile has room to scroll that
 * way. Any scroll container counts — tile bodies need no special marker. */
function selectedTileScrolls(e: WheelEvent, selected: string | null): boolean {
  if (!selected) return false;
  const target = e.target as HTMLElement | null;
  const tile = target?.closest<HTMLElement>("[data-spatial-tile], [data-spatial-card]");
  const id = tile?.dataset.spatialTile ?? tile?.dataset.spatialCard;
  if (!tile || id !== selected) return false;
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
