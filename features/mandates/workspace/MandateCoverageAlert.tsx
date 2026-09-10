"use client";

// features/mandates/workspace/MandateCoverageAlert.tsx
//
// THE DETAIL PAGE'S HALF OF THE COVERAGE SCOREBOARD.
//
// 🚨 THE DEFECT THIS CLOSES (2026-09-09). The mandate LIST already screams: a
// "Holder missing" tile, a red strip naming every such Mandate, a per-row badge
// and a one-click narrowing. Open one of those Mandates and the scream stopped
// — `/administration/mandates/shortcut.full_prompt_optimizer` landed on the
// Definition tab, whose only trace of the fact was the grey line "Declared by:
// Holder name unavailable" and an amber box titled with an INPUT problem. The
// truth (the door's full rung walk) was real and correct, but it sat on another
// tab, framed as a declaration issue. An admin who arrives by link, by search,
// or by a colleague's URL never passes the list, so for them the page said
// nothing was wrong with a Mandate that errors on every single call.
//
// So the same verdict the list wears rides at the TOP of the page, above the
// tabs, on every host.
//
// ONE CLASSIFICATION, THE SERVER'S. This never inspects a holder, a binding or
// a pin — it reads `GET /mandates/coverage/states`, which is
// `aidream/services/mandates/coverage.py::compute_mandate_coverage` and nothing
// else, and prints that report's own `reason` verbatim. A second client-side
// rule beside the server's is the failure class the whole coverage feature was
// built to avoid (see ../coverage.ts).
//
// HONEST STATES ONLY:
//   green    nothing is drawn. A banner on 382 healthy Mandates is noise.
//   orange   amber. It runs, on somebody else's Holder, and that leader is
//            NAMED (FALLBACK-MANDATES.md: an unnamed fallback is silent
//            permanent mediocrity).
//   red      loud. `RED_WORD` — the platform's ONE word for it — plus the
//            server's sentence and a control that goes where the fix is made.
//   unknown  the report FAILED. Said out loud, with the verbatim error: a
//            banner that vanishes on error reads as "nothing is wrong".
//   loading  nothing, briefly. It resolves in one fetch.

import { CircleAlert, CircleDashed, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  COVERAGE_META,
  RED_WORD,
  type MandateCoverageStateRow,
} from "@/features/mandates/coverage";
import { useMandateCoverageStates } from "@/features/mandates/browse/CoverageBadge";

/**
 * WHAT THE BANNER SAYS, as a value. Every one of these is a way to get honesty
 * wrong, so the rules are decided here and pinned by
 * `__tests__/mandate-coverage-alert.test.ts` rather than living inside JSX.
 */
export type MandateCoverageAlertVerdict =
  | { kind: "silent" }
  | { kind: "unknown"; title: string; detail: string }
  | {
      kind: "state";
      bucket: "orange" | "red";
      title: string;
      detail: string;
      /** Show the control that goes to where a Holder is chosen. */
      offerFix: boolean;
    };

/**
 * THE TITLE FOR `red`. It is `RED_WORD` plus the consequence, because the word
 * alone is a status and this banner exists to say what the status COSTS. The
 * word itself is never re-spelled here — `coverage.ts` owns it, and
 * `mandate-screen-vocabulary.test.ts` refuses a second spelling anywhere a
 * mandate screen renders.
 */
export const RED_TITLE = `${RED_WORD} — nothing runs when this Mandate is called`;

export function mandateCoverageAlertVerdict(args: {
  row: MandateCoverageStateRow | null | undefined;
  loading: boolean;
  error: string | null;
}): MandateCoverageAlertVerdict {
  if (args.error) {
    return {
      kind: "unknown",
      title: "Whether anything runs this Mandate is unknown, not clean",
      detail: args.error,
    };
  }
  if (args.loading) return { kind: "silent" };
  // An ABSENT key is unanswered, never assigned — but this page asks the
  // registry-wide report, which answers for every live Mandate, so the only way
  // to land here is a Mandate that is not live. The page's own load already
  // refused that address; staying quiet is right and stays right.
  if (!args.row) return { kind: "silent" };
  if (args.row.state === "green") return { kind: "silent" };

  if (args.row.state === "red") {
    return {
      kind: "state",
      bucket: "red",
      title: RED_TITLE,
      detail: args.row.reason ?? COVERAGE_META.red.description,
      offerFix: true,
    };
  }

  return {
    kind: "state",
    bucket: "orange",
    title: args.row.leader_key
      ? `${COVERAGE_META.orange.label} — this Mandate runs on ${args.row.leader_key}'s Holder`
      : COVERAGE_META.orange.label,
    detail: args.row.reason ?? COVERAGE_META.orange.description,
    offerFix: true,
  };
}

export function MandateCoverageAlert({
  mandateKey,
  onAssignHolder,
  className,
}: {
  mandateKey: string;
  /**
   * Where a Holder is actually chosen. Omitted by a host that has no such
   * control — and then no control is drawn, because a button that goes nowhere
   * is worse than no button.
   */
  onAssignHolder?: () => void;
  className?: string;
}) {
  // The registry-wide report: this page is about ONE Mandate whose owner may be
  // any organization, so scoping the report to the viewer's active org would
  // silently answer "unanswered" for a Mandate another org homes.
  const { states, loading, error } = useMandateCoverageStates(null);
  const verdict = mandateCoverageAlertVerdict({
    row: states.get(mandateKey),
    loading,
    error,
  });

  if (verdict.kind === "silent") return null;

  if (verdict.kind === "unknown") {
    return (
      <div
        role="status"
        className={cn(
          "flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 px-4 py-3",
          className,
        )}
      >
        <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-semibold text-foreground">
            {verdict.title}
          </p>
          <p className="break-words text-[12.5px] text-muted-foreground">
            {verdict.detail}
          </p>
        </div>
      </div>
    );
  }

  const isRed = verdict.bucket === "red";
  const Icon = isRed ? CircleAlert : CircleDashed;

  return (
    <div
      role="alert"
      data-coverage-state={verdict.bucket}
      className={cn(
        "flex flex-wrap items-start gap-3 rounded-xl border-2 px-4 py-3",
        isRed
          ? "border-rose-500/60 bg-rose-500/10"
          : "border-amber-500/50 bg-amber-500/10",
        className,
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-5 w-5 shrink-0",
          isRed
            ? "text-rose-600 dark:text-rose-400"
            : "text-amber-600 dark:text-amber-400",
        )}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p
          className={cn(
            "text-sm font-bold",
            isRed
              ? "text-rose-700 dark:text-rose-300"
              : "text-amber-700 dark:text-amber-300",
          )}
        >
          {verdict.title}
        </p>
        <p
          className={cn(
            "break-words text-[12.5px]",
            isRed
              ? "text-rose-800/90 dark:text-rose-200/90"
              : "text-amber-800/90 dark:text-amber-200/90",
          )}
        >
          {verdict.detail}
        </p>
      </div>
      {verdict.offerFix && onAssignHolder ? (
        <Button
          size="sm"
          variant={isRed ? "destructive" : "outline"}
          className="shrink-0"
          onClick={onAssignHolder}
        >
          Assign a Holder
        </Button>
      ) : null}
    </div>
  );
}
