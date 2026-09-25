"use client";

/**
 * Screen-space chrome over the plane: the zoom HUD (zoom %, the live detail
 * tier, fit / zoom controls) and the minimap. Both read the camera through
 * frame listeners and write their own DOM — neither re-renders per frame.
 */

import { useEffect, useRef } from "react";
import { Maximize, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { screenToWorld, unionRects, visibleWorldRect, zoomAt } from "../engine/camera";
import { TIER_LABEL } from "../engine/lod";
import { useDetailTier, useSpatialStore } from "../engine/react";

export function ZoomHud({ className }: { className?: string }) {
  const store = useSpatialStore();
  const tier = useDetailTier();
  const pctRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const button = pctRef.current;
    if (!button) return;
    // Update ONE text node's value, and only when the number changes.
    // `textContent =` replaces the node — an insertion — and the shell's
    // `:has()` rules turn every insertion into a whole-document restyle,
    // which on a pan is every frame.
    const text = document.createTextNode("");
    button.replaceChildren(text);
    const apply = () => {
      const next = `${Math.round(store.getCamera().z * 100)}%`;
      if (text.nodeValue !== next) text.nodeValue = next;
    };
    apply();
    return store.subscribeFrame(apply);
  }, [store]);

  const zoomBy = (f: number) => {
    const { w, h } = store.getSize();
    const cam = store.getCamera();
    store.flyTo(zoomAt(cam, w / 2, h / 2, cam.z * f), 220);
  };

  return (
    <div
      data-spatial-chrome
      className={cn(
        "absolute bottom-4 left-4 flex items-center gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-md backdrop-blur",
        className,
      )}
    >
      <HudButton label="Zoom out (-)" onClick={() => zoomBy(1 / 1.25)}>
        <Minus className="h-4 w-4" />
      </HudButton>
      <button
        ref={pctRef}
        type="button"
        onClick={() => zoomBy(1 / store.getCamera().z)}
        title="Reset to 100% (shift+0)"
        className="min-w-14 rounded-md px-2 py-1 text-center font-mono text-xs tabular-nums text-foreground hover:bg-accent"
      />
      <HudButton label="Zoom in (+)" onClick={() => zoomBy(1.25)}>
        <Plus className="h-4 w-4" />
      </HudButton>
      <HudButton label="Fit everything (shift+1)" onClick={() => store.fitAll()}>
        <Maximize className="h-4 w-4" />
      </HudButton>
      <span className="ml-1 hidden border-l border-border pl-2 pr-1 text-xs text-muted-foreground md:inline">
        {TIER_LABEL[tier]}
      </span>
    </div>
  );
}

function HudButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}

const MINIMAP_W = 200;
const MINIMAP_H = 132;

/** Minimap: every item as a block, the viewport as a frame. Click or drag to
 * move the camera there. Drawn on a 2D canvas — it is a picture of the board,
 * not a second board. */
export function Minimap({ className }: { className?: string }) {
  const store = useSpatialStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = MINIMAP_W * dpr;
    canvas.height = MINIMAP_H * dpr;
    let frame: number | null = null;
    // Theme colours, read once per second — getComputedStyle forces a style
    // flush, which per frame costs every pan frame a full-board restyle.
    let colours = { frame: "", tile: "", view: "" };
    const readColours = () => {
      const st = getComputedStyle(canvas);
      colours = {
        frame: st.getPropertyValue("--mm-frame"),
        tile: st.getPropertyValue("--mm-tile"),
        view: st.getPropertyValue("--mm-view"),
      };
    };
    readColours();

    const draw = () => {
      frame = null;
      const items = [...store.getItems().entries()];
      const view = visibleWorldRect(store.getCamera(), store.getSize());
      const bounds = unionRects([...items.map(([, r]) => r), view]);
      if (!bounds) return;
      const pad = 8;
      const s = Math.min((MINIMAP_W - pad * 2) / bounds.w, (MINIMAP_H - pad * 2) / bounds.h);
      const ox = pad + (MINIMAP_W - pad * 2 - bounds.w * s) / 2 - bounds.x * s;
      const oy = pad + (MINIMAP_H - pad * 2 - bounds.h * s) / 2 - bounds.y * s;
      canvasTransform.set(canvas, { s, ox, oy });
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, MINIMAP_W, MINIMAP_H);
      for (const [id, r] of items) {
        const isFrame = id.startsWith("frame:");
        ctx.fillStyle = isFrame ? colours.frame : colours.tile;
        ctx.fillRect(ox + r.x * s, oy + r.y * s, Math.max(1, r.w * s), Math.max(1, r.h * s));
      }
      ctx.strokeStyle = colours.view;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(ox + view.x * s, oy + view.y * s, view.w * s, view.h * s);
    };
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(draw);
    };
    schedule();
    const unsub = store.subscribeFrame(schedule);
    const interval = setInterval(() => {
      readColours(); // theme may have flipped
      schedule(); // tiles moved / added
    }, 1000);
    return () => {
      unsub();
      clearInterval(interval);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [store]);

  const moveTo = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const t = canvasTransform.get(e.currentTarget);
    if (!t) return;
    const r = e.currentTarget.getBoundingClientRect();
    const wx = (e.clientX - r.left - t.ox) / t.s;
    const wy = (e.clientY - r.top - t.oy) / t.s;
    const cam = store.getCamera();
    const { w, h } = store.getSize();
    const centre = screenToWorld(cam, w / 2, h / 2);
    store.setCamera({ ...cam, x: cam.x - (wx - centre.x) * cam.z, y: cam.y - (wy - centre.y) * cam.z });
  };

  return (
    <canvas
      ref={canvasRef}
      data-spatial-chrome
      aria-label="Minimap — click to move the view"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        moveTo(e);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) moveTo(e);
      }}
      className={cn(
        "absolute bottom-4 right-4 hidden cursor-crosshair rounded-lg border border-border bg-card/95 shadow-md backdrop-blur md:block",
        "[--mm-frame:hsl(var(--muted-foreground)/0.12)] [--mm-tile:hsl(var(--muted-foreground)/0.45)] [--mm-view:hsl(var(--primary))]",
        className,
      )}
      style={{ width: MINIMAP_W, height: MINIMAP_H }}
    />
  );
}

const canvasTransform = new WeakMap<HTMLCanvasElement, { s: number; ox: number; oy: number }>();
