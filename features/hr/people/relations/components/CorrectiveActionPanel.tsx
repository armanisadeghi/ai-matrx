// features/hr/people/relations/components/CorrectiveActionPanel.tsx
//
// The four corrective-action states, the ladder chain, the acknowledgment and
// the outcome (SPEC-EMPLOYEES §4.8).
//
// 🚨 `esign` IS **ABSENT** FOR A SUBJECT WITH NO LOGIN — not disabled, not
// "requires an account". Kiosk-only staff are first-class citizens of this
// product, and nothing anywhere may assume `login_user_id IS NOT NULL`. They
// get paper or a witnessed verbal, and the printed copy is the delivery.
//
// 🚨 A REFUSAL TO ACKNOWLEDGE IS A VALID OUTCOME, recorded as such, never a
// stuck flow. "Declined to sign" sits in the same list as the other three
// choices, at the same weight, because a person is allowed to decline.
//
// 🚨 THE EMPLOYEE'S STATEMENT IS THE EMPLOYEE'S OWN WORDS. The issuer can never
// edit it. It renders here read-only for everyone; the only surface that writes
// it is the subject's own acknowledgment in `/hr/tasks`. Same preserved-
// disagreement rule as timesheet attestation.

"use client";

import { useState } from "react";
import { FileSignature, Link2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import {
  acknowledgeHrCorrectiveAction,
  recordHrCorrectiveActionOutcome,
} from "@/features/hr/service";
import { hrErrorSentence } from "@/features/hr/shared/HrStates";

import {
  HR_ACKNOWLEDGMENT_KIND_LABELS,
  HR_CORRECTIVE_ACTION_LEVEL_LABELS,
  HR_CORRECTIVE_ACTION_OUTCOMES,
  HR_CORRECTIVE_ACTION_OUTCOME_LABELS,
  HR_CORRECTIVE_ACTION_STATE_LABELS,
  acknowledgmentKindsFor,
  type HrAcknowledgmentKind,
  type HrCorrectiveActionLevel,
  type HrCorrectiveActionOutcome,
  type HrCorrectiveActionRow,
  type HrCorrectiveActionState,
} from "../types";

function formatDay(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

export function CorrectiveActionPanel({
  action,
  viewerRole,
  onChanged,
}: {
  action: HrCorrectiveActionRow;
  viewerRole: string | null;
  onChanged: () => void;
}) {
  // THE ABSENCE RULE. No login → `esign` is not in the list at all.
  const subjectHasLogin = Boolean(action.subject_login_user_id);
  const kinds = acknowledgmentKindsFor(subjectHasLogin);

  const [ackKind, setAckKind] = useState<HrAcknowledgmentKind>(kinds[0]);
  const [witness, setWitness] = useState("");
  const [refusalNote, setRefusalNote] = useState("");
  const [outcome, setOutcome] = useState<HrCorrectiveActionOutcome>("resolved");
  const [outcomeNote, setOutcomeNote] = useState("");
  const [saving, setSaving] = useState(false);

  const state = String(action.state).replace(/_/g, "-") as HrCorrectiveActionState;
  const acknowledged = Boolean(action.employee_acknowledged_at);
  const canRecordAck = viewerRole !== "subject" && !acknowledged;

  async function saveAck() {
    if (saving) return;
    setSaving(true);
    const result = await acknowledgeHrCorrectiveAction({
      correctiveActionId: action.id,
      kind: ackKind,
      witnessEmploymentId: null,
      signedFileId: null,
      // NEVER sent from this surface — the statement is the employee's, and
      // this panel is the issuer's view of the record.
      employeeStatement: null,
      refusalNote: ackKind === "refused" ? refusalNote.trim() || null : null,
    });
    setSaving(false);
    if (result.ok) {
      onChanged();
      return;
    }
    toast.error(hrErrorSentence(result, "Recording the acknowledgment"));
  }

  async function saveOutcome() {
    if (saving) return;
    setSaving(true);
    const result = await recordHrCorrectiveActionOutcome({
      correctiveActionId: action.id,
      outcome,
      note: outcomeNote.trim() || null,
    });
    setSaving(false);
    if (result.ok) {
      setOutcomeNote("");
      onChanged();
      return;
    }
    toast.error(hrErrorSentence(result, "Recording this outcome"));
  }

  return (
    <>
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            {HR_CORRECTIVE_ACTION_LEVEL_LABELS[
              action.level as HrCorrectiveActionLevel
            ] ?? action.level}
          </h2>
          <Badge variant="outline">
            {HR_CORRECTIVE_ACTION_STATE_LABELS[state] ?? action.state}
          </Badge>
        </div>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {action.issued_on ? (
            <div>
              <dt className="text-xs text-muted-foreground">Issued</dt>
              <dd className="text-foreground">{formatDay(action.issued_on)}</dd>
            </div>
          ) : null}
          {action.incident_on ? (
            <div>
              <dt className="text-xs text-muted-foreground">Incident date</dt>
              <dd className="text-foreground">{formatDay(action.incident_on)}</dd>
            </div>
          ) : null}
          {action.issuer_name ? (
            <div>
              <dt className="text-xs text-muted-foreground">Issued by</dt>
              <dd className="text-foreground">{action.issuer_name}</dd>
            </div>
          ) : null}
          {action.policy_cited ? (
            <div>
              <dt className="text-xs text-muted-foreground">Policy cited</dt>
              <dd className="text-foreground">{action.policy_cited}</dd>
            </div>
          ) : null}
          {action.follow_up_on ? (
            <div>
              <dt className="text-xs text-muted-foreground">Follow up</dt>
              <dd className="text-foreground">{formatDay(action.follow_up_on)}</dd>
            </div>
          ) : null}
        </dl>

        {/* The ladder is a CHAIN. Show where this step came from. */}
        {action.prior_action_id ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link2 className="h-3.5 w-3.5 shrink-0" />
            Follows{" "}
            {HR_CORRECTIVE_ACTION_LEVEL_LABELS[
              action.prior_action_level as HrCorrectiveActionLevel
            ]?.toLowerCase() ?? "an earlier step"}{" "}
            on this person&apos;s record.
          </p>
        ) : null}

        {action.expected_improvement ? (
          <div>
            <p className="text-xs text-muted-foreground">Expected improvement</p>
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {action.expected_improvement}
            </p>
          </div>
        ) : null}

        {action.consequence_if_unmet ? (
          <div>
            <p className="text-xs text-muted-foreground">Consequence if unmet</p>
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {action.consequence_if_unmet}
            </p>
          </div>
        ) : null}
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <FileSignature className="h-3.5 w-3.5 text-muted-foreground" />
          Acknowledgment
        </h2>

        {acknowledged ? (
          <p className="text-sm text-foreground">
            {HR_ACKNOWLEDGMENT_KIND_LABELS[
              action.acknowledgment_kind as HrAcknowledgmentKind
            ] ?? action.acknowledgment_kind}{" "}
            <span className="text-muted-foreground">
              on {formatDay(action.employee_acknowledged_at)}
            </span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            This step stands unacknowledged.
          </p>
        )}

        {/* THE EMPLOYEE'S OWN WORDS. Read-only, for everyone, forever. */}
        {action.employee_statement ? (
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">
              The employee&apos;s own statement
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
              {action.employee_statement}
            </p>
          </div>
        ) : null}

        {!subjectHasLogin ? (
          <p className="text-xs text-muted-foreground">
            This person has no account here, so the signed paper copy is the
            delivery.
          </p>
        ) : null}

        {canRecordAck ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ack-kind">How it was acknowledged</Label>
              <Select
                value={ackKind}
                onValueChange={(v) => setAckKind(v as HrAcknowledgmentKind)}
              >
                <SelectTrigger id="ack-kind" className="min-h-11 sm:min-h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {kinds.map((k) => (
                    <SelectItem key={k} value={k}>
                      {HR_ACKNOWLEDGMENT_KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {ackKind === "verbal_witnessed" ? (
              <div className="space-y-1.5">
                <Label htmlFor="ack-witness">Who witnessed it</Label>
                <Input
                  id="ack-witness"
                  value={witness}
                  onChange={(e) => setWitness(e.target.value)}
                  className="min-h-11 sm:min-h-9"
                />
              </div>
            ) : null}

            {ackKind === "refused" ? (
              <div className="space-y-1.5">
                <Label htmlFor="ack-refusal">What was said</Label>
                <Input
                  id="ack-refusal"
                  value={refusalNote}
                  onChange={(e) => setRefusalNote(e.target.value)}
                  className="min-h-11 sm:min-h-9"
                />
                <p className="text-xs text-muted-foreground">
                  Declining is a valid outcome. The step still stands and the
                  record says it was declined.
                </p>
              </div>
            ) : null}

            <Button
              type="button"
              size="sm"
              onClick={saveAck}
              disabled={saving}
              className="min-h-11 sm:min-h-9"
            >
              Record it
            </Button>
          </div>
        ) : null}
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Outcome</h2>

        {action.outcome ? (
          <p className="text-sm text-foreground">
            {HR_CORRECTIVE_ACTION_OUTCOME_LABELS[
              action.outcome as HrCorrectiveActionOutcome
            ] ?? action.outcome}
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="outcome-kind">How this ended</Label>
              <Select
                value={outcome}
                onValueChange={(v) =>
                  setOutcome(v as HrCorrectiveActionOutcome)
                }
              >
                <SelectTrigger id="outcome-kind" className="min-h-11 sm:min-h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HR_CORRECTIVE_ACTION_OUTCOMES.map((o) => (
                    <SelectItem key={o} value={o}>
                      {HR_CORRECTIVE_ACTION_OUTCOME_LABELS[o]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {outcome === "rescinded" ? (
                <p className="text-xs text-muted-foreground">
                  Rescinding does not delete the record. It becomes a step with
                  a reason.
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="outcome-note">Note</Label>
              <Input
                id="outcome-note"
                value={outcomeNote}
                onChange={(e) => setOutcomeNote(e.target.value)}
                className="min-h-11 sm:min-h-9"
              />
            </div>
            <Button
              type="button"
              size="sm"
              onClick={saveOutcome}
              disabled={saving}
              className="min-h-11 sm:min-h-9"
            >
              Record the outcome
            </Button>
          </div>
        )}
      </section>
    </>
  );
}
