"use client";

/**
 * StaleDataNotice — what a surface shows when a READ FAILED and the rows on
 * screen are therefore not to be trusted.
 *
 * THE DEAD END this kills: a list loads fine, the user acts, the surface
 * reloads — and the reload fails. A toast fires and fades. What remains is the
 * PREVIOUS list, rendered exactly like a fresh one. The user reads a roster
 * that no longer reflects the database and has no way to know. Bugbot found
 * this on the admins roster and the feedback table in the same pass, which is
 * what made it a primitive instead of two patches.
 *
 * This is the campaign's never-report-green rule at its sharpest: **a surface
 * must never present data it could not actually read as though it had.** The
 * sibling `DeepLinkMissNotice` states a definitive negative and so demands
 * proof the list WAS read; this states the opposite — that the read broke —
 * and is what that component's "show the surface's ordinary error state
 * instead" was pointing at. Neither is complete without the other.
 *
 * Two cases, and conflating them is the actual bug:
 *
 *   1. **Stale** (`hasData`) — rows are on screen from an earlier successful
 *      read. Say they may be out of date. Do NOT blank them: old data plus an
 *      honest label beats an empty screen, and the user may still need it.
 *   2. **Unknown** (`!hasData`) — nothing was ever read. An empty list here
 *      reads as "there are none", which is a claim about the database nobody
 *      is entitled to make. Say the read failed instead.
 *
 * `onRetry` is not optional decoration — a problem you can detect ships with
 * its one-click fix. The user should never have to reload the page to recover
 * from a failed fetch.
 */

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface StaleDataNoticeProps {
  /**
   * Whether rows from an earlier SUCCESSFUL read are currently displayed.
   * Decides between "this may be out of date" and "we never read this".
   */
  hasData: boolean;
  /**
   * What could not be read, as a plain noun phrase the user recognises —
   * "the admin roster", "feedback". Never a table or endpoint name: our user
   * is a subject-matter expert, not an engineer.
   */
  what: string;
  /** Re-run the read. Required — the notice always carries its own fix. */
  onRetry: () => void;
  /** Disables the retry control and shows motion while a retry is in flight. */
  retrying?: boolean;
  /** Optional detail (a server message). Shown verbatim, never interpreted. */
  detail?: string | null;
  className?: string;
}

export function StaleDataNotice({
  hasData,
  what,
  onRetry,
  retrying = false,
  detail,
  className,
}: StaleDataNoticeProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm",
        className,
      )}
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
      <span className="min-w-0 flex-1 text-foreground">
        {hasData ? (
          <>
            Couldn&apos;t refresh {what}. What you see below is the last version
            we loaded and <strong>may be out of date</strong>.
          </>
        ) : (
          <>
            Couldn&apos;t load {what}, so this list is empty because the read
            failed — <strong>not</strong> because there is nothing here.
          </>
        )}
        {detail ? (
          <span className="ml-1 text-muted-foreground">({detail})</span>
        ) : null}
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={onRetry}
        disabled={retrying}
        className="h-7 shrink-0 gap-1.5"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", retrying && "animate-spin")} />
        {retrying ? "Retrying…" : "Try again"}
      </Button>
    </div>
  );
}
