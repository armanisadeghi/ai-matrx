"use client";

/**
 * The coverage scoreboard — the thing that pays for fallback.
 *
 * FALLBACK-MANDATES.md § The cost: "fallback ships WITH a coverage scoreboard,
 * or it does not ship", and "Admin UI shows the counts AND THE ROWS — red and
 * orange, with numbers, not buried in a detail page."
 *
 * So this component is deliberately two halves: three counted, click-to-filter
 * tiles, and — directly beneath them, never behind a click — every unmet and
 * every fallback row, named, with its issue sentence. Green is silent: it is a
 * tile and nothing more.
 *
 * Shape follows the surfaces readiness rollup
 * (features/surfaces/components/SurfacesContainer.tsx:359-403) — same tile
 * grammar, same click-to-filter, same aria-pressed.
 */

import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CoverageState, PreviewJob, PrincipalScope } from "./mock-data";
import { COVERAGE_META, HolderChip } from "./preview-ui";

const TILE_ORDER: readonly CoverageState[] = ["met", "fallback", "unmet"];

export function CoverageScoreboard({
  jobs,
  scope,
  counts,
  activeFilter,
  onFilterChange,
  onOpenJob,
}: {
  jobs: readonly PreviewJob[];
  scope: PrincipalScope;
  counts: Record<CoverageState, number>;
  activeFilter: CoverageState | null;
  onFilterChange: (next: CoverageState | null) => void;
  onOpenJob: (jobId: string) => void;
}) {
  const loudRows = jobs.filter((job) => {
    const at = job.altitudes[scope];
    return at ? at.coverage !== "met" : false;
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {TILE_ORDER.map((state) => {
          const meta = COVERAGE_META[state];
          const Icon = meta.icon;
          const active = activeFilter === state;
          return (
            <button
              key={state}
              type="button"
              aria-pressed={active}
              title={`${meta.description} — click to ${active ? "clear the" : "filter by this"} coverage filter`}
              onClick={() => onFilterChange(active ? null : state)}
              className={cn(
                "flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                meta.tile,
                active && "ring-2 ring-primary ring-offset-1 ring-offset-background",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Icon className={cn("h-4 w-4 shrink-0", meta.accent)} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium leading-tight">
                    {meta.tileLabel}
                  </span>
                  <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                    {state === "met"
                      ? "silent"
                      : state === "fallback"
                        ? "counted, named, visible"
                        : "errors at runtime"}
                  </span>
                </span>
              </span>
              <span
                className={cn(
                  "text-2xl font-semibold leading-none tabular-nums",
                  state === "met" ? "text-foreground" : meta.accent,
                )}
              >
                {counts[state]}
              </span>
            </button>
          );
        })}
      </div>

      {/* THE ROWS, inline. An unmet mandate is a defect on a scoreboard, not a
          status field you have to go and find. */}
      {loudRows.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {loudRows.map((job) => {
            const at = job.altitudes[scope];
            if (!at) return null;
            const meta = COVERAGE_META[at.coverage];
            const Icon = meta.icon;
            return (
              <li key={job.id}>
                <button
                  type="button"
                  onClick={() => onOpenJob(job.id)}
                  className={cn(
                    "group flex w-full items-start gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors",
                    at.coverage === "unmet"
                      ? "border-rose-500/40 bg-rose-500/5 hover:bg-rose-500/10"
                      : "border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10",
                  )}
                >
                  <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", meta.accent)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-mono text-xs font-medium">
                        {job.mandate_key}
                      </span>
                      {at.fallback_mandate_key ? (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          served by
                          <HolderChip at={at} interactive={false} />
                          via
                          <span className="font-mono">
                            {at.fallback_mandate_key}
                          </span>
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                      {at.issue}
                    </span>
                  </span>
                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground">
          Every job at this altitude has an explicit intelligence. Nothing is
          running on a stand-in.
        </p>
      )}
    </div>
  );
}
