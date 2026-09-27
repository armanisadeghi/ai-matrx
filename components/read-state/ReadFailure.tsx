"use client";

/**
 * The failed-read view every list uses instead of its empty state (RC-B12
 * round 11): the error, with the Alchemy Menu (through ErrorNotice) and a
 * retry when the caller has one. `error` may be the error itself or just the
 * read's failed flag — the sentence never pretends there is nothing.
 *
 * ALWAYS A WAY FORWARD. With `onRetry` it offers "Try again" (the surface's own
 * read, nothing else touched). Without one — every SERVER page, which cannot
 * pass a function — it offers `ReloadPageButton`: a same-URL reload that re-runs
 * the server read. A failure card with no retry at all is gone.
 */
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { ReloadPageButton } from "@/components/read-state/ReloadPageButton";

export function ReadFailure({
  error,
  what = "this list",
  onRetry,
  className,
  size = "compact",
}: {
  error: unknown;
  /** What could not be read, in the reader's words: "your tasks". */
  what?: string;
  /** Retry just this read. Absent (always, from a server page): a same-URL reload is offered. */
  onRetry?: () => void;
  className?: string;
  size?: "compact" | "default";
}) {
  const flagOnly = error === true || error == null || error === "";
  return (
    <ErrorNotice
      size={size}
      className={className ?? "m-3"}
      title={`Couldn't load ${what}`}
      {...(flagOnly
        ? { message: `The read for ${what} failed, so nothing here is an answer — not "empty".` }
        : { error })}
      operation={`Load ${what}`}
      actions={
        onRetry ? (
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" /> Try again
          </Button>
        ) : (
          <ReloadPageButton />
        )
      }
    />
  );
}
