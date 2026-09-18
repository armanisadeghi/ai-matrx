"use client";

// features/marketing/seo/topical-map/views/graph/nodes.tsx
//
// WHAT ONE NODE LOOKS LIKE in each band, and what a facet value looks like on
// the axis. These are BODIES: plain components with no xy-flow dependency at
// all. `GraphViewImpl` is the one module in this feature allowed to import
// React Flow (the reactFlowStaticImportBan in eslint.config.mjs), so it wraps
// each body with the `Handle`s the edges attach to and registers the pair in
// its `nodeTypes`. Keeping the bodies here means the drawing's appearance can
// be read, reviewed and changed without going near the canvas engine.
//
// 🚨 ARMAN, 2026-08-20 (`content-plan/components/SiteMap.tsx`): at the card
// band every topic is a REAL RECTANGULAR CARD WHOSE TITLE IS READABLE — it
// wraps, it is never truncated. `whitespace-normal break-words` below is that
// ruling, and `line-clamp` is deliberately absent from the card title.
//
// Every colour is a semantic token, so light and dark both work without a
// second palette.

import { ChevronRight, MoreHorizontal } from "lucide-react";

import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { hasPeek } from "@/features/organizations/peek/kinds-list";
import { cn } from "@/lib/utils";

import { TopicCounts } from "../../ui/TopicCounts";
import { TopicStatusMark } from "../../ui/TopicStatusMark";
import { intentColorClasses } from "../../ui/intentColorClasses";
import { isResolvedEntityRef, type EntityRef as MapEntityRef } from "../../types";
import type { GraphBand } from "./bands";
import type { FacetAxisValue } from "./facetAxis";

/** What every topic body is handed. Set by `GraphViewImpl`'s node builder. */
export interface TopicNodeBodyData {
  slug: string;
  name: string;
  status: string;
  depth: number;
  pageCount: number;
  plannedCount: number;
  keywordCount: number;
  /** The `fill` encoding's answer, or null when fill draws nothing. */
  fillTone: "status" | null;
  /** The convergence tone, when that mode is on and the answer is known. */
  convergenceColor: string | null;
  /** The `ring` encoding's answer: the topic's depth, or null. */
  ringTier: number | null;
  /** The `hue` encoding's answer: the grouped facet value's slug, or null. */
  hueKey: string | null;
  /** The `size` encoding's multiplier, 1 when size draws nothing. */
  scale: number;
  selected: boolean;
  /** False when the label would be smaller than the legibility floor. */
  showLabel: boolean;
}

/**
 * The ring by tier. Depth is a small integer, so the five steps cover every
 * tree anyone draws and the deepest one repeats rather than running out — a
 * ring that vanishes at depth 6 would say "this topic has no tier", which is
 * false.
 */
const TIER_RING = [
  "ring-primary/70",
  "ring-info/60",
  "ring-success/60",
  "ring-warning/60",
  "ring-muted-foreground/50",
] as const;

function tierRing(depth: number | null): string {
  if (depth === null) return "ring-border";
  return TIER_RING[Math.min(Math.max(depth, 0), TIER_RING.length - 1)];
}

/**
 * The hue by grouped facet value. Six chart tokens, chosen by a stable hash of
 * the value slug so the same region is the same colour on every render and on
 * every machine — a colour that moves when the sort order changes teaches the
 * person nothing.
 */
const HUE_BARS = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
  "bg-chart-6",
] as const;

function hueBar(key: string | null): string | null {
  if (!key) return null;
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) % 100000;
  }
  return HUE_BARS[hash % HUE_BARS.length];
}

/** The card/row background: convergence tone first, then the status tint. */
function fillClasses(data: TopicNodeBodyData): string {
  if (data.convergenceColor) {
    const classes = intentColorClasses(data.convergenceColor);
    // The dot classes carry the tone's own background AND border; at 10% they
    // tint a card without swallowing the text on either theme.
    return cn(classes.dot, "bg-opacity-10 dark:bg-opacity-20");
  }
  if (data.fillTone === "status" && data.status === "proposed") return "bg-info/10";
  return "bg-card";
}

function selectionRing(selected: boolean): string {
  return selected ? "ring-2 ring-offset-2 ring-offset-background ring-primary" : "";
}

function countsOf(data: TopicNodeBodyData) {
  // `map_graph` ALWAYS carries the three counts (they are computed in the
  // function body, not gated on an `include`), so `loaded` is honestly true
  // here — unlike a `map_tree` read without `include: ["counts"]`.
  return {
    loaded: true,
    pages: data.pageCount,
    planned: data.plannedCount,
    keywords: data.keywordCount,
  };
}

// ── The four bands ─────────────────────────────────────────────────────────

export function TopicCardBody({ data }: { data: TopicNodeBodyData }) {
  const hue = hueBar(data.hueKey);
  return (
    <div
      style={{ width: 240 * data.scale }}
      className={cn(
        "relative overflow-hidden rounded-xl border border-border p-3 text-left shadow-sm ring-1",
        fillClasses(data),
        tierRing(data.ringTier),
        selectionRing(data.selected),
      )}
    >
      {hue ? <span className={cn("absolute inset-y-0 left-0 w-1", hue)} aria-hidden /> : null}
      <div className="flex items-start gap-1.5 pl-1">
        {/* THE TITLE WRAPS AND IS NEVER TRUNCATED (Arman, 2026-08-20). */}
        <span className="min-w-0 whitespace-normal break-words text-[13px] font-semibold leading-snug text-foreground">
          {data.name}
        </span>
        <TopicStatusMark status={data.status} compact />
      </div>
      <div className="mt-2 pl-1">
        <TopicCounts counts={countsOf(data)} />
      </div>
    </div>
  );
}

