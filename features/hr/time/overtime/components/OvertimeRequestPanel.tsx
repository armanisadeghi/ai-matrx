"use client";

/**
 * features/hr/time/overtime/components/OvertimeRequestPanel.tsx — ROUTE 31b,
 * `/hr/time/overtime/[requestId]`.
 *
 * 🚨 ONE COMPONENT, `viewer` SWAPPED (SPEC-UI-IA §3.4 row 31b): *"the employee's request view and
 * the manager's decision view are the same component with `viewer` swapped."* Two components would
 * drift, and the half that drifts is always the one fewer people look at — which here is the
 * employee's, the person whose pay is being discussed.
 *
 * 🚨 THE DECISION BAR SAYS, IN WORDS, THAT DENYING DOES NOT WITHHOLD PAY — every time, on the deny
 * path especially. A manager who believes a denial withholds pay will use denial as a punishment,
 * and will be wrong in a way that becomes a wage claim.
 *
 * 🚨 THE ONLY APPROVAL ENGINE IS THE WORKFLOW ENGINE. Approve / approve-with-a-cap / deny all go to
 * `hr_wf_decide`. There is no approvals table here, no approver picker, no second inbox.
 *
 * 🚨 `WF_CONFLICT` IS SHOWN, NEVER SILENTLY REJECTED. The conflict re-check runs at EVERY decision,
 * not just at submit, and when it fires the approver is shown exactly what changed.
 *
 * 🚨 NO ACTION BY THE DEADLINE ESCALATES. It never auto-approves and it never auto-denies.
 *
 * NO CLIENT COMPUTES HOURS: every figure is the server's, and the E-55 projection is labelled one.
 */

