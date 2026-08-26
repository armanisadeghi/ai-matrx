"use client";

/**
 * features/hr/time/overtime/components/WriteUpDoor.tsx — SPEC-TIME §4.6's four rules, in one place.
 *
 * 1. 🚨 **THE DOOR IS OFFERED, NEVER AUTOMATIC.** No pattern, no count and no threshold ever creates
 *    a corrective action. A human decides that a person is being written up (D6). There is no code
 *    path in this component that opens one without a click.
 *
 * 2. 🚨 **SENSITIVITY FOLLOWS THE TARGET, NOT THE SOURCE.** `hr.corrective_action` is CONF, so
 *    opening the door requires employee-relations authority. For a manager without it the door is
 *    **ABSENT, not disabled** — a greyed "Write up" button tells someone a write-up exists and that
 *    they are not trusted with it, which is itself a disclosure about the person on screen.
 *
 * 3. **The link is one-way evidence.** The corrective action cites the exception; the exception
 *    records `corrective_action_id`. Resolving the exception never edits the corrective action, and
 *    voiding a corrective action never rewrites the attendance record.
 *
 * 4. 🚨 **A DISPUTED TIMECARD IS NOT WRITE-UP EVIDENCE.** Where the employee has an open
 *    disagreement covering those hours, the door renders **with the disagreement shown** and the
 *    manager must acknowledge it before proceeding. Writing somebody up over hours they have said
 *    are wrong, without having read that they said so, is the specific failure this guard prevents.
 *
 * And underneath all four: the hours in question are **paid**. A write-up is a management response
 * to how overtime came about; it is never a payment decision.
 */

import { useState } from "react";
import { FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { announceComingSoon } from "@/lib/coming-soon/announce";
import { UNAPPROVED_OT_IS_PAID } from "../overtimeVocabulary";

export interface WriteUpDoorProps {
  /** Employee-relations authority over THIS subject. Without it the door does not render at all. */
  canOpenCorrectiveAction: boolean;
  /** The employee's own words, when a disagreement covers these hours. */
  openDisputeNote: string | null;
  employeeDisplayName: string;
  /** Already linked — the door becomes a pointer, never a second write-up. */
  existingCorrectiveActionId: string | null;
}

export function WriteUpDoor({
  canOpenCorrectiveAction,
  openDisputeNote,
  employeeDisplayName,
  existingCorrectiveActionId,
}: WriteUpDoorProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  // RULE 2 — ABSENT, not disabled. Nothing renders. No hint that a door exists.
  if (!canOpenCorrectiveAction) return null;

  if (existingCorrectiveActionId) {
    return (
      <section className="rounded-lg border border-border bg-card p-4">
        <h4 className="text-[13px] font-semibold text-foreground">Corrective action</h4>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          These hours are already cited in a corrective action. The link is one-way evidence —
          resolving anything here never edits it, and voiding it never rewrites the attendance
          record.
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-2 min-h-[44px]"
          onClick={() => void announceComingSoon("hr.corrective-action-record")}
        >
          <FileText className="mr-1.5 h-4 w-4" aria-hidden />
          Open the corrective action
        </Button>
      </section>
    );
  }

  const blockedByUnacknowledgedDispute = openDisputeNote !== null && !acknowledged;

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h4 className="text-[13px] font-semibold text-foreground">Corrective action</h4>
      <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
        Optional, and never automatic — nothing about this overtime creates a write-up on its own. If
        you decide there is a pattern worth documenting, this opens one pre-filled with the objective
        facts: dates, hours, thresholds crossed, alerts delivered, and whether a request was denied.
      </p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
        {UNAPPROVED_OT_IS_PAID}
      </p>

      {/* RULE 4 — the disagreement is SHOWN, in the employee's own words, and must be acknowledged. */}
      {openDisputeNote !== null ? (
        <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
          <p className="text-[12px] font-semibold text-amber-800 dark:text-amber-300">
            {employeeDisplayName} disagrees with the hours these facts come from
          </p>
          <blockquote className="mt-1.5 border-l-2 border-amber-500/50 pl-2.5 text-[12px] italic leading-relaxed text-amber-900 dark:text-amber-200">
            {openDisputeNote}
          </blockquote>
          <p className="mt-1.5 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
            A disputed timecard is not write-up evidence on its own. Read what they said before you
            document anything against it.
          </p>
          <label className="mt-2.5 flex items-start gap-2 text-[12px] text-amber-900 dark:text-amber-200">
            <Checkbox
              checked={acknowledged}
              onCheckedChange={(next) => setAcknowledged(next === true)}
              className="mt-0.5"
            />
            <span>I have read the disagreement above.</span>
          </label>
        </div>
      ) : null}

      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-3 min-h-[44px]"
        disabled={blockedByUnacknowledgedDispute}
        onClick={() => void announceComingSoon("hr.corrective-action-create")}
      >
        <FileText className="mr-1.5 h-4 w-4" aria-hidden />
        Start a corrective action
      </Button>
    </section>
  );
}
