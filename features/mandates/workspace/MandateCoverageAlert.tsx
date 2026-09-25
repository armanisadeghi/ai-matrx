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
// ONE CLASSIFICATION, THE SERVER'S — for the WORDS "Assigned" / "Running on
// fallback" / "Holder missing" (green/orange/red). This never invents its own
// verdict on a holder, a binding or a pin — it reads `GET
// /mandates/coverage/states` (`aidream/services/mandates/coverage.py::
// compute_mandate_coverage`) and prints that report's own `reason` verbatim.
//
// 🚨 BUT A SCREEN NEVER LIES, EVEN WHEN THE LIE IS THE SERVER'S (2026-09-22).
// `compute_mandate_coverage` counts only an `org`/`user` binding as an
// explicit assignment (`_ASSIGNING_PRINCIPALS`) — a `global` binding, which
// the Holder tab below this banner reads and names, does not count there. A
// Mandate bound only at the global rung with no `default_holder_id` on its
// own definition landed on `red` / "Holder missing" from the server while the
// tab one scroll down showed an assigned agent and its mapping — one page,
// two answers. `resolvedHolder` carries the SAME door the tab reads
// (`systemRungFactsOf` / the resolved verdict — see
// `resolvedHolderForBannerOf` in `../workspace/MandateWorkspace.tsx`), and
// when it names a Holder the server's `red` said was missing, the banner
// says so precisely — "Bound … ; no platform default Holder" — rather than
// repeat a word the rest of the page already contradicts. The server's
// verdict is still the only source for orange/green and for the true
// "nothing is bound anywhere" red; this only ever SOFTENS an incorrect
// `red`, never invents a `red`/`orange` of its own.
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
 * THE TITLE FOR `red`. One short line and one button — never a paragraph
 * (Arman, 2026-09-24: "Mandate Binding Needed [Bind Agent or Workflow]").
 */
export const RED_TITLE = `Mandate ${RED_WORD.toLowerCase()}`;

/** The one label for the fix control, on every banner that offers it. */
export const BIND_ACTION_LABEL = "Bind agent or workflow";

/** The same door the Holder tab reads — see `resolvedHolderForBannerOf`. */
export interface ResolvedHolderForBanner {
  holderName: string;
  scopePhrase: string;
}

export function mandateCoverageAlertVerdict(args: {
  row: MandateCoverageStateRow | null | undefined;
  loading: boolean;
  error: string | null;
  /** `null`/omitted when nothing actually resolves — the genuine "missing" case. */
  resolvedHolder?: ResolvedHolderForBanner | null;
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
    // THE BANNER MUST NEVER CONTRADICT THE TAB BELOW IT. The server counts
    // only an org/user binding as an assignment; a global binding (or any
    // rung this door resolves) is real and the tab already shows it. Say
    // THAT, precisely, instead of "Holder missing".
    if (args.resolvedHolder) {
      return {
        kind: "state",
        bucket: "orange",
        title: `No default binding — runs on ${args.resolvedHolder.holderName}`,
        detail: "",
        offerFix: true,
      };
    }
    return {
      kind: "state",
      bucket: "red",
      title: RED_TITLE,
      detail: "",
      offerFix: true,
    };
  }

  return {
    kind: "state",
    bucket: "orange",
    title: COVERAGE_META.orange.label,
    detail: "",
    offerFix: true,
  };
}

export function MandateCoverageAlert({
  mandateKey,
  onAssignHolder,
  className,
  resolvedHolder,
}: {
  mandateKey: string;
  /**
   * Where a Holder is actually chosen. Omitted by a host that has no such
   * control — and then no control is drawn, because a button that goes nowhere
   * is worse than no button.
   */
  onAssignHolder?: () => void;
  className?: string;
  /**
   * The SAME resolution the Holder tab below this banner renders — see
   * `resolvedHolderForBannerOf` in `../workspace/MandateWorkspace.tsx`. Never
   * computed here; passed down so the two never disagree.
   */
  resolvedHolder?: ResolvedHolderForBanner | null;
}) {
  // The registry-wide report: this page is about ONE Mandate whose owner may be
  // any organization, so scoping the report to the viewer's active org would
  // silently answer "unanswered" for a Mandate another org homes.
  const { states, loading, error } = useMandateCoverageStates(null);
  const verdict = mandateCoverageAlertVerdict({
    row: states.get(mandateKey),
    loading,
    error,
    resolvedHolder,
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
        "flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2",
        isRed
          ? "border-rose-500/60 bg-rose-500/10"
          : "border-amber-500/50 bg-amber-500/10",
        className,
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0",
          isRed
            ? "text-rose-600 dark:text-rose-400"
            : "text-amber-600 dark:text-amber-400",
        )}
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p
          className={cn(
            "text-sm font-semibold",
            isRed
              ? "text-rose-700 dark:text-rose-300"
              : "text-amber-700 dark:text-amber-300",
          )}
        >
          {verdict.title}
        </p>
        {verdict.detail ? (
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
        ) : null}
      </div>
      {verdict.offerFix && onAssignHolder ? (
        <Button
          size="sm"
          variant={isRed ? "destructive" : "outline"}
          className="shrink-0"
          onClick={onAssignHolder}
        >
          {BIND_ACTION_LABEL}
        </Button>
      ) : null}
    </div>
  );
}
