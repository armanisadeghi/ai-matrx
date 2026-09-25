"use client";

/**
 * Non-stream tile bodies: agent-generated HTML, images, video. Each honours
 * the pace tier in the way that fits its medium.
 *
 * HTML — a sandboxed iframe (`allow-scripts`, NO `allow-same-origin`: the
 * page runs, but in an opaque origin with no access to the app, its cookies
 * or its storage). It is laid out at a fixed design width and scaled to the
 * tile, so the page renders exactly as authored at any tile size. It is inert
 * (pointer-events off) until its tile is selected — the Claude Design "PLAY"
 * pattern — so dragging across the board never gets swallowed by a page.
 * Off-screen the iframe unloads after a grace period; it reloads on return.
 *
 * Video — pauses whenever it is culled or reduced to an overview card.
 */

import { useEffect, useRef, useState } from "react";
import { MousePointerClick } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaceTier } from "../engine/lod";

const HTML_DESIGN_WIDTH = 1280;
const UNLOAD_AFTER_MS = 20_000;

export function HtmlTileBody({
  src,
  srcDoc,
  title,
  tier,
  active,
}: {
  src?: string;
  srcDoc?: string;
  title: string;
  tier: PaceTier;
  /** The tile is selected: the page receives pointer input. */
  active: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  // True once the page has been out of view long enough to unload. Derived
  // with `tier` below, so returning to view reloads without an effect write.
  const [expired, setExpired] = useState(false);
  const loaded = tier !== "offscreen" || !expired;

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / HTML_DESIGN_WIDTH));
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (tier !== "offscreen") return;
    const t = setTimeout(() => setExpired(true), UNLOAD_AFTER_MS);
    return () => {
      clearTimeout(t);
      setExpired(false);
    };
  }, [tier]);

  return (
    <div ref={boxRef} className="relative h-full overflow-hidden bg-background">
      {loaded ? (
        <iframe
          title={title}
          src={src}
          srcDoc={srcDoc}
          sandbox="allow-scripts"
          loading="lazy"
          className={cn("absolute left-0 top-0 max-w-none origin-top-left border-0", !active && "pointer-events-none")}
          style={{
            width: HTML_DESIGN_WIDTH,
            height: `${100 / scale}%`,
            transform: `scale(${scale})`,
          }}
        />
      ) : (
        <p className="p-4 text-xs text-muted-foreground">Unloaded while out of view — reloads when you return.</p>
      )}
      {!active && tier === "read" && (
        <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-foreground/80 px-2.5 py-1 text-[11px] font-medium text-background">
          <MousePointerClick className="h-3 w-3" />
          Click to interact
        </div>
      )}
    </div>
  );
}

export function ImageTileBody({ src, alt }: { src: string; alt: string }) {
  return (
    // A plain <img>: the camera scales it, so next/image's viewport-based
    // `sizes` would pick the wrong resolution.
    <img src={src} alt={alt} draggable={false} className="h-full w-full object-cover" />
  );
}

export function VideoTileBody({ src, tier }: { src: string; tier: PaceTier }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (tier === "offscreen" || tier === "overview") v.pause();
  }, [tier]);
  return <video ref={ref} src={src} controls playsInline className="h-full w-full bg-black object-contain" />;
}
