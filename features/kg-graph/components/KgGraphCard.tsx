// features/kg-graph/components/KgGraphCard.tsx
//
// A small, zoomed-out PREVIEW of an org's or scope's knowledge graph, made to
// sit as a card on the org / scope detail pages. Design goals (per product):
//   - cheap: a lightweight SVG (NOT a full cytoscape instance) — a card only
//     needs the biggest dozen-ish nodes plus decorative filler circles.
//   - lazy + polite: fetches only once it scrolls into view (IntersectionObserver),
//     after the rest of the page, and shares a cached/deduped call (graphPreview).
//   - no jarring loader: while loading it shows a clean, generic "fake" graph of
//     the same shape, then fades in the real top-N.
//   - clickable: opens the full, filtered graph.
//
// The layout is deterministic phyllotaxis (sunflower) — biggest/most-important
// nodes pack toward the centre, filler circles spiral out — so it always looks
// like a real graph without a layout engine.

"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Network } from "lucide-react";

import { cn } from "@/utils/cn";
import { colorForKind } from "../constants";
import { fetchGraphPreview, type PreviewFilter } from "../service/graphPreview";
import type { GraphNode } from "../types";

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
// Taller, fuller canvas: an elliptical spiral spreads to fill the card's width
// AND height (a graph wants vertical room, not a wide letterbox).
const VIEW_W = 160;
const VIEW_H = 100;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;
const REAL_MAX = 14; // how many real nodes to show
const FILLER = 22; // decorative circles around them
const MAX_RX = 70; // spiral radius (x)
const MAX_RY = 44; // spiral radius (y)

interface Pt {
  x: number;
  y: number;
}

// Sunflower layout: point i at radius ∝ sqrt(i), angle = i·golden. i=0 → centre.
// Elliptical (rx≠ry) so it fills the card instead of a centred circle.
function phyllotaxis(count: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < count; i++) {
    const t = Math.sqrt((i + 0.4) / count);
    const a = i * GOLDEN;
    pts.push({ x: CX + t * MAX_RX * Math.cos(a), y: CY + t * MAX_RY * Math.sin(a) });
  }
  return pts;
}

export interface KgGraphCardProps {
  variant: "org" | "scope";
  /** Org id (org variant) or scope id (scope variant). */
  id: string;
  /** Org slug-or-id — needed in the graph route for the scope picker's context. */
  orgSlugOrId?: string | null;
  title?: string;
  className?: string;
}

export function KgGraphCard({
  variant,
  id,
  orgSlugOrId = null,
  title = "Knowledge graph",
  className,
}: KgGraphCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLButtonElement | null>(null);
  const started = useRef(false);
  const [nodes, setNodes] = useState<GraphNode[] | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );

  const filter: PreviewFilter = useMemo(
    () => ({ kind: variant, id }),
    [variant, id],
  );
  const filterKey = `${variant}:${id}`;

  const href = useMemo(() => {
    const p = new URLSearchParams();
    if (variant === "org") {
      p.set("org", orgSlugOrId ?? id);
    } else {
      if (orgSlugOrId) p.set("org", orgSlugOrId);
      p.set("scope", id);
    }
    return `/knowledge-graph?${p.toString()}`;
  }, [variant, id, orgSlugOrId]);

  // Lazy: fetch only when the card scrolls into view (after the page settles).
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    started.current = false;
    const controller = new AbortController();
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || started.current) return;
        started.current = true;
        io.disconnect();
        setStatus("loading");
        fetchGraphPreview(filter, REAL_MAX, { signal: controller.signal })
          .then((data) => {
            setNodes(data.nodes);
            setStatus("ready");
          })
          .catch(() => {
            if (!controller.signal.aborted) setStatus("error");
          });
      },
      { rootMargin: "120px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      controller.abort();
    };
  }, [filter, filterKey]);

  const real = (nodes ?? []).slice(0, REAL_MAX);
  const isLoaded = status === "ready" && real.length > 0;
  const isEmpty = status === "ready" && real.length === 0;

  // Positions for real + filler nodes in one spiral (real first → near centre).
  const positions = useMemo(
    () => phyllotaxis((isLoaded ? real.length : REAL_MAX) + FILLER),
    [isLoaded, real.length],
  );

  const open = () => startTransition(() => router.push(href));

  return (
    <button
      ref={ref}
      type="button"
      onClick={open}
      className={cn(
        "group relative block w-full overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-primary/50",
        isPending && "opacity-70",
        className,
      )}
      aria-label={`Open ${title}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Network className="h-3.5 w-3.5 text-primary" />
          {title}
        </span>
        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-primary" />
      </div>

      <div className="relative bg-textured">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className={cn(
            "h-56 w-full transition-opacity duration-500",
            !isLoaded && "opacity-60",
            status === "loading" && "animate-pulse",
          )}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-hidden
        >
          {/* faint spokes from the top node — graph-like, decorative */}
          {positions.slice(1, 7).map((p, i) => (
            <line
              key={`e${i}`}
              x1={positions[0].x}
              y1={positions[0].y}
              x2={p.x}
              y2={p.y}
              stroke="currentColor"
              strokeWidth={0.4}
              className="text-muted-foreground/30"
            />
          ))}
          {positions.map((p, i) => {
            const isReal = isLoaded && i < real.length;
            const r = Math.max(1.4, 5.2 - (i / positions.length) * 4);
            const fill = isReal ? colorForKind(real[i].kind) : undefined;
            return (
              <circle
                key={`n${i}`}
                cx={p.x}
                cy={p.y}
                r={r}
                fill={fill ?? "currentColor"}
                className={cn(
                  !isReal && "text-muted-foreground/25",
                  isReal && "drop-shadow-sm",
                )}
                opacity={isReal ? 1 : 0.5}
              />
            );
          })}
        </svg>

        {/* Overlay caption */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between px-3 py-1.5 text-[10px] text-muted-foreground">
          {status === "loading" ? (
            <span>Loading preview…</span>
          ) : isEmpty ? (
            <span>No graph data yet</span>
          ) : isLoaded ? (
            <span className="truncate">
              {real
                .slice(0, 3)
                .map((n) => n.name)
                .join(" · ")}
            </span>
          ) : status === "error" ? (
            <span>Preview unavailable — open the full graph</span>
          ) : (
            <span>&nbsp;</span>
          )}
          <span className="shrink-0 font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
            Open graph
          </span>
        </div>
      </div>
    </button>
  );
}
