"use client";

/**
 * The Press Room — loading, stalled, error, empty.
 *
 * Ground-rules §3: the unglamorous states get the same craft as the hero. All
 * four are reachable on the real route via `?data=` so a reviewer can see them
 * without breaking the read.
 *
 * A note on reuse: `components/official/cards/EmptyStateCard.tsx` was the
 * obvious candidate for the empty state and was deliberately NOT used — it
 * hardcodes `text-gray-*` / `bg-blue-*`, which ground-rules §4 bans outright.
 * The local empty state below is semantic-token only. Fixing that shared card
 * is real work, but it is not this surface's work to smuggle in.
 */

import * as React from "react";
import {
  AlertTriangle,
  BrainCircuit,
  Newspaper,
  RefreshCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { extractErrorMessage } from "@/utils/errors";

/** Matches the real list geometry exactly, so nothing shifts on arrival. */
export function PressRoomSkeleton() {
  return (
    <div className="h-full overflow-hidden" aria-busy="true" aria-live="polite">
      <div className="border-b border-border/60 px-4 py-3">
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="divide-y divide-border/50">
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={index} className="flex items-start gap-3 px-4 py-3.5">
            <Skeleton className="h-5 w-10 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton
                className="h-4"
                style={{ width: `${88 - index * 6}%` }}
              />
              <div className="flex gap-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <Skeleton className="h-5 w-16 shrink-0" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading your press room…</span>
    </div>
  );
}

/**
 * The load is still in flight and is taking abnormally long. We do NOT abandon
 * it — the retry is offered beside the truth, not instead of it.
 */
export function PressRoomStalled({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="h-full overflow-hidden">
      <div className="m-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
        <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-amber-600 dark:text-amber-400 motion-reduce:animate-none" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground">
            Still waiting on your story angles
          </p>
          <p className="text-[11px] text-muted-foreground">
            The read has been running for more than 8 seconds. It has not
            failed — it is still open. Nothing is lost if you retry.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 text-[11px]"
          onClick={onRetry}
        >
          Start over
        </Button>
      </div>
      <PressRoomSkeleton />
    </div>
  );
}

export function PressRoomError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-lg rounded-xl border border-destructive/30 bg-destructive/5 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Could not load the press room
            </p>
            <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">
              {extractErrorMessage(error)}
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground/80">
              Nothing was written. This is a read failure only.
            </p>
            <Button
              className="mt-3 h-7 text-[11px]"
              size="sm"
              variant="outline"
              onClick={onRetry}
            >
              <RefreshCw className="mr-1.5 h-3 w-3" />
              Try again
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PressRoomEmpty({ onFindAngles }: { onFindAngles: () => void }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Newspaper className="h-6 w-6" strokeWidth={1.5} />
        </span>
        <h2 className="text-base font-semibold text-foreground">
          No story angles yet
        </h2>
        <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-muted-foreground">
          You almost certainly are newsworthy — you just have not had anyone
          look. Run the analysis and it reads your site, your data, and your
          coverage history, then tells you what a journalist would want.
        </p>
        <Button className="mt-4 h-8" size="sm" onClick={onFindAngles}>
          <BrainCircuit className="mr-1.5 h-3.5 w-3.5" />
          Find my story angles
        </Button>
      </div>
    </div>
  );
}

/** Empty state for one filtered view, inside an otherwise-populated room. */
export function ViewEmpty({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center px-6 py-10 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
        {detail}
      </p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
