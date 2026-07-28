"use client";

/**
 * Column 3 — WHAT WILL ACTUALLY BE CREATED. The whole point of the view: when
 * you set "Services × 8" you see the eight real routes before anything is
 * written, each tagged New or Already planned (diffed against the site's live
 * `plan.node` routes).
 *
 * The commit bar is pinned to the bottom of this column so the decision and its
 * evidence never separate.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, Rocket } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { ExpandedArchetype } from "../_lib/archetypes";
import type { CommitResult } from "../_lib/commit";
import type { RoutePreviewItem } from "../_lib/readiness";

/** Rendering every route of a 1000-page shape helps nobody; the cap is stated. */
const RENDER_CAP = 400;

type Filter = "all" | "new";

export function PreviewColumn({
  expanded,
  items,
  disabledReason,
  committing,
  progress,
  result,
  onCommit,
}: {
  expanded: ExpandedArchetype;
  items: RoutePreviewItem[];
  /** Non-null = commit is blocked, and this is the human reason why. */
  disabledReason: string | null;
  committing: boolean;
  progress: { done: number; total: number } | null;
  result: CommitResult | null;
  onCommit: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const newCount = useMemo(
    () => items.filter((item) => !item.exists).length,
    [items],
  );
  const visible = useMemo(
    () => (filter === "new" ? items.filter((item) => !item.exists) : items),
    [filter, items],
  );
  const shown = visible.slice(0, RENDER_CAP);

  const groups = useMemo(() => {
    const map = new Map<string, RoutePreviewItem[]>();
    for (const item of shown) {
      const key = item.familyKey ?? "core";
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
    }
    return [...map.entries()];
  }, [shown]);

  const groupLabel = (key: string) =>
    key === "core"
      ? "Core pages"
      : (expanded.families.find((family) => family.key === key)?.label ?? key);

  return (
    <div className="flex flex-col md:h-full md:min-h-0">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
          Pages that will exist
        </h4>
        <div className="flex items-center rounded-md border border-border p-0.5">
          {(
            [
              ["all", `All ${items.length}`],
              ["new", `New ${newCount}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                "rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                filter === key
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
        {visible.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm font-medium text-foreground">
              Nothing new to create
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Every page this shape describes is already in the plan. Raise a
              count to add more.
            </p>
          </div>
        ) : (
          groups.map(([key, rows]) => (
            <section key={key}>
              <h5 className="relative md:sticky md:top-0 md:z-10 border-b border-border bg-muted/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
                {groupLabel(key)} · {rows.length}
              </h5>
              <ul>
                {rows.map((item) => (
                  <li
                    key={item.route}
                    className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5"
                  >
                    <span
                      className={cn(
                        "w-1.5 shrink-0 self-stretch rounded-full",
                        item.exists ? "bg-border" : "bg-primary",
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm leading-snug text-foreground">
                        {item.label}
                      </div>
                      <div className="truncate font-mono text-[11px] leading-snug text-muted-foreground">
                        {item.route}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium leading-none",
                        item.exists
                          ? "bg-muted text-muted-foreground"
                          : "bg-primary/15 text-primary",
                      )}
                    >
                      {item.exists ? "Already planned" : "New"}
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
            {visible.length} will be created.
          </p>
        ) : null}
      </div>

      {result ? <CommitReport result={result} /> : null}

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

/** The result of the last run — created / skipped / failed, verbatim. */
function CommitReport({ result }: { result: CommitResult }) {
  const failed = result.failed.length;
  return (
    <div
      className={cn(
        "max-h-48 shrink-0 overflow-y-auto border-t px-3 py-2 text-xs",
        failed > 0
          ? "border-destructive/40 bg-destructive/10"
          : "border-success/40 bg-success/10",
      )}
    >
      <p className="flex items-center gap-1.5 font-medium text-foreground">
        {failed > 0 ? (
          <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
        ) : (
          <Check className="h-3.5 w-3.5 text-success" />
        )}
        Created {result.created.length} · left alone {result.existing.length}
        {failed > 0 ? ` · failed ${failed}` : ""}
      </p>
      {result.routeMismatches.length > 0 ? (
        <p className="mt-1.5 text-destructive">
          {result.routeMismatches.length} page(s) landed on a different route
          than previewed (e.g. {result.routeMismatches[0].expected} →{" "}
          {result.routeMismatches[0].actual}). The database computes routes and
          is the authority — report this.
        </p>
      ) : null}
      {failed > 0 ? (
        <ul className="mt-1.5 space-y-1">
          {result.failed.slice(0, 8).map((failure) => (
            <li key={failure.route} className="text-foreground">
              <span className="font-mono text-[11px]">{failure.route}</span> —{" "}
              {failure.message}
            </li>
          ))}
          {failed > 8 ? (
            <li className="text-muted-foreground">
              …and {failed - 8} more with the same treatment.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
