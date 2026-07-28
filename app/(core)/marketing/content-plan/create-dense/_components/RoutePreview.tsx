"use client";

/**
 * Level 2 — the primary focus rectangle: the ACTUAL routes this commit will
 * create, diffed against what the site already has, before anything is
 * written. Adjusting a count rewrites this list on the keystroke.
 *
 * Every row carries its live state: `new` (will be created), `exists` (the DB
 * already has this exact `(parent, slug)` and will be left untouched),
 * `created` / `failed` once a commit has run — a failure keeps the DB's own
 * message, verbatim.
 */
import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { PlanTreeNodeSpec } from "../_lib/archetypes";
import type { PlanNodeRow } from "@/features/marketing/content-plan/types";
import { identityKey, type InstantiationRow } from "../_lib/service";

export type RouteState = "new" | "exists" | "conflict" | "created" | "failed";

export interface PreviewRow {
  spec: PlanTreeNodeSpec;
  depth: number;
  state: RouteState;
  error?: string;
}

const STATE_CLASSES: Record<RouteState, string> = {
  new: "border-blue-500/20 bg-blue-500/15 text-blue-600 dark:text-blue-400",
  exists: "border-border bg-muted text-muted-foreground",
  conflict: "border-amber-500/20 bg-amber-500/15 text-amber-600 dark:text-amber-400",
  created: "border-emerald-500/20 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  failed: "border-destructive/20 bg-destructive/15 text-destructive",
};

type Filter = "all" | "new" | "exists" | "conflict" | "failed";

/**
 * Diff the tree against the live plan using the SAME identity the commit uses —
 * the DB's unique key `(site_id, parent_id, slug)`, resolved parent-first down
 * the tree. Diffing by route instead would disagree with the writer in exactly
 * the case that matters: a page that already lives at this route under a
 * DIFFERENT parent. That is `conflict` — the second unique index
 * (`site_id, route`) will reject it, so it is called out here rather than
 * discovered as a failure after the user commits.
 */
export function buildPreviewRows(args: {
  roots: PlanTreeNodeSpec[];
  liveNodes: PlanNodeRow[];
  lastRun: InstantiationRow[] | null;
}): PreviewRow[] {
  const byIdentity = new Map<string, PlanNodeRow>();
  const byRoute = new Map<string, PlanNodeRow>();
  for (const node of args.liveNodes) {
    byIdentity.set(identityKey(node.parent_id, node.slug), node);
    if (node.route) byRoute.set(node.route, node);
  }
  const runByRoute = new Map<string, InstantiationRow>();
  for (const row of args.lastRun ?? []) runByRoute.set(row.route, row);

  const rows: PreviewRow[] = [];
  const walk = (specs: PlanTreeNodeSpec[], parentId: string | null, depth: number) => {
    for (const spec of specs) {
      const match = byIdentity.get(identityKey(parentId, spec.slug));
      const run = runByRoute.get(spec.route);
      let state: RouteState;
      if (run?.state === "failed") state = "failed";
      else if (run?.state === "created") state = "created";
      else if (match) state = "exists";
      else if (byRoute.has(spec.route)) state = "conflict";
      else state = "new";
      rows.push({ spec, depth, state, error: run?.error });
      walk(spec.children, match?.id ?? null, depth + 1);
    }
  };
  walk(args.roots, null, 0);
  return rows;
}

export function RoutePreview({ rows }: { rows: PreviewRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(
    () => ({
      all: rows.length,
      new: rows.filter((row) => row.state === "new").length,
      exists: rows.filter((row) => row.state === "exists").length,
      conflict: rows.filter((row) => row.state === "conflict").length,
      failed: rows.filter((row) => row.state === "failed").length,
    }),
    [rows],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === "new" && row.state !== "new" && row.state !== "created") return false;
      if (filter === "exists" && row.state !== "exists") return false;
      if (filter === "conflict" && row.state !== "conflict") return false;
      if (filter === "failed" && row.state !== "failed") return false;
      if (!needle) return true;
      return (
        row.spec.route.toLowerCase().includes(needle) ||
        row.spec.label.toLowerCase().includes(needle)
      );
    });
  }, [rows, filter, query]);

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "new", label: "New", count: counts.new },
    { key: "exists", label: "Exists", count: counts.exists },
    ...(counts.conflict > 0
      ? [{ key: "conflict" as const, label: "Conflict", count: counts.conflict }]
      : []),
    ...(counts.failed > 0
      ? [{ key: "failed" as const, label: "Failed", count: counts.failed }]
      : []),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-2.5 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Routes
        </span>
        <div className="flex items-center gap-0.5">
          {filters.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setFilter(entry.key)}
              className={cn(
                "rounded px-1.5 py-0.5 text-xs tabular-nums transition-colors",
                filter === entry.key
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              {entry.label} {entry.count}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-48">
          <Search className="pointer-events-none absolute left-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter routes…"
            aria-label="Filter routes"
            className="h-6 pl-6 text-xs shadow-none"
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="flex-1">Route</span>
        <span className="hidden w-48 sm:block">Label</span>
        <span className="hidden w-24 md:block">Page type</span>
        <span className="w-16 text-right">State</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {visible.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            {rows.length === 0
              ? "Pick an archetype to see the routes it will create."
              : "No routes match this filter."}
          </div>
        ) : (
          visible.map((row) => (
            <div
              key={row.spec.route}
              className="flex items-center gap-2 border-b border-border/60 px-2.5 py-1 hover:bg-accent/50"
              style={{ contentVisibility: "auto", containIntrinsicSize: "26px" }}
              title={
                row.error ??
                (row.state === "conflict"
                  ? "A different page already occupies this route — the database will reject a second one. Move or rename the existing page first."
                  : undefined)
              }
            >
              <span
                className="min-w-0 flex-1 truncate font-mono text-xs text-foreground"
                style={{ paddingLeft: `${row.depth * 12}px` }}
              >
                {row.spec.route}
              </span>
              <span className="hidden w-48 truncate text-xs text-muted-foreground sm:block">
                {row.spec.label}
              </span>
              <span className="hidden w-24 truncate text-xs text-muted-foreground md:block">
                {row.spec.pageType ?? "—"}
              </span>
              <span className="flex w-16 justify-end">
                <span
                  className={cn(
                    "rounded-full border px-1.5 py-0.5 text-[11px] font-medium leading-none",
                    STATE_CLASSES[row.state],
                  )}
                >
                  {row.state}
                </span>
              </span>
            </div>
          ))
        )}
      </div>

      {rows.some((row) => row.state === "failed") ? (
        <div className="shrink-0 border-t border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
          {rows.find((row) => row.state === "failed" && row.error)?.error ??
            "Some routes failed."}
        </div>
      ) : counts.conflict > 0 ? (
        <div className="shrink-0 border-t border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400">
          {counts.conflict} route{counts.conflict === 1 ? " is" : "s are"} already occupied by a
          different page — same URL, different parent. The database allows one page per route, so
          committing will attempt them and the database will reject them (reported as failed, with
          its own message). Move or rename those pages first to land them cleanly.
        </div>
      ) : null}
    </div>
  );
}
