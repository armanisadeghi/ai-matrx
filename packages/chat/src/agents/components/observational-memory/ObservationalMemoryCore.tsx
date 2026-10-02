"use client";

/**
 * ObservationalMemoryCore
 *
 * Complete, self-contained observational-memory inspector for a single
 * conversation. Composes the five building blocks:
 *
 *   1. MemoryOverviewCard      — persisted state + degraded status
 *   2. MemoryControls          — admin toggle, model override, scope
 *   3. MemoryCostCard          — server rollup + live counters + breakdown
 *   4. MemoryEventTimeline     — streamed memory_* events (live)
 *   5. MemoryStateInspector    — raw cx_observational_memory row
 *
 * The component works whether rendered inside the Creator Panel (compact)
 * or inside a full window panel (wide) — no layout assumptions baked in.
 */

import React from "react";
import { cn } from "@/lib/utils";
import { MemoryOverviewCard } from "./components/MemoryOverviewCard";
import { MemoryCostCard } from "./components/MemoryCostCard";
import { MemoryEventTimeline } from "./components/MemoryEventTimeline";
import { MemoryStateInspector } from "./components/MemoryStateInspector";
import { MemoryControls } from "./components/MemoryControls";

type SectionId = "overview" | "controls" | "cost" | "timeline" | "state";

interface ObservationalMemoryCoreProps {
  conversationId: string;
  /** Which sections to render. Defaults to all. */
  sections?: ReadonlyArray<SectionId>;
  /** Layout variant — `split` is best inside wide window panels. */
  layout?: "stacked" | "split";
  className?: string;
}

const DEFAULT_SECTIONS: ReadonlyArray<SectionId> = [
  "overview",
  "controls",
  "cost",
  "timeline",
  "state",
];

export function ObservationalMemoryCore({
  conversationId,
  sections = DEFAULT_SECTIONS,
  layout = "stacked",
  className,
}: ObservationalMemoryCoreProps) {
  const has = (id: SectionId) => sections.includes(id);

  if (layout === "split") {
    // Two-column layout — status/controls/cost on the left, timeline + state
    // inspector on the right. Good for wide windows ≥ 900px.
    return (
      <div
        className={cn(
          "flex flex-col lg:flex-row min-h-0 h-full gap-3 p-3",
          className,
        )}
      >
        <div className="flex flex-col gap-3 lg:w-[360px] lg:shrink-0 min-w-0">
          {has("overview") && (
            <MemoryOverviewCard conversationId={conversationId} />
          )}
          {has("controls") && (
            <div className="rounded-md border border-border bg-card/60 p-3">
              <MemoryControls conversationId={conversationId} />
            </div>
          )}
          {has("cost") && <MemoryCostCard conversationId={conversationId} />}
        </div>

        <div className="flex flex-col gap-3 flex-1 min-w-0 min-h-0">
          {has("timeline") && (
            <MemoryEventTimeline
              conversationId={conversationId}
              className="min-h-[180px] max-h-[40%]"
            />
          )}
          {has("state") && (
            <MemoryStateInspector
              conversationId={conversationId}
              className="flex-1"
            />
          )}
        </div>
      </div>
    );
  }

  // Stacked: single-column, everything flows top-down. Best for narrow
  // windows or embedded inside the Creator Panel.
  return (
    <div className={cn("flex flex-col gap-3 p-3 min-h-0", className)}>
      {has("overview") && (
        <MemoryOverviewCard conversationId={conversationId} />
      )}
      {has("controls") && (
        <div className="rounded-md border border-border bg-card/60 p-3">
          <MemoryControls conversationId={conversationId} />
        </div>
      )}
      {has("cost") && <MemoryCostCard conversationId={conversationId} />}
      {has("timeline") && (
        <MemoryEventTimeline
          conversationId={conversationId}
          className="min-h-[200px]"
        />
      )}
      {has("state") && (
        <MemoryStateInspector
          conversationId={conversationId}
          className="min-h-[260px]"
        />
      )}
    </div>
  );
}
