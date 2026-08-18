"use client";

/**
 * The workflow catalog — the entry list for /workflows.
 *
 * Feature entry pages are LIST views (root CLAUDE.md): every workflow the
 * user can reach, newest activity first, each row a door to running it,
 * designing its run surface, or opening its last run. No dead ends — the
 * step count, the run count and the last-run status are all reachable
 * things, so each one links.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  LayoutTemplate,
  Loader2,
  PauseCircle,
  Play,
  Search,
  Workflow as WorkflowIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { formatRelativeTime } from "@/utils/datetime";
import {
  fetchWorkflowCatalog,
  type WorkflowCatalogRow,
} from "./service";

type StatusTone = "good" | "bad" | "busy" | "held" | "none";

function statusTone(status: string | null): StatusTone {
  switch (status) {
    case "completed":
      return "good";
    case "failed":
    case "errored":
      return "bad";
    case "running":
    case "pending":
      return "busy";
    case "paused":
    case "interrupted":
      return "held";
    default:
      return "none";
  }
}

/** Plain language for a non-technical reader — never the raw enum. */
const STATUS_LABEL: Record<string, string> = {
  completed: "Finished",
  failed: "Stopped",
  errored: "Stopped",
  running: "Running now",
  pending: "Queued",
  paused: "Paused",
  interrupted: "Waiting on you",
  cancelled: "Cancelled",
};

function StatusChip({ status }: { status: string | null }) {
  if (!status) return null;
  const tone = statusTone(status);
  const Icon =
    tone === "good"
      ? CheckCircle2
      : tone === "bad"
        ? AlertTriangle
        : tone === "busy"
          ? Loader2
          : tone === "held"
            ? PauseCircle
            : CircleDashed;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone === "good" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        tone === "bad" && "bg-destructive/10 text-destructive",
        tone === "busy" && "bg-primary/10 text-primary",
        tone === "held" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
        tone === "none" && "bg-muted text-muted-foreground",
      )}
    >
      <Icon className={cn("h-3 w-3", tone === "busy" && "animate-spin")} />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function WorkflowCard({ row }: { row: WorkflowCatalogRow }) {
  return (
    <div className="group relative flex flex-col rounded-xl border border-border bg-card transition-colors hover:border-primary/40">
      {/* The whole card opens the workflow; the action row below stops
          propagation so its own doors still work. */}
      <Link
        href={`/workflows/${row.id}`}
        className="flex min-w-0 flex-1 flex-col gap-1.5 p-3.5"
      >
        <div className="flex min-w-0 items-start gap-2">
          <WorkflowIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {row.name}
          </h2>
        </div>
        {row.description ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {row.description}
          </p>
        ) : null}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1.5 text-[11px] text-muted-foreground">
          <span>
            {row.stepCount} {row.stepCount === 1 ? "step" : "steps"}
          </span>
          {row.runCount > 0 ? (
            <span>
              {row.runCount} {row.runCount === 1 ? "run" : "runs"}
            </span>
          ) : (
            <span>Never run</span>
          )}
          {row.lastRunAt ? (
            <span className="truncate">{formatRelativeTime(row.lastRunAt)}</span>
          ) : null}
        </div>
      </Link>

      <div className="flex items-center gap-1.5 border-t border-border px-3 py-2">
        {row.lastRunId ? (
          <Link
            href={`/workflows/runs/${row.lastRunId}`}
            className="inline-flex items-center rounded-md hover:opacity-80"
            aria-label="Open the last run"
          >
            <StatusChip status={row.lastRunStatus} />
          </Link>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            Ready to run
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <Link
            href={`/workflows/${row.id}/design`}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <LayoutTemplate className="h-3.5 w-3.5" />
            Design
          </Link>
          <Link
            href={`/workflows/${row.id}`}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:opacity-90"
          >
            <Play className="h-3.5 w-3.5" />
            Run
          </Link>
        </span>
      </div>
    </div>
  );
}

export function WorkflowCatalog() {
  const [rows, setRows] = useState<WorkflowCatalogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchWorkflowCatalog()
      .then((result) => {
        if (!cancelled) setRows(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRows([]);
        setError(
          err instanceof Error
            ? err.message
            : "Your workflows could not be loaded.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return null;
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        (row.description ?? "").toLowerCase().includes(q) ||
        (row.category ?? "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <div className="relative shrink-0">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search workflows"
          className="h-9 pl-8 text-base sm:text-sm"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : filtered === null ? (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-xl border border-border bg-muted/40"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {query
              ? `No workflow matches “${query}”.`
              : "No workflows yet."}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 pb-6 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((row) => (
              <WorkflowCard key={row.id} row={row} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
