"use client";

/**
 * Column 3 — WHAT WILL ACTUALLY BE CREATED. The whole point of the view: set
 * "Services × 8" and you see the eight real routes before anything is written,
 * each tagged with its live state.
 *
 * The five states come from the SAME identity the writer uses (see
 * `preview.ts`): `new`, `exists`, `conflict` (a different page already occupies
 * that route — the DB will reject it, so it is called out HERE rather than
 * discovered afterwards), and `created` / `failed` once a commit has run.
 *
 * The commit bar is pinned to the bottom of this column so the decision and its
 * evidence never separate. The last run's report is derived from state that
 * survives re-render, so a background plan refetch cannot wipe the receipt.
 */
import { useState } from "react";
import { AlertTriangle, Check, Loader2, Rocket } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { ExpandedArchetype } from "../archetypes";
import type { PreviewRow, PreviewSummary, RouteState } from "../preview";
import type { CommitResult } from "../service";

/** Rendering every route of a 1000-page shape helps nobody; the cap is stated. */
const RENDER_CAP = 400;

type Filter = "all" | "new" | "conflict" | "failed";

const STATE_BADGE: Record<RouteState, { label: string; className: string }> = {
  new: { label: "New", className: "bg-primary/15 text-primary" },
  exists: { label: "Already planned", className: "bg-muted text-muted-foreground" },
  conflict: { label: "Conflict", className: "bg-warning/15 text-warning" },
  created: { label: "Created", className: "bg-success/15 text-success" },
  failed: { label: "Failed", className: "bg-destructive/15 text-destructive" },
};

const STATE_RAIL: Record<RouteState, string> = {
  new: "bg-primary",
  exists: "bg-border",
  conflict: "bg-warning",
  created: "bg-success",
  failed: "bg-destructive",
};

