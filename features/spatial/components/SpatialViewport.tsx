"use client";

/**
 * SpatialViewport — the pannable, zoomable plane. Owns input and the ONE
 * world transform; knows nothing about what the tiles contain.
 *
 * Conventions (Figma / FigJam / tldraw / Miro — users already know them):
 *   wheel / two-finger trackpad ... pan          ⌘/ctrl + wheel, pinch ... zoom at cursor
 *   drag empty space .............. pan          space + drag, middle drag ... pan anywhere
 *   shift+1 ....................... fit all      shift+2 ... fit selection
 *   shift+0 ....................... 100%         + / - ... zoom      arrows ... nudge
 *   esc ........................... deselect
 * Wheel over the SELECTED tile's scroll area scrolls that tile instead —
 * the one exception, so long content stays readable without leaving the plane.
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
import { SpatialStoreContext } from "../engine/react";

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
  className?: string;
}

export function SpatialViewport({
  initialCamera = { x: 0, y: 0, z: 0.6 },
  fitOnMount = true,
  children,
  overlay,
  insets,
  className,
}: SpatialViewportProps) {
  const [store] = useState(() => new SpatialStore(initialCamera));
  const { top = 0, right = 0, bottom = 0, left = 0 } = insets ?? {};
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
      const shown = step >= 7;
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
      if (!(e.ctrlKey || e.metaKey) && selectedTileScrolls(e, store.getSelected())) return;
      e.preventDefault();
      const bounds = root.getBoundingClientRect();
      const cam = store.getCamera();
      if (e.ctrlKey || e.metaKey) {
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
        root.style.cursor = "";
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
      if (!onChrome && (e.button === 1 || spaceDown || (e.button === 0 && onBackground))) {
        panning = true;
        root.setPointerCapture(e.pointerId);
        root.style.cursor = "grabbing";
        if (onBackground && e.button === 0 && !spaceDown) store.select(null);
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
        root.style.cursor = spaceDown ? "grab" : "";
      }
    };

    root.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      root.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [store]);

  // ── keyboard navigation ──────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const size = store.getSize();
      const cam = store.getCamera();
      const centre = (z: number) => store.flyTo(zoomAt(cam, size.w / 2, size.h / 2, z), 220);
      if (e.shiftKey && e.code === "Digit1") store.fitAll();
      else if (e.shiftKey && e.code === "Digit2") {
        const sel = store.getSelected();
        if (sel) store.fitItem(sel);
      } else if (e.shiftKey && e.code === "Digit0") centre(1);
      else if (e.key === "+" || e.key === "=") centre(cam.z * 1.25);
      else if (e.key === "-" || e.key === "_") centre(cam.z / 1.25);
      else if (e.key === "Escape") store.select(null);
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
      </div>
    </SpatialStoreContext.Provider>
  );
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/** True when the wheel should scroll the selected tile's own scroll area. */
function selectedTileScrolls(e: WheelEvent, selected: string | null): boolean {
  if (!selected) return false;
  const target = e.target as HTMLElement | null;
  const tile = target?.closest<HTMLElement>("[data-spatial-tile]");
  if (!tile || tile.dataset.spatialTile !== selected) return false;
  const scroller = target?.closest<HTMLElement>("[data-spatial-scroll]");
  if (!scroller) return false;
  const down = e.deltaY > 0;
  return down
    ? scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1
    : scroller.scrollTop > 0;
}
