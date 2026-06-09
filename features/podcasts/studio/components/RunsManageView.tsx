"use client";

// features/podcasts/studio/components/RunsManageView.tsx
//
// The studio manage grid: every podcast run the user has started, read from the
// durable agent_run record (GET /podcast/runs). Filter by state, see the source
// that went into each, correct heartbeat-based status, and jump to the run or
// its episode. Replaces the old pc_studio_runs-backed run list.

import { useMemo, useState } from "react";
import Link from "next/link";
import { AudioLines, Mic, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStudioRuns } from "@/features/podcasts/studio/runs/useStudioRuns";
import { isNonTerminal, type RunSummary } from "@/features/podcasts/studio/runs/run-types";
import { RunHistoryCard } from "./RunHistoryCard";

type FilterKey = "all" | "active" | "completed" | "failed" | "draft";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "In progress" },
  { key: "completed", label: "Ready" },
  { key: "failed", label: "Failed" },
  { key: "draft", label: "Drafts" },
];

function matches(run: RunSummary, key: FilterKey): boolean {
  switch (key) {
    case "all":
      return true;
    case "active":
      return isNonTerminal(run.liveness);
    case "completed":
      return run.liveness === "completed";
    case "failed":
      return run.liveness === "failed";
    case "draft":
      return run.liveness === "draft";
  }
}

export function RunsManageView() {
  const { runs, loading, error, refresh } = useStudioRuns();
  const [filter, setFilter] = useState<FilterKey>("all");

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: runs.length,
      active: 0,
      completed: 0,
      failed: 0,
      draft: 0,
    };
    for (const r of runs) {
      if (isNonTerminal(r.liveness)) c.active += 1;
      else if (r.liveness === "completed") c.completed += 1;
      else if (r.liveness === "failed") c.failed += 1;
      else if (r.liveness === "draft") c.draft += 1;
    }
    return c;
  }, [runs]);

  const filtered = useMemo(
    () => runs.filter((r) => matches(r, filter)),
    [runs, filter],
  );

  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Your runs
        </h2>
        <button
          onClick={() => void refresh()}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Refresh runs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Filters */}
      {!loading && runs.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {FILTERS.map(({ key, label }) => {
            const n = counts[key];
            if (key !== "all" && n === 0) return null;
            const active = filter === key;
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
                <span className="ml-1.5 opacity-60">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          Couldn&apos;t load your runs: {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-square w-full rounded-xl" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>
      ) : runs.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Mic className="h-7 w-7" />
          </span>
          <div className="space-y-1">
            <p className="font-medium text-foreground">No runs yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Your first episode is a topic away. Generate one and watch it come
              to life in real time — every run is saved here, source and all.
            </p>
          </div>
          <Button asChild className="gap-2">
            <Link href="/podcast/studio/create">
              <AudioLines className="h-4 w-4" />
              Create your first episode
            </Link>
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center text-sm text-muted-foreground">
          No runs match this filter.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {filtered.map((run) => (
            <RunHistoryCard key={run.run_id} run={run} />
          ))}
        </div>
      )}
    </section>
  );
}
