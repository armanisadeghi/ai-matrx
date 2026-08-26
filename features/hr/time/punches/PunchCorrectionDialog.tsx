"use client";

/**
 * features/hr/time/punches/PunchCorrectionDialog.tsx — the punch edit lane (SPEC-TIME §4.1, L3-54's
 * action).
 *
 * 🚨 **A PUNCH IS NEVER EDITED. IT IS VOIDED AND REPLACED.** `hr.punch` is immutable except for its
 * three void columns, and both punches stay visible on route 30 forever, the void struck through
 * and the pair linked. This dialog cannot express an edit, because the contract cannot.
 *
 * 🚨 **A REASON IS REQUIRED AND CANNOT BE A SINGLE CHARACTER.** Arman's ruling of 2026-08-25 (L3
 * readiness Q3) is that the friction stays and none of it is org-overridable downward. There is no
 * "trusted manager" mode and no lighter default for orgs that ask for one.
 *
 * 🚨 **THE EMPLOYEE IS ALWAYS NOTIFIED, AND THIS SAYS SO BEFORE THE MANAGER COMMITS.** *"A silently
 * edited timecard is a wage claim."* The notification is not a setting; surfacing it here is what
 * makes the manager's decision an informed one.
 *
 * 🚨 **THE BULK CASE IS THE ERGONOMIC IMPROVEMENT, AND THE ONLY ONE.** `correctPunches` takes an
 * ARRAY because a manager fixing the same clock-in error across nine days performs **one reasoned
 * action with one reason and nine audit trails** — never one quiet action with one audit trail. The
 * result's `auditTrailCount` always equals the punch count, and this dialog shows it.
 *
 * 🚨 **AFTER LOCK THE EDIT IS ABSENT.** The caller does not render this dialog for a locked period;
 * if the server refuses anyway, `RefusalNotice` offers the adjustment lane instead of an error.
 */

import { useState } from "react";
import { BellRing, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import type { HrFixtureCase } from "@/features/hr/mock/transport";

import { correctPunches, voidPunch, type PunchCorrectionResult } from "../api/service";
import type { PunchRow } from "../api/types";
import { formatStampedTimeWithZone, pluralize } from "../shared/format";
import { RefusalNotice } from "../shared/RefusalNotice";
import { PUNCH_KIND_LABELS } from "../shared/vocabulary";

/** §4.1: *"Reason is required and cannot be a single character."* */
const MIN_REASON_LENGTH = 2;

export type PunchCorrectionMode = "correct" | "void";

export function PunchCorrectionDialog({
  open,
  onOpenChange,
  punches,
  mode,
  /** Where the post-lock lane lives, offered when the server says the period is locked. */
  adjustmentHref,
  mockCase,
  onCommitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** One punch, or the SAME mistake across many days — the bulk case §4.1 ruled in. */
  punches: PunchRow[];
  mode: PunchCorrectionMode;
  adjustmentHref?: string;
  mockCase?: HrFixtureCase;
  onCommitted: () => void;
}) {
  const [reason, setReason] = useState("");
  const [replacementTime, setReplacementTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<PunchCorrectionResult | null>(null);

  const bulk = punches.length > 1;
  const reasonOk = reason.trim().length >= MIN_REASON_LENGTH;

  async function commit() {
    setBusy(true);
    setError(null);
    try {
      const outcome =
        mode === "void"
          ? await voidPunch(punches[0].id, reason.trim(), { mockCase })
          : await correctPunches(
              punches.map((p) => p.id),
              // Only the field being changed. The server writes `original_values` verbatim from the
              // punch it voids — the client never sends what it thinks the old value was.
              replacementTime ? { occurred_at_local_time: replacementTime } : {},
              reason.trim(),
              { mockCase },
            );
      setResult(outcome);
      toast.success(
        mode === "void" ? "Punch voided." : `${pluralize(outcome.auditTrailCount, "correction")} recorded.`,
      );
      onCommitted();
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error(String(caught)));
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setReason("");
    setReplacementTime("");
    setResult(null);
    setError(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {result
              ? "Recorded"
              : mode === "void"
                ? "Void this punch"
                : bulk
                  ? `Correct ${pluralize(punches.length, "punch", "punches")}`
                  : "Correct this punch"}
          </DialogTitle>
          <DialogDescription>
            {mode === "void"
              ? "The punch stays on the record, struck through, with your reason attached. Nothing is deleted."
              : "The punch is not edited. It is voided and a replacement is written beside it, and both stay visible forever."}
          </DialogDescription>
        </DialogHeader>

        <RefusalNotice error={error} adjustmentHref={adjustmentHref} />

        {result ? (
          <div className="space-y-2 text-sm">
            <p>
              {pluralize(result.voidedPunchIds.length, "punch", "punches")} voided
              {result.replacementPunchIds.length > 0
                ? `, ${pluralize(result.replacementPunchIds.length, "replacement")} written`
                : ""}
              .
            </p>
            {/* One reasoned action, N audit trails. The count is the proof. */}
            <p className="text-muted-foreground">
              {pluralize(result.auditTrailCount, "audit record")} written — one for each punch, all
              carrying your single reason.
            </p>
            {result.employeeNotified ? (
              <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-2 text-xs">
                <BellRing className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                The employee has been told what changed, who changed it and why.
              </p>
            ) : null}
            {result.requiresReapproval ? (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-2.5 py-2 text-xs">
                This pay period had already been approved, so it has to be approved again before it
                can go to payroll.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <ul className="space-y-1 rounded-md border border-border bg-muted/40 px-2.5 py-2 text-xs">
              {punches.map((punch) => (
                <li key={punch.id}>
                  {PUNCH_KIND_LABELS[punch.punchKind]} ·{" "}
                  {formatStampedTimeWithZone(punch.occurredAt, punch.tz)} · {punch.localWorkDate}
                </li>
              ))}
            </ul>

            {bulk ? (
              <p className="text-xs text-muted-foreground">
                You are fixing the same mistake on {pluralize(punches.length, "day")}. One reason
                covers all of them, and {punches.length} separate audit records are written.
              </p>
            ) : null}

            {mode === "correct" ? (
              <div className="space-y-1.5">
                <label htmlFor="punch-replacement" className="block text-sm font-medium">
                  The corrected time
                </label>
                <Input
                  id="punch-replacement"
                  type="time"
                  value={replacementTime}
                  onChange={(event) => setReplacementTime(event.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  In the punch&rsquo;s own time zone. Moving a punch to a different day is not a
                  correction — that is a void plus a new punch on the right day.
                </p>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label htmlFor="punch-reason" className="block text-sm font-medium">
                Why? This is required.
              </label>
              <Textarea
                id="punch-reason"
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="For example: the employee reported the tablet did not record their clock-out."
              />
            </div>

            {/* Stated BEFORE the commit, not after. */}
            <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-2 text-xs">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              The employee will be told what changed, who changed it and why. That is not something
              this organisation can switch off.
            </p>
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button type="button" onClick={close}>
              Done
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button type="button" disabled={busy || !reasonOk} onClick={() => void commit()}>
                {mode === "void" ? "Void it" : "Record the correction"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
