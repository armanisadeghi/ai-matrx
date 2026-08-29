/**
 * features/hr/leave/manager/LeaveDecisionDialogs.tsx — the decision and reassign dialogs for
 * SPEC-LEAVE §4.4.
 *
 * 🚨 EVERY ACTION HERE GOES THROUGH `features/hr/tasks/service.ts`. `decideStep` →
 * `public.hr_wf_decide`, `reassignStep` → `public.hr_wf_reassign_step`. This lane owns no
 * decision path of its own: §4.4's whole point is that approving leave from `/hr/leave`, from
 * `/hr/tasks` and from the admin console are the SAME write.
 *
 * 🚨 AND THE VERB COMES FROM `HR_DECISION_VERB`, NEVER FROM A STRING HERE. The engine records
 * decisions in the PAST tense (`approved`, `rejected`, `returned`); a control carries its
 * intent (`approve`) and that one map turns it into the recorded verb. The tasks lane's own
 * header records what happened the last time two spellings existed: the UI had never recorded
 * a decision on any flow, on any surface, ever.
 *
 * 🚨 NEVER-APPROVE-YOURSELF IS THE DOOR'S, NOT THIS DIALOG'S. `hr.wf_decide` enforces it, and
 * a refusal comes back as an envelope rendered in place. A client-side copy of that predicate
 * would be a second authority that can disagree with the first.
 */

"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

import { HrRefusalNotice } from "@/features/hr/tasks/components/HrRefusalNotice";
import { decideStep, reassignStep } from "@/features/hr/tasks/service";
import {
  HR_DECISION_REQUIRES_REASON,
  HR_DECISION_VERB,
  isRefusal,
  type HrDecisionIntent,
  type HrRefusal,
} from "@/features/hr/tasks/types";
import { fetchHrDirectory } from "@/features/hr/service";
import type { HrDirectoryRow } from "@/features/hr/types";

import type { LeaveQueueRow } from "./useLeaveQueue";

const INTENT_TITLE: Record<"approve" | "reject" | "return", string> = {
  approve: "Approve this time off",
  reject: "Deny this time off",
  return: "Send this back for changes",
};

const INTENT_CTA: Record<"approve" | "reject" | "return", string> = {
  approve: "Approve",
  reject: "Deny",
  return: "Send back",
};

/**
 * The findings, re-shown at the moment of decision.
 *
 * `message` is the validator's own sentence and is printed VERBATIM. `code` is a machine token
 * and never reaches the screen — §4.2's rule, and the reason `LeaveConflictFinding.code` is
 * read here only to key the list.
 */
