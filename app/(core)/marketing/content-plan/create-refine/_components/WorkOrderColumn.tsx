"use client";

/**
 * Column 2 — the WORK ORDER: counts you can tune, the readiness of what is
 * already planned, and the foundation the shape demands.
 *
 * Every count row keeps a FIXED footprint (label block + coverage + stepper) so
 * typing a new number never reflows the column — the jitter that makes a
 * numbers UI feel broken.
 */
import { Minus, Plus, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { humanizeKey, type ExpandedArchetype } from "../_lib/archetypes";
import type { PlanReadiness } from "../_lib/readiness";
import { PanelSection, Stat } from "./PanelSection";

const MAX_COUNT = 500;

export function WorkOrderColumn({
  expanded,
  readiness,
  dirtyKeys,
  onCountChange,
  onResetCounts,
  pageTypeName,
}: {
  expanded: ExpandedArchetype;
  readiness: PlanReadiness;
  dirtyKeys: Set<string>;
  onCountChange: (familyKey: string, next: number) => void;
  onResetCounts: () => void;
  pageTypeName: (slug: string | null) => string;
}) {
  const coreDone = readiness.corePages.filter((page) => page.present).length;

  return (
    <div className="flex flex-col gap-5 p-4 md:h-full md:min-h-0 md:overflow-y-auto">
      <PanelSection title="Work order">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-stretch">
          <Stat value={expanded.pageCount} label="pages in shape" tone="primary" />
          <Stat value={readiness.liveNodeCount} label="pages planned" />
          <Stat value={readiness.missingRoutes.length} label="still missing" />
          <Stat
            value={readiness.extraRoutes.length}
            label="beyond the shape"
            tone="muted"
          />
        </div>
      </PanelSection>

      <PanelSection
        title="Counts"
        action={
          dirtyKeys.size > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1.5 px-2 text-xs"
              onClick={onResetCounts}
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </Button>
          ) : null
        }
      >
        {expanded.families.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            This shape has no repeating families — only its core pages.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {expanded.families.map((family) => {
              const coverage = readiness.families.find(
                (item) => item.key === family.key,
              );
              const planned = coverage?.planned ?? 0;
              const pct =
                family.count > 0
                  ? Math.min(100, Math.round((planned / family.count) * 100))
                  : 0;
              const dirty = dirtyKeys.has(family.key);
              return (
                <li
                  key={family.key}
                  className="flex items-center gap-3 bg-card px-2.5 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {family.label}
                      </span>
                      {family.materialize === "count_only" ? (
                        <span
                          className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground"
                          title="Only the hub page is created — the individual titles come from research, not a template."
                        >
                          count only
                        </span>
                      ) : null}
                      {dirty ? (
                        <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[11px] font-medium leading-none text-primary">
                          changed
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                      <span className="truncate">{family.route}/…</span>
                      <span className="truncate">
                        {pageTypeName(family.childPageType)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div
                        className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
                        role="presentation"
                      >
                        <div
                          className={cn(
                            "h-full rounded-full transition-[width]",
                            pct >= 100 ? "bg-success" : "bg-primary",
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-16 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                        {planned}/{family.count}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      aria-label={`One fewer ${family.label}`}
                      disabled={family.count <= 0}
                      onClick={() =>
                        onCountChange(family.key, Math.max(0, family.count - 1))
                      }
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={MAX_COUNT}
                      value={family.count}
                      aria-label={`${family.label} count`}
                      onChange={(event) => {
                        const parsed = Number.parseInt(event.target.value, 10);
                        if (Number.isNaN(parsed)) return onCountChange(family.key, 0);
                        onCountChange(
                          family.key,
                          Math.max(0, Math.min(MAX_COUNT, parsed)),
                        );
                      }}
                      /* 16px on mobile: anything smaller makes iOS zoom the page on focus. */
                      className="h-7 w-16 px-1.5 text-center text-base tabular-nums sm:text-sm"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      aria-label={`One more ${family.label}`}
                      disabled={family.count >= MAX_COUNT}
                      onClick={() => onCountChange(family.key, family.count + 1)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </PanelSection>

      <PanelSection title={`Core pages · ${coreDone} of ${readiness.corePages.length} planned`}>
        <ul className="flex flex-wrap gap-1.5">
          {readiness.corePages.map((page) => (
            <li
              key={page.route}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
                page.present
                  ? "border-success/40 bg-success/10 text-foreground"
                  : "border-dashed border-border text-muted-foreground",
              )}
            >
              <span className="font-medium">{page.label}</span>
              <span className="font-mono text-[11px] opacity-70">
                {page.route}
              </span>
            </li>
          ))}
        </ul>
      </PanelSection>

      <PanelSection title="Foundation this shape demands">
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
          {expanded.foundation.map((item) => (
            <li
              key={item.key}
              className="flex items-center gap-3 bg-card px-2.5 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {item.label}
              </span>
              {item.declaredAs.startsWith("=") ? (
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {item.declaredAs}
                </span>
              ) : null}
              <span className="w-10 shrink-0 text-right font-mono text-sm tabular-nums text-foreground">
                {item.required}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Counts propagate — {humanizeKey("service_icon")} follows the Services
          count. Whether each one is actually built lives in the CMS database,
          which this screen does not read, so nothing here is marked done from a
          guess.
        </p>
      </PanelSection>

      <PanelSection title="Depth of what is planned">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-stretch">
          <Stat
            value={readiness.liveNodeCount - readiness.nodesWithoutBrief}
            label="have a brief"
          />
          <Stat
            value={readiness.liveNodeCount - readiness.nodesWithoutKeyword}
            label="have a keyword"
          />
          <Stat value={readiness.nodesWithoutBrief} label="brief missing" tone="muted" />
          <Stat
            value={readiness.nodesWithoutKeyword}
            label="keyword missing"
            tone="muted"
          />
        </div>
      </PanelSection>
    </div>
  );
}