export function TopicCompactBody({ data }: { data: TopicNodeBodyData }) {
  const hue = hueBar(data.hueKey);
  return (
    <div
      style={{ width: 200 * data.scale }}
      className={cn(
        "relative flex items-center gap-2 overflow-hidden rounded-lg border border-border px-2.5 py-1.5 ring-1",
        fillClasses(data),
        tierRing(data.ringTier),
        selectionRing(data.selected),
      )}
    >
      {hue ? <span className={cn("absolute inset-y-0 left-0 w-1", hue)} aria-hidden /> : null}
      {/* Two lines maximum, still WRAPPED — never an ellipsis that hides which
          topic this is. */}
      <span className="min-w-0 flex-1 whitespace-normal break-words pl-1 text-xs font-medium leading-tight text-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
        {data.name}
      </span>
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
        {data.pageCount}
      </span>
      <TopicStatusMark status={data.status} compact />
    </div>
  );
}

export function TopicLineBody({ data }: { data: TopicNodeBodyData }) {
  const diameter = 14 * data.scale;
  return (
    <div className="flex items-center gap-1.5">
      <span
        style={{ width: diameter, height: diameter }}
        className={cn(
          "shrink-0 rounded-full border border-border ring-1",
          fillClasses(data),
          tierRing(data.ringTier),
          selectionRing(data.selected),
        )}
      />
      {data.showLabel ? (
        <span className="max-w-[130px] whitespace-normal break-words text-[11px] leading-tight text-foreground">
          {data.name}
        </span>
      ) : null}
    </div>
  );
}

export function TopicShapeBody({ data }: { data: TopicNodeBodyData }) {
  const diameter = 14 * data.scale;
  const showLabel = data.showLabel || data.selected;
  return (
    <div className="group/shape relative flex items-center justify-center">
      <span
        style={{ width: diameter, height: diameter }}
        title={data.name}
        className={cn(
          "rounded-full border border-border ring-1",
          fillClasses(data),
          tierRing(data.ringTier),
          selectionRing(data.selected),
        )}
      />
      {/* The label is absent at this density, not fake: it comes back on hover
          and whenever this topic is the selected one. */}
      <span
        className={cn(
          "pointer-events-none absolute left-full top-1/2 z-10 ml-1.5 -translate-y-1/2 whitespace-nowrap rounded border border-border bg-card px-1.5 py-0.5 text-[10px] text-foreground shadow-sm",
          showLabel ? "opacity-100" : "opacity-0 group-hover/shape:opacity-100",
        )}
      >
        {data.name}
      </span>
    </div>
  );
}

export function TopicBody({ band, data }: { band: GraphBand; data: TopicNodeBodyData }) {
  switch (band) {
    case "card":
      return <TopicCardBody data={data} />;
    case "compact":
      return <TopicCompactBody data={data} />;
    case "line":
      return <TopicLineBody data={data} />;
    case "shape":
      return <TopicShapeBody data={data} />;
  }
}

// ── The facet axis ─────────────────────────────────────────────────────────

export interface FacetValueNodeBodyData {
  value: FacetAxisValue;
  /** The facet's label, for the honest name of the synthetic bucket. */
  facetLabel: string;
  /** Opens the outline filtered to this value — the door when there is no peek. */
  onFilter: () => void;
}

/**
 * One pill on the axis: the value's name, the number of visible topics it
 * reaches, and a DOOR.
 *
 * THE DOOR (no-dead-ends): when the value names an entity this app can peek,
 * the name is an `EntityRef` — peek and open-in-new-tab, the platform's own
 * doors. When it names nothing this app can open, the name is a control that
 * filters the outline to this value, which is a real action and not a label.
 * There is no third case where the name just sits there.
 */
export function FacetValueBody({ data }: { data: FacetValueNodeBodyData }) {
  const value = data.value;
  const ref: MapEntityRef | null = value.ref;
  const resolved = isResolvedEntityRef(ref) ? ref : null;
  const peekable = resolved ? hasPeek(resolved.type) : false;
  const label = value.isAll ? `No ${data.facetLabel} value` : value.name;

  return (
    <div
      className={cn(
        "flex w-[190px] items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs shadow-sm",
        value.topicIds.length === 0 && "opacity-60",
      )}
    >
      {resolved && peekable ? (
        <EntityRef
          token={resolved.type}
          id={resolved.id}
          name={resolved.label ?? label}
          className="min-w-0 flex-1 text-xs"
          fill
        />
      ) : (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            data.onFilter();
          }}
          title={`Show the topics with ${label} in the outline`}
          className="min-w-0 flex-1 truncate text-left text-foreground underline-offset-2 hover:text-primary hover:underline"
        >
          {label}
        </button>
      )}
      <span
        className="shrink-0 tabular-nums text-muted-foreground"
        title={`${value.topicIds.length} of the topics on screen`}
      >
        {value.topicIds.length}
      </span>
    </div>
  );
}

/** The "+N more" pill. Reveals the next step of values; never refuses the rest. */
export function FacetMoreBody({
  remaining,
  onReveal,
}: {
  remaining: number;
  onReveal: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onReveal();
      }}
      className="flex w-[190px] items-center justify-center gap-1.5 rounded-full border border-dashed border-border bg-card px-2.5 py-1 text-xs text-muted-foreground shadow-sm hover:border-primary hover:text-foreground"
    >
      <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
      {remaining} more
      <ChevronRight className="h-3 w-3" aria-hidden />
    </button>
  );
}
