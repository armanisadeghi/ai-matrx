"use client";

/**
 * The one primary action, and the honest report of what it did. Progress is
 * real (route-by-route, because the writes are sequential parent-first);
 * failures are listed verbatim — the `plan` trigger messages ARE the contract
 * and never get masked or summarised away.
 */
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

import type { CommitProgress } from "../_lib/useCommit";

export function CommitBar({
  newCount,
  existingCount,
  totalPages,
  progress,
  onCommit,
  onDismissResult,
  siteId,
  disabledReason,
}: {
  newCount: number;
  existingCount: number;
  totalPages: number;
  progress: CommitProgress;
  onCommit: () => void;
  onDismissResult: () => void;
  siteId: string | null;
  /** Non-null blocks the action and says why in place of the button. */
  disabledReason: string | null;
}) {
  const finished = !progress.running && progress.finishedAt !== null;

  return (
    <div className="shrink-0 border-t border-border bg-card/80 backdrop-blur-glass">
      {finished ? (
        <div className="border-b border-border/60 px-3 py-2">
          <div className="flex items-center gap-2">
            {progress.failures.length === 0 ? (
              <Check className="h-4 w-4 shrink-0 text-success" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
            )}
            <span className="min-w-0 flex-1 text-sm text-foreground">
              Created {progress.created} page
              {progress.created === 1 ? "" : "s"}
              {progress.adopted > 0
                ? `, updated ${progress.adopted} existing`
                : ""}
              {progress.failures.length > 0
                ? `, ${progress.failures.length} failed`
                : ""}
              .
            </span>
            {siteId ? (
              <Button asChild size="sm" variant="secondary" className="h-7">
                <Link href={`/marketing/content-plan?site=${siteId}`}>
                  Open the tree
                </Link>
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={onDismissResult}
            >
              Dismiss
            </Button>
          </div>
          {progress.failures.length > 0 ? (
            <ul className="mt-1.5 max-h-28 overflow-y-auto scrollbar-thin rounded border border-destructive/30 bg-destructive/5 p-1.5">
              {progress.failures.map((failure) => (
                <li key={failure.route} className="py-0.5 text-xs">
                  <code className="font-mono text-destructive">
                    {failure.route}
                  </code>{" "}
                  <span className="text-muted-foreground">
                    {failure.message}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-3 px-3 py-2">
        <div className="min-w-0 flex-1 text-xs text-muted-foreground">
          <span className="font-mono text-sm font-semibold text-foreground">
            {totalPages}
          </span>{" "}
          pages in this shape
          <span className="mx-1.5 text-border">·</span>
          <span className="font-medium text-primary">{newCount} new</span>
          <span className="mx-1.5 text-border">·</span>
          {existingCount} already planned
        </div>

        {progress.running ? (
          <div className="flex min-w-0 items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
            <span className="truncate font-mono text-xs text-muted-foreground">
              {progress.done}/{progress.total} {progress.current ?? ""}
            </span>
          </div>
        ) : disabledReason ? (
          <span className="shrink-0 text-xs text-muted-foreground">
            {disabledReason}
          </span>
        ) : (
          <Button
            size="sm"
            className="h-8 shrink-0"
            disabled={newCount === 0}
            onClick={onCommit}
          >
            {newCount === 0
              ? "Nothing to create"
              : `Create ${newCount} page${newCount === 1 ? "" : "s"}`}
          </Button>
        )}
      </div>
    </div>
  );
}
