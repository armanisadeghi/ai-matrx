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
import { Input } from "@ai-matrx/design-system";
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
  acknowledgementFacts,
  acknowledgmentKindsFor,
  correctiveActionState,
  type HrAcknowledgmentKind,
  type HrCorrectiveActionLevel,
  type HrCorrectiveActionOutcome,
  type HrCorrectiveActionRow,
} from "../types";
import { formatHrDay as formatDay } from "@/features/hr/people/shared/HrStatusChip";


export function CorrectiveActionPanel({
  action,
  viewerRole,
  onChanged,
}: {
  action: HrCorrectiveActionRow;
  viewerRole: string | null;
  onChanged: () => void;
}) {
  // 🚨 `esign` IS NEVER ON THIS PANEL, AND THE REASON IS THE DOOR'S, NOT A
  // PROPERTY OF THE SUBJECT. This is the ISSUER's view — `canRecordAck` below
  // requires `viewerRole !== "subject"` — and
  // `hr_corrective_action_acknowledge` refuses an e-signature from anybody but
  // the signer, by name: `esign_is_the_signers_own`, "an e-signature whose
  // evidence package names a signer who did not press the button is not an
  // e-signature; it is a forgery with timestamps." So offering it here would be
  // a control that cannot do the thing it offers.
  //
  // It USED to be excluded by accident, which is worse: the gate read
  // `action.subject_login_user_id`, a key `hr._project_row` has never put on the
  // wire, so `subjectHasLogin` was `false` for every subject alive and the "no
  // account here, so the signed paper copy is the delivery" sentence printed
  // under people who hold a perfectly good login. The subject's own e-sign lane
  // is `/hr/tasks`, where the signer really is the caller.
  const kinds = acknowledgmentKindsFor(false);

  const [ackKind, setAckKind] = useState<HrAcknowledgmentKind>(kinds[0]);
  const [witness, setWitness] = useState("");
  const [refusalNote, setRefusalNote] = useState("");
  const [outcome, setOutcome] = useState<HrCorrectiveActionOutcome>("resolved");
  const [outcomeNote, setOutcomeNote] = useState("");
  const [saving, setSaving] = useState(false);

  // DERIVED from the lifecycle columns — `hr.corrective_action` has no `state`
  // column, and reading one put the literal word `undefined` on this badge.
  const state = correctiveActionState(action);
  const declined = action.employee_acknowledgement_kind === "refused";
  const acknowledged = Boolean(action.employee_acknowledged_at);
  // A refusal SETTLES the acknowledgment step (§4.8 F4) even though it leaves
  // `employee_acknowledged_at` null. Leaving the form up after one would invite
  // a second recording over a person who has already answered.
  const canRecordAck = viewerRole !== "subject" && !acknowledged && !declined;
  const facts = acknowledgementFacts(action);
  const witnessOnFile =
    typeof facts?.witness_name === "string" ? facts.witness_name : null;
  const refusalOnFile =
    typeof facts?.refusal_note === "string" ? facts.refusal_note : null;
  // 🚨 THE WITNESS IS NOT THE VERBAL LANE'S ALONE. `hr.corrective_ack_wf_apply`
  // stores `witness_name` for WHATEVER kind carries one, and a wet signature by
  // a kiosk-only employee is precisely the case that needs one: the paper copy
  // is the delivery, and who watched them sign it is the whole evidentiary
  // value. This control used to render only for `verbal_witnessed` and
  // hard-nulled the name on every other kind, so the door's own field could
  // never be filled from the one surface that issues these.
  const witnessApplies =
    ackKind === "verbal_witnessed" || ackKind === "wet_signature";

  async function saveAck() {
    if (saving) return;
    setSaving(true);
    const result = await acknowledgeHrCorrectiveAction({
      correctiveActionId: action.id,
      kind: ackKind,
      // 🚨 THE WITNESS WAS COLLECTED AND THROWN AWAY. This control has always
      // asked "who witnessed it" and the answer went into component state and
      // nowhere else — `witnessEmploymentId: null` was hard-coded here, and the
      // door it would have gone to did not exist anyway. It is a free-text NAME,
      // not an employment: the person who witnessed a verbal warning is whoever
      // was in the room, and there is no picker for that. It lands write-once on
      // `hr.corrective_action.metadata.acknowledgement.witness_name`.
      witnessName: witnessApplies ? witness.trim() || null : null,
      witnessEmploymentId: null,
      signedFileId: null,
      // NEVER sent from this surface — the statement is the employee's, and
      // this panel is the issuer's view of the record. The door refuses it from
      // a non-subject by name (`statement_is_the_employees_own`).
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
      // 🚨 THIS WAS "note", AND THERE IS NO NOTE. The door reads exactly two
      // payload keys and `hr.corrective_action` has no note column, so the field
      // could not have saved under any spelling of the call. It is the FOLLOW-UP
      // OUTCOME (§4.8 node H → I) and the label now says so.
      followUpOutcome: outcomeNote.trim() || null,
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
            {HR_CORRECTIVE_ACTION_STATE_LABELS[state]}
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
          {/* 🚨 NO "Issued by" LINE. `hr._project_row` names the SUBJECT only;
              the issuer is `issued_by_employment_id`, a uuid, and there is no
              door that resolves it to a name. This slot read `action.issuer_name`
              — a key that has never been on the wire — so it could never render
              anyway. It stays ABSENT rather than printing a uuid under a heading
              that promises a person. */}
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

        {/* The ladder is a CHAIN. Show where this step came from — but only
            what the door actually gave us. `prior_action_level` is not on the
            wire (only `prior_action_id` is), so the level is not named here;
            claiming one would be an invention on a disciplinary record. */}
        {action.prior_action_id ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link2 className="h-3.5 w-3.5 shrink-0" />
            Follows an earlier step on this person&apos;s record.
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

        {/* 🚨 THE KEY IS `employee_acknowledgement_kind`. `acknowledgment_kind`
            has never been on the wire, so this line rendered the label map's
            miss — a blank where the word should be — on every acknowledged
            record. Read live off `hr_confidential_get` 2026-08-29. */}
        {declined ? (
          // A refusal is recorded, not stuck (§4.8 F4), and it has no
          // acknowledged-at — saying "on <date>" here would invent one.
          <div className="space-y-1">
            <p className="text-sm text-foreground">
              {HR_ACKNOWLEDGMENT_KIND_LABELS.refused}
            </p>
            {refusalOnFile ? (
              <p className="text-sm text-muted-foreground">{refusalOnFile}</p>
            ) : null}
          </div>
        ) : acknowledged ? (
          <div className="space-y-1">
            <p className="text-sm text-foreground">
              {HR_ACKNOWLEDGMENT_KIND_LABELS[
                action.employee_acknowledgement_kind as HrAcknowledgmentKind
              ] ?? "Acknowledged"}{" "}
              <span className="text-muted-foreground">
                on {formatDay(action.employee_acknowledged_at)}
              </span>
            </p>
            {witnessOnFile ? (
              <p className="text-sm text-muted-foreground">
                Witnessed by {witnessOnFile}
              </p>
            ) : null}
          </div>
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

        {/* 🚨 THE "no account here" SENTENCE IS GONE FROM THIS PANEL. It was
            gated on `subject_login_user_id`, which is not on the wire, so it
            printed under EVERY subject — including ones who hold a login and can
            e-sign from their own tasks page. Telling an issuer that somebody has
            no account, wrongly, is how a person ends up signing paper they never
            needed to. Restoring it needs the door to project the fact; until
            then this panel says nothing about the subject's account, which is
            the honest position. */}

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

            {witnessApplies ? (
              <div className="space-y-1.5">
                <Label htmlFor="ack-witness">
                  {ackKind === "wet_signature"
                    ? "Who watched them sign it"
                    : "Who witnessed it"}
                </Label>
                <Input
                  id="ack-witness"
                  value={witness}
                  onChange={(e) => setWitness(e.target.value)}
                  className="min-h-11 sm:min-h-9"
                />
                {ackKind === "wet_signature" ? (
                  // Optional, and said so — a signature on paper stands on its
                  // own. A required field here would block a real signing.
                  <p className="text-xs text-muted-foreground">
                    Optional. It is a name, kept exactly as you type it.
                  </p>
                ) : null}
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
          <div className="space-y-1">
            <p className="text-sm text-foreground">
              {HR_CORRECTIVE_ACTION_OUTCOME_LABELS[
                action.outcome as HrCorrectiveActionOutcome
              ] ?? action.outcome}
              {action.outcome_on ? (
                <span className="text-muted-foreground">
                  {" "}
                  on {formatDay(action.outcome_on)}
                </span>
              ) : null}
            </p>
            {/* 🚨 THE FOLLOW-UP OUTCOME HAD NOWHERE TO RENDER. The door writes
                `follow_up_outcome` (§4.8 node H → I) and this panel collected it
                in the form above and then never showed it back — so a person
                recorded what happened at the follow-up and the record appeared
                to have swallowed it. */}
            {action.follow_up_outcome ? (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {action.follow_up_outcome}
              </p>
            ) : null}
          </div>
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
              <Label htmlFor="outcome-note">What happened at the follow-up</Label>
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