export function SetupPreviewColumn({
  expanded,
  preview,
  disabledReason,
  committing,
  progress,
  result,
  onCommit,
  onOpenPlan,
}: {
  expanded: ExpandedArchetype;
  preview: PreviewSummary;
  /** Non-null = commit is blocked, and this is the human reason why. */
  disabledReason: string | null;
  committing: boolean;
  progress: { done: number; total: number } | null;
  result: CommitResult | null;
  onCommit: () => void;
  /** Door to the created pages — switches the workspace to the tree view. */
  onOpenPlan?: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const { rows, counts } = preview;
  const newCount = counts.new;
  const visible = rows.filter((row) => {
    if (filter === "new") return row.state === "new" || row.state === "created";
    if (filter === "conflict") return row.state === "conflict";
    if (filter === "failed") return row.state === "failed";
    return true;
  });
  const shown = visible.slice(0, RENDER_CAP);

  const groups: [string, PreviewRow[]][] = [];
  const index = new Map<string, PreviewRow[]>();
  for (const row of shown) {
    const key = row.spec.familyKey ?? "core";
    const list = index.get(key);
    if (list) list.push(row);
    else {
      const created: PreviewRow[] = [row];
      index.set(key, created);
      groups.push([key, created]);
    }
  }

  const groupLabel = (key: string) =>
    key === "core"
      ? "Core pages"
      : (expanded.families.find((family) => family.key === key)?.label ?? key);

  const filters: [Filter, string, number][] = [
    ["all", "All", counts.all],
    ["new", "New", newCount],
    ...(counts.conflict > 0
      ? ([["conflict", "Conflict", counts.conflict]] as [Filter, string, number][])
      : []),
    ...(counts.failed > 0
      ? ([["failed", "Failed", counts.failed]] as [Filter, string, number][])
      : []),
  ];

  return (
    <div className="flex flex-col md:h-full md:min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
          Pages that will exist
        </h4>
        <div className="flex items-center rounded-md border border-border p-0.5">
          {filters.map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                "rounded px-2 py-0.5 text-[11px] font-medium tabular-nums transition-colors",
                filter === key
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label} {count}
            </button>
          ))}
        </div>
      </div>

      {counts.conflict > 0 ? (
        <div className="shrink-0 border-b border-warning/40 bg-warning/10 px-3 py-1.5 text-[11px] leading-relaxed text-foreground">
          <span className="font-medium">
            {counts.conflict} route
            {counts.conflict === 1 ? " is" : "s are"} already occupied by a
            different page
          </span>{" "}
          — same URL, different parent. The database allows one page per route,
          so those inserts will be rejected (and reported with the database&apos;s
          own message). Move or rename the existing pages first to land them
          cleanly.
        </div>
      ) : null}

      <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
        {visible.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm font-medium text-foreground">
              {rows.length === 0 ? "Nothing to preview" : "Nothing new to create"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {rows.length === 0
                ? "Pick a site shape on the left to see the routes it would create."
                : "Every page this shape describes is already in the plan. Raise a count to add more."}
            </p>
          </div>
        ) : (
          groups.map(([key, groupRows]) => (
            <section key={key}>
              <h5 className="relative border-b border-border bg-muted/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-sm md:sticky md:top-0 md:z-10">
                {groupLabel(key)} · {groupRows.length}
              </h5>
              <ul>
                {groupRows.map((row) => (
                  <li
                    key={row.spec.route}
                    className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5"
                    title={row.error ?? undefined}
                  >
                    <span
                      className={cn(
                        "w-1.5 shrink-0 self-stretch rounded-full",
                        STATE_RAIL[row.state],
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm leading-snug text-foreground">
                        {row.spec.label}
                      </div>
                      <div className="truncate font-mono text-[11px] leading-snug text-muted-foreground">
                        {row.spec.route}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium leading-none",
                        STATE_BADGE[row.state].className,
                      )}
                    >
                      {STATE_BADGE[row.state].label}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
        {visible.length > RENDER_CAP ? (
          <p className="px-3 py-2 text-[11px] text-muted-foreground">
            Showing the first {RENDER_CAP} of {visible.length} routes. All{" "}
            {visible.length} are part of this work order.
          </p>
        ) : null}
      </div>

      {result ? <CommitReport result={result} onOpenPlan={onOpenPlan} /> : null}

      <div className="border-t border-border bg-card p-3">
        {disabledReason ? (
          <p className="mb-2 flex items-start gap-1.5 text-xs leading-relaxed text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {disabledReason}
          </p>
        ) : null}
        <Button
          className="h-9 w-full gap-2"
          disabled={committing || disabledReason !== null || newCount === 0}
          onClick={onCommit}
        >
          {committing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating {progress ? `${progress.done} of ${progress.total}` : "…"}
            </>
          ) : (
            <>
              <Rocket className="h-4 w-4" />
              {newCount === 0
                ? "Nothing new to create"
                : `Create ${newCount} page${newCount === 1 ? "" : "s"}`}
            </>
          )}
        </Button>
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
          Safe to re-run: pages that already exist are left exactly as they are.
        </p>
      </div>
    </div>
  );
}

/** The result of the last run — created / left alone / failed, verbatim. */
function CommitReport({
  result,
  onOpenPlan,
}: {
  result: CommitResult;
  onOpenPlan?: () => void;
}) {
  const failures = result.rows.filter((row) => row.state === "failed");
  return (
    <div
      className={cn(
        "max-h-48 shrink-0 overflow-y-auto border-t px-3 py-2 text-xs",
        result.failed > 0
          ? "border-destructive/40 bg-destructive/10"
          : "border-success/40 bg-success/10",
      )}
    >
      <p className="flex items-center gap-1.5 font-medium text-foreground">
        {result.failed > 0 ? (
          <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
        ) : (
          <Check className="h-3.5 w-3.5 text-success" />
        )}
        Created {result.created} · left alone {result.existing}
        {result.failed > 0 ? ` · failed ${result.failed}` : ""}
        {result.created > 0 && onOpenPlan ? (
          <button
            type="button"
            className="ml-auto shrink-0 font-medium text-primary hover:underline"
            onClick={onOpenPlan}
          >
            View your plan →
          </button>
        ) : null}
      </p>
      {result.routeMismatches.length > 0 ? (
        <p className="mt-1.5 text-destructive">
          {result.routeMismatches.length} page(s) landed on a different route than
          previewed (e.g. {result.routeMismatches[0].expected} →{" "}
          {result.routeMismatches[0].actual}). The database computes routes and is
          the authority — report this.
        </p>
      ) : null}
      {failures.length > 0 ? (
        <ul className="mt-1.5 space-y-1">
          {failures.slice(0, 8).map((failure) => (
            <li key={failure.route} className="text-foreground">
              <span className="font-mono text-[11px]">{failure.route}</span> —{" "}
              {failure.error}
            </li>
          ))}
          {failures.length > 8 ? (
            <li className="text-muted-foreground">
              …and {failures.length - 8} more with the same treatment.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
