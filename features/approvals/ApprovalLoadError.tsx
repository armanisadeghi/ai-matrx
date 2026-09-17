"use client";

/**
 * The one honest failure strip inside the approval queue.
 *
 * A queue that cannot read one of its kinds must never render as an empty,
 * calm, "nothing is waiting on you" list — that is the exact screen THE
 * NO-SILENT-FAILURE LAW exists to prevent, and here it would tell a person
 * nobody is waiting on them while an agent's proposal sits unread. So every
 * unreadable kind gets a named, retryable row, and the queue stays visible
 * even when it has no items to show.
 *
 * It also translates the one failure this feature ships with on day one: the
 * store (`platform.approval_proposal`) is written but not yet applied, so
 * PostgREST answers PGRST205 / 42P01. That is not "something went wrong" — it
 * is a stand-in, and a stand-in announces itself WITH ITS REMEDY.
 */

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { extractErrorMessage, humanizeBackendError } from "@/utils/errors";

/** The store this feature reads; named in the remedy below. */
const STORE = "platform.approval_proposal";

/**
 * True when the failure is "the table/function is not in the database yet".
 * PostgREST reports an unknown table as PGRST205 and an unknown function as
 * PGRST202; Postgres itself reports 42P01 (undefined_table) / 42883
 * (undefined_function) when the call gets that far.
 */
export function isMissingStoreError(error: unknown): boolean {
  const text = extractErrorMessage(error);
  return (
    text.includes("PGRST205") ||
    text.includes("PGRST202") ||
    text.includes("42P01") ||
    text.includes("42883") ||
    text.includes(STORE)
  );
}

export function ApprovalLoadError({
  what,
  error,
  onRetry,
}: {
  /** What could not be read, in the reader's words: "the emails to send". */
  what: string;
  error: unknown;
  onRetry?: () => void;
}) {
  const missingStore = isMissingStoreError(error);
  return (
    <div className="mt-2 flex flex-wrap items-start gap-x-2 gap-y-1 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="break-words text-xs font-medium text-foreground">
          {missingStore
            ? `The approval queue's store is not in the database yet, so ${what} cannot be shown.`
            : `Could not load ${what}. Nothing was decided.`}
        </p>
        <p className="break-words text-[11px] text-muted-foreground">
          {missingStore
            ? `Apply migrations/platform_approval_queue.sql (it creates ${STORE}) and regenerate the database types. Until then this queue shows nothing rather than pretending nothing is waiting.`
            : humanizeBackendError(
                extractErrorMessage(error),
                "Something went wrong on our side. Try again in a moment.",
              )}
        </p>
      </div>
      {onRetry ? (
        <Button
          size="sm"
          variant="outline"
          className="h-6 shrink-0 text-[11px] max-md:h-9"
          onClick={onRetry}
        >
          Try again
        </Button>
      ) : null}
    </div>
  );
}