import { useState } from "react";
import { AlertTriangle, Check, Clock, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { toast } from "@/lib/toast";
import type { HrFixtureCase } from "@/features/hr/mock/transport";
import { formatHours, formatLocalDate } from "../../shared/format";
import { HrRpcError } from "../../api/rpc";
import type { OvertimePreapprovalRow } from "../../api/types";
import { decideOvertimePreapproval } from "../api/overtimeReads";
import type { OvertimeEvaluation } from "../api/overtimeReads";
import {
  DENIAL_DOES_NOT_WITHHOLD_PAY,
  NO_DECISION_ESCALATES,
  UNAPPROVED_OT_IS_PAID,
  thresholdAxisLabel,
} from "../overtimeVocabulary";
import { displayState } from "./OvertimeQueueTable";
import { OvertimeStateChip } from "./OvertimeStateChip";
import { WriteUpDoor } from "./WriteUpDoor";

/** The one prop that changes what this component is. */
export type OvertimeViewer = "employee" | "manager";

export interface OvertimeRequestPanelProps {
  request: OvertimePreapprovalRow;
  viewer: OvertimeViewer;
  /** The live projection for this person's week. Always prospective, always labelled. */
  evaluation: OvertimeEvaluation | null;
  /** The open workflow step this viewer may answer, when there is one. */
  decidableStepId: string | null;
  /** Employee-relations authority over this subject. Without it the write-up door is ABSENT. */
  canOpenCorrectiveAction: boolean;
  /** The employee's own words where a disagreement covers these hours. */
  openDisputeNote: string | null;
  mockCase?: HrFixtureCase;
  onDecided: () => void;
}

export function OvertimeRequestPanel({
  request,
  viewer,
  evaluation,
  decidableStepId,
  canOpenCorrectiveAction,
  openDisputeNote,
  mockCase,
  onDecided,
}: OvertimeRequestPanelProps) {
  const [capText, setCapText] = useState("");
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<Record<string, unknown> | null>(null);

  const isManager = viewer === "manager";
  const canDecide = isManager && decidableStepId !== null;

  const decide = async (decision: "approve" | "reject", reason: string) => {
    if (!decidableStepId) return;
    setBusy(true);
    setConflict(null);
    try {
      const capValue = capText.trim() === "" ? null : Number(capText);
      const result = await decideOvertimePreapproval(
        {
          stepId: decidableStepId,
          decision,
          // The cap is what later intervals are matched against. Beyond it is paid and flagged.
          approvedHours: decision === "approve" ? capValue : null,
          reason,
        },
        { mockCase },
      );
      if (result.conflict) {
        // 🚨 Shown, never silently rejected.
        setConflict(result.conflict);
        return;
      }
      toast.success(decision === "approve" ? "Overtime approved." : "Overtime denied.", {
        description:
          decision === "reject" ? DENIAL_DOES_NOT_WITHHOLD_PAY : undefined,
      });
      onDecided();
    } catch (err: unknown) {
      toast.error(
        err instanceof HrRpcError
          ? err.userMessage
          : err instanceof Error
            ? err.message
            : "The decision did not go through.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">
              {isManager ? request.employeeDisplayName : "Your overtime request"}
            </h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {formatLocalDate(request.coversFrom.slice(0, 10), { year: true })} –{" "}
              {formatLocalDate(request.coversTo.slice(0, 10), { year: true })} · raised by{" "}
              {request.requestedByName}
            </p>
          </div>
          <OvertimeStateChip state={displayState(request)} />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          <Figure label="Hours requested" value={formatHours(request.requestedHours)} />
          <Figure
            label="Approved cap"
            value={request.approvedHours === null ? "—" : formatHours(request.approvedHours)}
          />
          <Figure
            label="Actually worked"
            value={request.actualOtHours === null ? "—" : formatHours(request.actualOtHours)}
          />
          <Figure
            label="Difference"
            value={request.varianceHours === null ? "—" : formatHours(request.varianceHours)}
          />
        </dl>

        {request.reasonNote ? (
          <p className="mt-3 text-[12px] leading-relaxed text-foreground">{request.reasonNote}</p>
        ) : null}

        {/* 🚨 Paid, flagged. Wherever the flag shows, the reassurance shows with it. */}
        {request.unapprovedOtFlagged ? (
          <p className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{UNAPPROVED_OT_IS_PAID}</span>
          </p>
        ) : null}

        {request.decidedAt ? (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Decided {formatLocalDate(request.decidedAt.slice(0, 10), { year: true })}
            {request.decidedByName ? ` by ${request.decidedByName}` : ""}.
          </p>
        ) : null}
      </section>

      {/* ── The thresholds this request would cross — weekly AND daily AND seventh-day. ───────── */}
      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />
          What this would cross
        </h3>
        {request.thresholdAxes.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {request.thresholdAxes.map((axis) => (
              <li
                key={axis}
                className="rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {thresholdAxisLabel(axis)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-[12px] text-muted-foreground">
            No threshold axis was recorded on this request.
          </p>
        )}

        {evaluation ? (
          <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Projection — not paid hours
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-foreground">
              {formatHours(evaluation.hours_worked_to_date)} h already worked this workweek, with a
              projection of {formatHours(evaluation.projected_week_hours)} h. The figure that gets
              paid is calculated from the closed workweek, not from this projection.
            </p>
            {evaluation.daily ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Today {formatHours(evaluation.daily.hours_today)} h
                {typeof evaluation.daily.daily_ot_at_hours === "number"
                  ? ` · daily overtime at ${formatHours(evaluation.daily.daily_ot_at_hours)} h`
                  : ""}
              </p>
            ) : null}
            {evaluation.flags.map((flag, i) => (
              <p
                key={`${flag.code}-${i}`}
                className="mt-1.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400"
              >
                {flag.message}
              </p>
            ))}
          </div>
        ) : null}
      </section>

      {/* ── The decision. Manager only; the employee sees the same panel without it. ──────────── */}
      {isManager ? (
        <section className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-[13px] font-semibold text-foreground">Your decision</h3>

          {/* 🚨 THE SENTENCE. At decision time, in words, before either button. */}
          <p className="mt-1.5 rounded-md border border-border bg-muted/50 px-3 py-2 text-[12px] leading-relaxed text-foreground">
            {DENIAL_DOES_NOT_WITHHOLD_PAY}
          </p>

          {conflict ? (
            <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
              <p className="text-[12px] font-semibold text-amber-800 dark:text-amber-300">
                Something changed since this was raised
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-amber-800 dark:text-amber-300">
                Your decision was not applied. Here is what is different now — read it and decide
                again.
              </p>
              <pre className="mt-1.5 overflow-x-auto rounded bg-background/60 p-2 text-[11px] text-foreground">
                {JSON.stringify(conflict, null, 2)}
              </pre>
            </div>
          ) : null}

          {canDecide ? (
            <>
              <div className="mt-3 max-w-xs">
                <label
                  htmlFor="ot-cap"
                  className="block text-[11px] font-medium text-muted-foreground"
                >
                  Approve with a cap (optional)
                </label>
                <Input
                  id="ot-cap"
                  inputMode="decimal"
                  placeholder={`${formatHours(request.requestedHours)} requested`}
                  value={capText}
                  onChange={(e) => setCapText(e.target.value)}
                  className="mt-1 min-h-[44px]"
                />
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  A cap is what later hours are matched against. Overtime beyond it is still paid —
                  it is flagged for review, exactly like overtime nobody asked about.
                </p>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="min-h-[44px]"
                  disabled={busy}
                  onClick={() => setPending("approve")}
                >
                  <Check className="mr-1.5 h-4 w-4" aria-hidden />
                  {capText.trim() ? "Approve with this cap" : "Approve"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-[44px]"
                  disabled={busy}
                  onClick={() => setPending("reject")}
                >
                  <X className="mr-1.5 h-4 w-4" aria-hidden />
                  Deny
                </Button>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                {NO_DECISION_ESCALATES}
              </p>
            </>
          ) : (
            <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
              There is no open decision on this request for you right now.
            </p>
          )}
        </section>
      ) : (
        <section className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-[13px] font-semibold text-foreground">What happens next</h3>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
            Your manager decides whether this overtime should be worked. Whatever they decide, any
            overtime you actually work is paid — a decision here is about whether the overtime should
            happen, never about whether you are paid for it.
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
            {NO_DECISION_ESCALATES}
          </p>
        </section>
      )}

      {isManager ? (
        <WriteUpDoor
          canOpenCorrectiveAction={canOpenCorrectiveAction}
          openDisputeNote={openDisputeNote}
          employeeDisplayName={request.employeeDisplayName}
          existingCorrectiveActionId={request.correctiveActionId}
        />
      ) : null}

      {pending ? (
        <TextInputDialog
          open
          onOpenChange={(open) => {
            if (!open) setPending(null);
          }}
          title={pending === "approve" ? "Approve this overtime" : "Deny this overtime"}
          description={
            pending === "approve"
              ? "Why this overtime should be worked. The reason is part of the decision record."
              : DENIAL_DOES_NOT_WITHHOLD_PAY
          }
          multiline
          rows={3}
          confirmLabel={pending === "approve" ? "Approve" : "Deny"}
          busy={busy}
          validate={(value) => (value.trim().length === 0 ? "A reason is required." : null)}
          onConfirm={async (value) => {
            const decision = pending;
            setPending(null);
            if (decision) await decide(decision, value.trim());
          }}
        />
      ) : null}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
