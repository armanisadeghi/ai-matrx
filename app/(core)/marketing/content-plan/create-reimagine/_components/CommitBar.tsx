"use client";

/**
 * The commit bar. One button, and it says exactly what it will do — "Create 14
 * pages · skip 9". A run reports live progress; a failure keeps whatever landed
 * and names the DB's own error verbatim, because re-running is idempotent by
 * route and resumes where it stopped.
 */
import Link from "next/link";
import { ArrowRight, Hammer, Loader2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { CommitProgress, CommitResult } from "../_lib/data";

export interface CommitBarProps {
  newCount: number;
  existsCount: number;
  totalAfter: number;
  pageEstimate: string | null;
  blockedReason: string | null;
  progress: CommitProgress | null;
  error: string | null;
  result: CommitResult | null;
  onCommit: () => void;
  onDismiss: () => void;
  planHref: string;
}

export function CommitBar(props: CommitBarProps) {
  const {
    newCount,
    existsCount,
    totalAfter,
    pageEstimate,
    blockedReason,
    progress,
    error,
    result,
    onCommit,
    onDismiss,
    planHref,
  } = props;

  const running = progress !== null;
  const pct = progress
    ? Math.round(((progress.created + progress.skipped) / Math.max(1, progress.total)) * 100)
    : 0;

  return (
    <div className="shrink-0 border-t border-glass-edge bg-glass backdrop-blur-glass backdrop-saturate-glass">
      {error ? (
        <div className="flex items-start gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-2">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-medium text-foreground">
              The run stopped. Everything created before this point is already in
              the plan — running again resumes from there.
            </p>
            <p className="mt-0.5 break-words text-[11.5px] text-muted-foreground">
              {error}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={onDismiss}
          >
            Dismiss
          </Button>
        </div>
      ) : null}

      {result && !error ? (
        <div className="flex items-center gap-2 border-b border-success/30 bg-success/10 px-3 py-2">
          <p className="text-[12.5px] text-foreground">
            Created <strong>{result.created}</strong> page
            {result.created === 1 ? "" : "s"}
            {result.skipped > 0 ? (
              <> · skipped {result.skipped} that already existed</>
            ) : null}
            .
            {result.unmappedPageTypes.length > 0 ? (
              <span className="text-warning">
                {" "}
                {result.unmappedPageTypes.length} page type
                {result.unmappedPageTypes.length === 1 ? "" : "s"} had no matching
                category and were left unset.
              </span>
            ) : null}
          </p>
          <Button asChild size="sm" className="ml-auto h-7 gap-1.5 px-2.5 text-xs">
            <Link href={planHref}>
              Open the plan
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={onDismiss}
          >
            Dismiss
          </Button>
        </div>
      ) : null}

      {running ? (
        <div className="h-0.5 w-full bg-muted">
          <div
            className="h-full bg-primary transition-[width] duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}

      <div className="flex items-center gap-3 px-3 py-2">
        <div className="flex min-w-0 items-baseline gap-3 overflow-hidden">
          <Stat value={newCount} label="to create" tone="new" />
          <Stat value={existsCount} label="already there" tone="muted" />
          <Stat value={totalAfter} label="pages after" tone="muted" className="hidden sm:flex" />
          {pageEstimate ? (
            <span className="hidden truncate text-[11px] text-muted-foreground sm:inline">
              archetype estimate {pageEstimate}
            </span>
          ) : null}
        </div>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          {running ? (
            <span className="truncate font-mono text-[11px] text-muted-foreground">
              {progress.created + progress.skipped}/{progress.total}
              {progress.currentRoute ? ` · ${progress.currentRoute}` : ""}
            </span>
          ) : blockedReason ? (
            <span className="truncate text-[11px] text-muted-foreground">
              {blockedReason}
            </span>
          ) : null}
          <Button
            size="sm"
            className="h-8 shrink-0 gap-1.5 px-3"
            disabled={running || Boolean(blockedReason) || newCount === 0}
            onClick={onCommit}
          >
            {running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Hammer className="h-3.5 w-3.5" />
            )}
            {running
              ? "Creating…"
              : newCount === 0
                ? "Nothing to create"
                : `Create ${newCount} page${newCount === 1 ? "" : "s"}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({
  value,
  label,
  tone,
  className,
}: {
  value: number;
  label: string;
  tone: "new" | "muted";
  className?: string;
}) {
  return (
    <span className={cn("flex shrink-0 items-baseline gap-1 whitespace-nowrap", className)}>
      <span
        className={cn(
          "font-mono text-base font-semibold tabular-nums",
          tone === "new" ? "text-success" : "text-foreground",
        )}
      >
        {value}
      </span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </span>
  );
}
