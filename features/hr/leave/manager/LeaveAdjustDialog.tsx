/**
 * features/hr/leave/manager/LeaveAdjustDialog.tsx — SPEC-LEAVE §6, the balance correction.
 *
 * The only way a balance changes outside accrual, approved usage, the policy-year boundary,
 * payout and reinstatement. Deliberately narrow, always attributed, always reasoned.
 *
 * 🚨 IT APPENDS. `hr.leave_adjust` writes ONE `adjustment` ledger entry with its calculation
 * snapshot and refreshes the cache in the same transaction. Nothing here edits or deletes an
 * entry, and reversing an adjustment is a NEW entry — never an edit.
 *
 * 🚨 EVERY GUARD IS THE DOOR'S, RESTATED AT THE CONTROL — NEVER REPLACED BY IT.
 * Never-adjust-your-own-balance, the 20/60-character note minimum, the `hr_owner` gate below
 * the negative floor, and the two reasons a statutory balance may be reduced for are all
 * enforced in `hr.leave_adjust`. This dialog says them in advance so nobody types a paragraph
 * only to be refused — and when the door refuses anyway, its own sentence is what appears.
 *
 * 🚨 THE ONE PLACE THIS SCREEN DOES ARITHMETIC, AND WHY IT IS DELIBERATE.
 * §0 forbids a screen doing its own arithmetic on balances; §6 requires that *"the dialog shows
 * the balance before and after before the confirm button enables"*. The resulting figure below
 * is a PREVIEW OF THIS ACTION, not a rendered balance: the authority is the `balance_after` the
 * server writes on the ledger entry, which is read back and shown once the write lands. It is
 * labelled for exactly that, it is never persisted, and it never appears anywhere a balance is
 * being reported.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Loader2, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";

import { isHrDenied } from "@/features/hr/types";

import { LeaveBalanceBlock } from "../components/LeaveBalanceBlock";
import { adjustLeaveBalance, leaveAdjustRefusal } from "./api/service";
import {
  LEAVE_ADJUSTMENT_REASONS,
  LEAVE_STATUTORY_REMOVAL_REASONS,
  type LeaveAdjustRefusal,
  type LeaveBalanceRow,
} from "./api/types";

const NOTE_MIN = 20;
const NOTE_MIN_OTHER = 60;

export function LeaveAdjustDialog({
  row,
  ledgerHref,
  onClose,
  onAdjusted,
}: {
  row: LeaveBalanceRow | null;
  ledgerHref: string | null;
  onClose: () => void;
  onAdjusted: () => void;
}) {
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [hours, setHours] = useState("");
  const [reasonCategory, setReasonCategory] = useState<string>("correction_of_error");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<LeaveAdjustRefusal | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    setDirection("add");
    setHours("");
    setReasonCategory("correction_of_error");
    setNote("");
    setRefusal(null);
    setFailure(null);
  }, [row?.employmentId, row?.policyId]);

  const parsedHours = hours.trim() === "" ? null : Number(hours);
  const hoursValid = parsedHours !== null && Number.isFinite(parsedHours) && parsedHours > 0;

  const noteMin = reasonCategory === "other" ? NOTE_MIN_OTHER : NOTE_MIN;
  const noteValid = note.trim().length >= noteMin;

  const statutory = (row?.statutoryBasisRuleClass ?? null) !== null;
  const statutoryRemovalOk =
    !statutory ||
    direction === "add" ||
    LEAVE_STATUTORY_REMOVAL_REASONS.includes(reasonCategory as never);

  const before = row?.ledgerBalance ?? null;
  /** The PREVIEW of this action (see the header). Never a reported balance. */
  const after = useMemo(() => {
    if (before === null || !hoursValid || parsedHours === null) return null;
    return direction === "add" ? before + parsedHours : before - parsedHours;
  }, [before, direction, hoursValid, parsedHours]);

  if (!row) return null;

  const canConfirm =
    hoursValid && noteValid && statutoryRemovalOk && after !== null && !busy;

  async function submit(confirmBelowFloor = false) {
    if (!row?.employmentId || !row.policyId || parsedHours === null) return;
    setBusy(true);
    setRefusal(null);
    setFailure(null);

    const result = await adjustLeaveBalance({
      employmentId: row.employmentId,
      leavePolicyId: row.policyId,
      direction,
      hours: parsedHours,
      reasonCategory,
      note: note.trim(),
      confirmBelowFloor,
    });
    setBusy(false);

    if (result.ok) {
      toast.success(
        result.data.balanceAfter === null
          ? "Balance adjusted"
          : `Balance adjusted — now ${result.data.balanceAfter} h`,
      );
      onAdjusted();
      onClose();
      return;
    }

    if (isHrDenied(result)) {
      setRefusal(leaveAdjustRefusal(result));
      return;
    }
    setFailure(result.message);
  }

  const needsSecondConfirmation = refusal?.reason === "confirmation_required";

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Adjust this balance by hand</DialogTitle>
          <DialogDescription>
            {row.employeeName ?? "This person"} · {row.policyName ?? "this policy"}. The person
            is always told what changed, by how much, why and by whom.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          {/*
            §5's ONE balance component, so the admin sees the same five figures the employee
            sees before they change one of them.
          */}
          <LeaveBalanceBlock
            figures={row}
            sentence={row.sentence}
            ledgerHref={ledgerHref}
            title="Where this balance stands now"
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="leave-adjust-direction" className="text-xs">
                Add or remove
              </Label>
              {/* Never a raw signed number — §6. */}
              <Select
                value={direction}
                onValueChange={(value) => setDirection(value === "remove" ? "remove" : "add")}
              >
                <SelectTrigger id="leave-adjust-direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">Add hours</SelectItem>
                  <SelectItem value="remove">Remove hours</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="leave-adjust-hours" className="text-xs">
                Hours
              </Label>
              <Input
                id="leave-adjust-hours"
                inputMode="decimal"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="8"
              />
              {row.incrementMinutes !== null ? (
                <p className="text-[11px] text-muted-foreground">
                  This policy books time in {row.incrementMinutes}-minute increments.
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="leave-adjust-reason" className="text-xs">
              Why
            </Label>
            <Select value={reasonCategory} onValueChange={setReasonCategory}>
              <SelectTrigger id="leave-adjust-reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAVE_ADJUSTMENT_REASONS.map((reason) => (
                  <SelectItem key={reason.slug} value={reason.slug}>
                    {reason.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!statutoryRemovalOk ? (
              <p role="alert" className="text-[11px] leading-snug text-destructive">
                Time earned under a legal minimum can only be removed to correct an error or to
                recover an over-accrual, and the removal is recorded for compliance.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="leave-adjust-note" className="text-xs">
              What happened
            </Label>
            <Textarea
              id="leave-adjust-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="This goes on the ledger entry for good, and the employee reads it."
            />
            <p className="text-[11px] text-muted-foreground">
              {note.trim().length} of at least {noteMin} characters.
            </p>
          </div>

          {/* §6's before-and-after. Labelled as a preview of THIS action. */}
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/40 p-3">
            <div className="space-y-0.5">
              <p className="text-[11px] text-muted-foreground">Balance now</p>
              <p className="tabular-nums text-sm font-semibold text-foreground">
                {before === null ? "Not provided" : `${before} h`}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="space-y-0.5">
              <p className="text-[11px] text-muted-foreground">
                What this change would make it
              </p>
              <p
                className={
                  after !== null && after < 0
                    ? "tabular-nums text-sm font-semibold text-destructive"
                    : "tabular-nums text-sm font-semibold text-foreground"
                }
              >
                {after === null ? "—" : `${after} h`}
              </p>
            </div>
          </div>

          {refusal ? (
            <div
              role="alert"
              className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3"
            >
              <p className="text-sm leading-relaxed text-foreground">
                {refusal.detail ??
                  "This adjustment was refused and the server did not say why, which is itself a defect."}
              </p>
              {needsSecondConfirmation ? (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void submit(true)}
                >
                  Yes — leave the balance at{" "}
                  {refusal.resultingBalance === null
                    ? "the amount above"
                    : `${refusal.resultingBalance} h`}
                </Button>
              ) : null}
            </div>
          ) : null}

          {failure ? (
            <p role="alert" className="text-sm text-destructive">
              {failure}
            </p>
          ) : null}

          {statutory ? (
            <p className="flex items-start gap-2 text-[11px] leading-snug text-muted-foreground">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              This policy carries a legal minimum. Removing time from it opens a compliance
              record automatically — that trail is the point.
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={!canConfirm} onClick={() => void submit(false)}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {direction === "add" ? "Add the hours" : "Remove the hours"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
