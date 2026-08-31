"use client";

// features/mandates/authoring/AutomationButton.tsx
//
// An affordance that runs a MANDATE BY KEY — mandates all the way down. The
// moment that mandate exists (Arman creates it, no deploy) it just runs. Never
// a hardcoded agent id, never a silent no-op.
//
// 🚨 WHAT AN UNRESOLVABLE KEY LOOKS LIKE (Arman, live, 2026-08-31).
//
// This used to leave the button fully ENABLED when the key resolved to nothing,
// with the explanation in a TOOLTIP and a toast fired on click. Two things were
// wrong with that, and Arman hit both: the button was indistinguishable from a
// working one until he pressed it, and what he got back was a toast reading
// "…which does not exist" — a screen that looked alive, promised a run, and
// then said the thing behind it is missing. `constants.ts` had described the
// intended behaviour correctly the whole time ("renders honestly disabled
// naming the missing key"); the component did something else.
//
// So: ABSENT OR HONEST. When the key does not resolve the control is visibly
// disabled AND the reason is printed BESIDE IT, on the screen, naming the exact
// key to create — because a tooltip is not words on the screen, and a disabled
// button with no sentence teaches nothing. The toast survives as the belt for
// any caller that still routes a click here.
//
// "Does not resolve" covers every dead state the resolver knows, and they are
// all the same fact to a person: no row, a SOFT-DELETED row, a disabled row, a
// row with no Holder, a version-pinned row. `resolveMandate` refuses each of
// them (it filters `deleted_at`, throws on `is_enabled = false`, and throws on
// a holderless or pinned definition), and `useMandate({ optional: true })`
// reports that as `mandate === null` — which is exactly the state this renders.
// Expected unavailability is informational readiness, never an error toast: the
// shared toast boundary persists error/warning as system_error.

import { BrainCircuit, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { useMandate } from "../useMandate";

export function notifyMissingAutomationMandate(mandateKey: string): void {
  toast.info(
    `Not yet — this needs the mandate "${mandateKey}", which does not exist. Create it and this runs.`,
  );
}

/** The sentence the screen prints when the key resolves to nothing. Exported so
 * the guard asserts the copy a person actually reads, not a paraphrase. */
export function missingAutomationMandateLine(mandateKey: string): string {
  return `Not available yet — this runs the job "${mandateKey}", and no live job has that name. Create it and this button works, with no deploy.`;
}

export function AutomationButton({
  mandateKey,
  label,
  runningLabel,
  running,
  onRun,
}: {
  mandateKey: string;
  /** Tight copy — two or three words ("Refine with AI"). */
  label: string;
  runningLabel: string;
  running: boolean;
  onRun: () => void;
}) {
  // optional: an absent automation mandate is the expected starting state —
  // the screen says so; it is not a console error.
  const { mandate, loading } = useMandate(mandateKey, { optional: true });
  const available = mandate !== null;

  const button = (
    <Button
      variant="outline"
      size="sm"
      className="h-7 gap-1.5 text-[12px]"
      // The control cannot do what it offers, so it does not offer it. The
      // sentence below carries the reason; the toast covers a programmatic
      // click that somehow gets past the disabled attribute.
      disabled={running || loading || !available}
      onClick={() => {
        if (!available) {
          notifyMissingAutomationMandate(mandateKey);
          return;
        }
        onRun();
      }}
    >
      {running ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <BrainCircuit className="h-3.5 w-3.5" />
      )}
      {running ? runningLabel : label}
    </Button>
  );

  if (available || loading) return button;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {button}
      <span className="text-[11px] leading-snug text-muted-foreground">
        {missingAutomationMandateLine(mandateKey)}
      </span>
    </div>
  );
}
