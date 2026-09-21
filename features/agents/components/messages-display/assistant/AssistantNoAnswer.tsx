"use client";

import { CircleSlash, Loader2 } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";

/**
 * The words for a turn that finished and produced no answer. The decision of
 * WHEN this shows lives in `answerless-turn.ts`; this file owns only what the
 * person reads.
 *
 * Written for someone who has never seen a stack trace: it says what happened,
 * what it means, and what to do — and it offers Retry only where retry is
 * actually wired, so there is no dead-looking control.
 *
 * 🚨 THE REMEDY IS WRITTEN TO THE PERSON WHO IS READING IT (walk 18, defect C)
 *
 * This box used to end, for everybody, with *"if it keeps coming back empty,
 * the agent's instructions or the model it uses are the thing to change."* The
 * Expert it was printed at on 2026-09-21 was a residential plumber halfway
 * through an interview about drain lines. She writes no agent instructions and
 * picks no model; she was handed an engineer's to-do list and no way to act on
 * it. An Expert gets the fact and the one thing she can do — run it again.
 * The engineering advice is true and worth keeping, so it stays, as a muted
 * line for the admins who can actually act on it.
 */
export function AssistantNoAnswer({
  onRetry,
  retrying = false,
}: {
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const isAdmin = useAppSelector(selectIsSuperAdmin);

  return (
    <div className="mt-1 text-xs" data-assistant-no-answer>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <CircleSlash className="h-3.5 w-3.5 shrink-0" />
          This run finished without writing an answer.
        </span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="inline-flex items-center gap-1 underline-offset-2 transition-colors hover:text-foreground hover:underline disabled:opacity-60"
          >
            {retrying && <Loader2 className="h-3 w-3 animate-spin" />}
            {retrying ? "Running again…" : "Run it again"}
          </button>
        )}
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/80">
        Nothing came back this time, so there is nothing to read. Nothing you
        wrote was lost. Running it again usually settles it.
      </p>
      {isAdmin && (
        <p
          className="mt-1 text-[11px] leading-relaxed text-muted-foreground/60"
          data-assistant-no-answer-admin-detail
        >
          Admin: if it keeps coming back empty, the agent&rsquo;s instructions
          or the model it uses are the thing to change.
        </p>
      )}
    </div>
  );
}
