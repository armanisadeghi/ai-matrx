/**
 * features/hr/time/clock/PunchStateCards.tsx — the three states nobody enjoys designing, which are
 * the three that decide whether this feature is trustworthy: `blocked`, `offline` and `error`.
 *
 * Every one of them obeys the same rule: **say what happened, in a sentence a person can act on,
 * and give them somewhere to go.** An hourly employee who cannot punch and cannot tell why has an
 * unpaid shift and a grievance, and a spinner is the worst possible answer to either.
 */

"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, RotateCcw, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ClockState } from "@/features/hr/time/api/types";

import type { PunchClockError } from "./usePunchClock";
import type { PunchIntent } from "./punchIntent";
import { punchKindPresentation } from "./punchVocabulary";

/**
 * The door's label. The envelope carries a path and a `reason_code` but no label, so the wording is
 * chosen from the code — never from the path, and never the raw token itself: `no_position_assignment`
 * on a button is a machine talking to a person (the same class of defect as F7).
 */
function doorLabel(reasonCode: string | null): string {
  switch (reasonCode) {
    case "no_position_assignment":
      return "Open my profile";
    case "employment_not_active":
      return "Open my employment record";
    case "worker_class_not_enabled":
      return "Open my engagement";
    case "web_punch_disabled":
      return "Open time settings";
    default:
      return "Open";
  }
}

/**
 * 🚨 `blocked` is a **server fact** and it **always** carries a sentence AND a door (§2.1, L3-44).
 * Worker class not enabled, employment not active, web punch disabled by config, module off — the
 * `message` is the server's words, and `door` is where the person goes next. *A blocked employee
 * must never be left with nowhere to go*, because the alternative is a person standing at a screen
 * that has told them no and offered them nothing.
 *
 * 🚨 **THIS RENDERED EMPTY IN PRODUCTION (G2 F6).** The component read `blocked.reason` and
 * `blocked.href`; the server sends `blocked.message` and `blocked.door`. Both were `undefined`, the
 * paragraph rendered blank, and the fall-through below — written for "the server sent a reason with
 * no door" — fired while the server had sent **both**. The payload was cast, not mapped, so no type
 * check could see it. `service.ts` maps it by name now; these are the server's field names.
 */
export function PunchBlockedCard({ blocked }: { blocked: NonNullable<ClockState["blocked"]> }) {
  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="flex flex-col gap-4">
          {/* The server's sentence, verbatim. Never replaced with a generic one. */}
          <p className="text-base text-foreground">{blocked.message}</p>
          {blocked.door && (
            <Button asChild variant="outline" className="min-h-[48px] w-fit gap-2">
              <Link href={blocked.door}>
                {doorLabel(blocked.reasonCode)}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          )}
          {!blocked.door && (
            /*
              The server sent a reason with no door. That is a defect on the server's side, not a
              reason to leave a person stranded — so the surface still names a human path.
            */
            <p className="text-sm text-muted-foreground">
              Ask your manager or an HR administrator to look at your time settings.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * 🚨 **The write is blocked with an explicit message and NEVER silently queued** (§2.1, L3-71).
 * Extended offline queueing is deferred (AD-10) — this is a **stated product limit**, not a
 * spinner and not a lie of omission. The employee is told, in words, that nothing was recorded and
 * what to do about it.
 *
 * Retry reuses the same intent (and therefore the same idempotency key), so if the request did in
 * fact reach the server before the browser noticed it was offline, the retry collapses onto that
 * row instead of writing a second punch.
 */
export function PunchOfflineCard({
  intent,
  busy,
  onRetry,
}: {
  intent: PunchIntent | null;
  busy: boolean;
  onRetry: () => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-start gap-3">
        <WifiOff className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-base font-semibold text-foreground">
              This device is offline. Your punch was not recorded.
            </p>
            <p className="text-sm text-muted-foreground">
              Nothing is being held for later. When you are back online, try again — and tell your
              manager if you cannot.
            </p>
          </div>
          {intent && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onRetry}
              className="min-h-[48px] w-fit gap-2"
            >
              <RotateCcw className="size-4" />
              Try {punchKindPresentation(intent.kind).label.toLowerCase()} again
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * 🚨 The typed error's human sentence, **verbatim from the RPC** (§2.1), and a Retry that **reuses
 * the same idempotency key**. Substituting a generic sentence here is how a person ends up unable
 * to tell "you are already clocked in" from "the network failed" — two situations with opposite
 * correct responses.
 */
export function PunchErrorCard({
  error,
  intent,
  busy,
  onRetry,
  onReload,
}: {
  error: PunchClockError;
  intent: PunchIntent | null;
  busy: boolean;
  onRetry: () => void;
  /**
   * Re-runs `hr_clock_state`. Used when the error has NO intent behind it — the initial read
   * failed, so there is no punch to retry and the surface would otherwise be a dead end: a
   * sentence, no controls, and nothing to press. An employee who cannot even reload is an employee
   * who has to find another way to clock in.
   */
  onReload: () => void;
}) {
  return (
    <section className="rounded-xl border border-destructive/40 bg-card p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div className="flex flex-col gap-4">
          <p className="text-base text-foreground">{error.userMessage}</p>
          {!intent && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onReload}
              className="min-h-[48px] w-fit gap-2"
            >
              <RotateCcw className="size-4" />
              Try again
            </Button>
          )}
          {intent && error.retryable && (
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={onRetry}
                className="min-h-[48px] w-fit gap-2"
              >
                <RotateCcw className="size-4" />
                Try again
              </Button>
              {intent.attempts > 0 && (
                <p className="text-xs text-muted-foreground">
                  Attempt {intent.attempts + 1}. This is the same punch, not a new one — trying
                  again cannot record it twice.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
