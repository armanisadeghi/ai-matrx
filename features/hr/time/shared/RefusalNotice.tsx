"use client";

/**
 * features/hr/time/shared/RefusalNotice.tsx — how a refusal reaches a person.
 *
 * 🚨 `userMessage` IS RENDERED VERBATIM. SPEC-TIME §2.1 says *"the typed error's human sentence,
 * verbatim from the RPC"*, and SPEC-ACCESS §4.2 explains why: *a denial that does not name what was
 * missing is how over-tightening hides.* Substituting "Something went wrong" deletes the only
 * information the reader can act on — which capability they lack, which period is locked, which
 * punch conflicts.
 *
 * 🚨 A LOCKED PERIOD IS NOT AN ERROR, IT IS A DIFFERENT LANE. `HrRpcError.isPeriodLocked` means the
 * correction must become an `hr.time_adjustment`, and §4.1 requires the edit control to be **absent**
 * with the adjustment lane offered in its place. `adjustmentHref` is how a caller hands over.
 */

import Link from "next/link";
import { AlertCircle, Lock } from "lucide-react";

import { cn } from "@/lib/utils";
import { HrRpcError } from "../api/rpc";

export function RefusalNotice({
  error,
  adjustmentHref,
  className,
}: {
  error: HrRpcError | Error | null;
  /** Where the post-lock correction lane lives. Rendered only on `hr_period_locked`. */
  adjustmentHref?: string;
  className?: string;
}) {
  if (!error) return null;

  const isRpc = error instanceof HrRpcError;
  const locked = isRpc && error.isPeriodLocked;
  const sentence = isRpc ? error.userMessage : error.message;

  return (
    <div
      role="alert"
      /*
       * 🚨 THE MACHINE CODE IS AN ATTRIBUTE, NEVER PAGE TEXT (G2 finding F7).
       *
       * This used to render `error.code` as a small mono line under the sentence, and the verifier
       * caught the result on `/hr/time/punches`: a person was shown the bare token
       * `hr_register_scope_required`. That is the envelope being RENDERED instead of READ. A code is
       * not a fact about the reader's situation — they cannot act on it, cannot search for it, and
       * cannot tell whether it is a warning or the name of a thing they were supposed to do.
       *
       * It still has one legitimate audience — a support conversation and an error report — so it
       * stays on the DOM as a data attribute and a hover title, where it can be copied out without
       * ever being read to somebody as if it were an explanation.
       */
      data-hr-refusal-code={isRpc ? error.code : undefined}
      title={isRpc ? `Reference: ${error.code}` : undefined}
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm",
        locked
          ? "border-border bg-muted/60"
          : "border-destructive/40 bg-destructive/5 text-foreground",
        className,
      )}
    >
      {locked ? (
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
      )}
      <div className="min-w-0 space-y-1.5">
        <p>{sentence}</p>
        {locked && adjustmentHref ? (
          <Link
            href={adjustmentHref}
            className="inline-flex text-xs font-medium underline underline-offset-4"
          >
            Record a correction in the next pay period
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The mount every read shares: refusal, then first-load skeleton, then the caller's body.
 * `emptySentence` exists because an empty grid is never an acceptable answer on these surfaces —
 * §2.2 requires an explicit sentence, and a component that returns `null` on no data is how the
 * `no-timesheet` state became a blank page in the first place.
 */
export function HrTimeReadState({
  loading,
  error,
  isEmpty,
  emptySentence,
  adjustmentHref,
  children,
}: {
  loading: boolean;
  error: HrRpcError | Error | null;
  isEmpty?: boolean;
  emptySentence?: string;
  adjustmentHref?: string;
  children: React.ReactNode;
}) {
  if (error) return <RefusalNotice error={error} adjustmentHref={adjustmentHref} />;
  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading">
        <div className="h-8 animate-pulse rounded-md bg-muted" />
        <div className="h-24 animate-pulse rounded-md bg-muted/70" />
        <div className="h-24 animate-pulse rounded-md bg-muted/50" />
      </div>
    );
  }
  if (isEmpty && emptySentence) {
    return (
      <p className="rounded-md border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
        {emptySentence}
      </p>
    );
  }
  return <>{children}</>;
}