function Findings({ row }: { row: LeaveQueueRow }) {
  const check = row.request?.conflictCheck;
  if (!check) return null;
  const hard = check.hard.filter((f) => f.message);
  const advisory = check.advisory.filter((f) => f.message);
  if (hard.length === 0 && advisory.length === 0) return null;

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
      {hard.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-destructive">
            Checks this request did not pass
          </p>
          {hard.map((finding, index) => (
            <p key={`${finding.code ?? "hard"}-${index}`} className="text-xs text-foreground">
              {finding.message}
            </p>
          ))}
        </div>
      ) : null}
      {advisory.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-foreground">Worth knowing before you decide</p>
          {advisory.map((finding, index) => (
            <p
              key={`${finding.code ?? "advisory"}-${index}`}
              className="text-xs text-muted-foreground"
            >
              {finding.message}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── the decision dialog ──────────────────────────────────────────────────────

export function LeaveDecisionDialog({
  row,
  intent,
  onClose,
  onDecided,
}: {
  row: LeaveQueueRow | null;
  intent: "approve" | "reject" | "return" | null;
  onClose: () => void;
  onDecided: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<HrRefusal | null>(null);

  useEffect(() => {
    setReason("");
    setRefusal(null);
  }, [row?.step_id, intent]);

  if (!row || !intent) return null;

  const decision = HR_DECISION_VERB[intent as HrDecisionIntent];
  // §9.1: a reason on reject/return is a HARD REFUSAL from the door — and a flow type or step
  // definition can require one on approval too. The client blocks the send rather than
  // collecting a decision the database will throw away.
  const reasonRequired =
    HR_DECISION_REQUIRES_REASON.includes(decision) ||
    (intent === "approve" && row.requires_reason_on_approve === true);

  async function submit() {
    if (!row || !intent) return;
    if (reasonRequired && reason.trim() === "") return;
    setBusy(true);
    setRefusal(null);
    try {
      const envelope = await decideStep(
        row.step_id,
        decision,
        reason.trim() === "" ? null : reason.trim(),
      );
      if (isRefusal(envelope)) {
        // `WF_TARGET_CHANGED` returns the change rather than deciding; `WF_CONFLICT` shows what
        // moved. Both are envelopes, and both belong here rather than in a toast.
        setRefusal(envelope);
        return;
      }
      toast.success(
        intent === "approve"
          ? "Approved"
          : intent === "reject"
            ? "Denied"
            : "Sent back for changes",
      );
      onDecided();
      onClose();
    } catch (cause) {
      setRefusal({
        granted: false,
        reason: "transport_failed",
        detail:
          cause instanceof Error
            ? cause.message
            : "We could not reach the workflow engine. Nothing was decided.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{INTENT_TITLE[intent]}</DialogTitle>
          <DialogDescription>
            {row.subject_withheld
              ? "The person's name is withheld from you on this request."
              : (row.subject_label ?? row.title ?? "This request")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Findings row={row} />

          {/*
            §9.6 — the manager sees THAT a case is involved and never which, never the category,
            and never a door to it. This is worded prose, not a masked field.
          */}
          {row.request?.leaveCaseLinked ? (
            <p className="rounded-md border border-border bg-card p-3 text-xs text-muted-foreground">
              This person has an approved leave that HR is managing. Details are held by HR.
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="leave-decision-reason" className="text-xs">
              {reasonRequired ? "Reason (required)" : "Reason (optional)"}
            </Label>
            <Textarea
              id="leave-decision-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                intent === "reject"
                  ? "The employee sees this, so say what would change the answer."
                  : intent === "return"
                    ? "Say what needs to change before this can be decided."
                    : ""
              }
            />
            {reasonRequired ? (
              <p className="text-[11px] text-muted-foreground">
                The engine refuses this decision without a reason, and the person it affects
                reads it.
              </p>
            ) : null}
          </div>

          {refusal ? <HrRefusalNotice refusal={refusal} action="This decision" /> : null}
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || (reasonRequired && reason.trim() === "")}
            variant={intent === "reject" ? "destructive" : "default"}
            onClick={() => void submit()}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {INTENT_CTA[intent]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── the reassign dialog ──────────────────────────────────────────────────────

/**
 * §4.4's Reassign. The door needs an EMPLOYMENT, so the picker is the module's one people list
 * (`hr_directory_list`) rather than a bespoke roster.
 *
 * `workflow.reassign` authority is enforced by `hr.wf_reassign_step`; a caller without it gets
 * an envelope, which renders here. That is deliberate — the alternative is a client-side
 * authority check that can disagree with the server's.
 */
export function LeaveReassignDialog({
  row,
  organizationId,
  onClose,
  onDecided,
}: {
  row: LeaveQueueRow | null;
  organizationId: string | null;
  onClose: () => void;
  onDecided: () => void;
}) {
  const [people, setPeople] = useState<HrDirectoryRow[]>([]);
  const [toEmploymentId, setToEmploymentId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<HrRefusal | null>(null);

  useEffect(() => {
    setToEmploymentId("");
    setReason("");
    setRefusal(null);
  }, [row?.step_id]);

  useEffect(() => {
    if (!organizationId || !row) return;
    let cancelled = false;
    (async () => {
      const result = await fetchHrDirectory({
        organizationId,
        filter: { status: ["active"] },
        limit: 200,
        offset: 0,
      });
      if (cancelled) return;
          setPeople(result.ok ? result.data.rows.filter((p) => p.employment_id != null) : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, row]);

  if (!row) return null;

  async function submit() {
    if (!row || toEmploymentId === "") return;
    setBusy(true);
    setRefusal(null);
    try {
      const envelope = await reassignStep(
        row.step_id,
        toEmploymentId,
        reason.trim() === "" ? null : reason.trim(),
      );
      if (isRefusal(envelope)) {
        setRefusal(envelope);
        return;
      }
      toast.success("Reassigned");
      onDecided();
      onClose();
    } catch (cause) {
      setRefusal({
        granted: false,
        reason: "transport_failed",
        detail:
          cause instanceof Error
            ? cause.message
            : "We could not reach the workflow engine. Nothing was reassigned.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send this decision to somebody else</DialogTitle>
          <DialogDescription>
            The step moves to them. Nothing about the request itself changes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="leave-reassign-to" className="text-xs">
              Who decides it instead
            </Label>
            <Select value={toEmploymentId} onValueChange={setToEmploymentId}>
              <SelectTrigger id="leave-reassign-to">
                <SelectValue placeholder="Choose a person" />
              </SelectTrigger>
              <SelectContent>
                {people.map((person) => (
                  <SelectItem key={person.employment_id ?? ""} value={person.employment_id ?? ""}>
                    {person.display_name}
                    {person.job_title ? ` · ${person.job_title}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="leave-reassign-reason" className="text-xs">
              Why (optional)
            </Label>
            <Textarea
              id="leave-reassign-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {refusal ? <HrRefusalNotice refusal={refusal} action="This reassignment" /> : null}

          <p className="flex items-start gap-2 text-[11px] text-muted-foreground">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Reassigning needs standing the engine checks when you send it. If you do not hold
            it, nothing moves and you will be told here.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || toEmploymentId === ""}
            onClick={() => void submit()}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Reassign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
