// features/hr/tasks/components/HrCorrectiveAckPanel.tsx
//
// THE SUBJECT'S OWN ACKNOWLEDGMENT — SPEC-EMPLOYEES §4.8 node G.
//
// 🚨 THIS IS THE SURFACE THAT DID NOT EXIST, ON A WORKFLOW THAT WAS NEVER LAUNCHED.
// Until `hr_l1_74`, `hr_corrective_action_issue` inserted a row and returned: no
// `hr.workflow_instance`, so `/hr/tasks` had nothing to list, so no subject ever saw
// a corrective action, so `employee_statement` could not exist for anybody. Every
// downstream piece — the apply hook, the write-once coalesce, the inbox, the four
// acknowledgment kinds — was built correctly around an edge nobody had wired.
//
// 🚨 WHY THIS IS NOT THE GENERIC APPROVE / REJECT PANEL. `HrDecisionPanel` renders
// four controls whose vocabulary is approval, and for a step the viewer is the
// SUBJECT of it renders "this is not yours to decide". Both are exactly wrong here:
// the `acknowledge` step is `allows_self`, the subject IS the decider, and what they
// are doing is not approving anything. Being asked to "Approve" a warning about
// yourself is not a wording problem — it invites the reading that signing means
// agreeing, which is the one thing §4.8's preserved-disagreement rule exists to
// prevent.
//
// 🚨 SIGNING IS NOT AGREEING, AND THE PAGE SAYS SO IN WORDS. That sentence is the
// whole reason the statement box sits beside the button rather than behind a link.
//
// 🚨 DECLINING IS A FIRST-CLASS CHOICE AT EQUAL WEIGHT (§4.8 F4). It is a plain
// button next to the other one, not a "having trouble?" escape hatch. A refusal is
// recorded as a refusal and the flow completes — it never becomes a stuck step.
//
// 🚨 `esign` IS ABSENT FOR A SUBJECT WITH NO LOGIN — but that case cannot reach this
// component at all, because a person with no login has no /hr/tasks. Their
// acknowledgment is recorded by HR on the case surface. The kind list still comes
// from the door's own answer rather than a constant here, so the two never drift.

"use client";

import { useState } from "react";
import { FileSignature } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ProTextarea } from "@/components/official/ProTextarea";
import { toast } from "@/lib/toast";
import { acknowledgeHrCorrectiveAction } from "@/features/hr/service";
import { hrErrorSentence } from "@/features/hr/shared/HrStates";
import type { HrDenied, HrFailed } from "@/features/hr/types";

export function HrCorrectiveAckPanel({
  correctiveActionId,
  onDone,
}: {
  /** The instance's `target_id`. The door finds the open step from the record itself. */
  correctiveActionId: string;
  onDone: () => void;
}) {
  const [statement, setStatement] = useState("");
  const [refusalNote, setRefusalNote] = useState("");
  const [declining, setDeclining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<HrDenied | HrFailed | null>(null);

  async function submit(kind: "esign" | "refused") {
    if (busy) return;
    setBusy(true);
    setRefusal(null);
    const result = await acknowledgeHrCorrectiveAction({
      correctiveActionId,
      kind,
      // 🚨 THE STATEMENT TRAVELS ON THE SUBJECT'S OWN CALL AND NOWHERE ELSE. It is
      // sent on a decline too: somebody who will not sign is precisely the person
      // most likely to have something to say, and §4.8 G2 keeps their words either
      // way. The door refuses it from anybody but the subject, and refuses a
      // SECOND one even from the subject — write-once, by name, not silently.
      employeeStatement: statement.trim() || null,
      refusalNote: kind === "refused" ? refusalNote.trim() || null : null,
    });
    setBusy(false);

    if (result.ok) {
      toast.success(
        kind === "refused"
          ? "Recorded — you declined to sign, and your words are kept"
          : "Signed. Your statement is kept with the record",
      );
      onDone();
      return;
    }
    // 🚨 THE REFUSAL RENDERS WHERE THE PERSON IS LOOKING, NOT AS A TOAST THAT
    // EVAPORATES. `statement_already_recorded` and `statement_is_the_employees_own`
    // are sentences somebody has to be able to re-read, and the door writes them.
    setRefusal(result);
  }

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <FileSignature className="h-3.5 w-3.5 text-muted-foreground" />
        Your acknowledgment
      </h2>

      {/* THE SENTENCE THAT MAKES THE SIGNATURE HONEST. */}
      <p className="max-w-prose text-sm text-foreground">
        Signing says you have read this. It does not say you agree with it. If you
        see it differently, write that below — your words are kept with the record,
        and nobody who works here can change or remove them.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="ca-statement">Your response, in your own words</Label>
        <ProTextarea
          id="ca-statement"
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          placeholder="Optional. Whatever you write here stays exactly as you wrote it."
          rows={4}
        />
      </div>

      {declining ? (
        <div className="space-y-1.5">
          <Label htmlFor="ca-decline">Anything you want recorded about declining</Label>
          <ProTextarea
            id="ca-decline"
            value={refusalNote}
            onChange={(e) => setRefusalNote(e.target.value)}
            rows={2}
          />
          <p className="text-xs text-muted-foreground">
            Declining is a valid outcome. The corrective action still stands, and the
            record will say plainly that you declined to sign it.
          </p>
        </div>
      ) : null}

      {refusal ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-foreground"
        >
          {hrErrorSentence(refusal, "Recording your acknowledgment")}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy}
          onClick={() => void submit("esign")}
          className="min-h-11 sm:min-h-9"
        >
          Sign it
        </Button>
        {/* EQUAL WEIGHT. Same row, same size, no warning colour, no confirmation
            theatre — a person is allowed to decline and the UI must not editorialise. */}
        <Button
          variant="outline"
          disabled={busy}
          className="min-h-11 sm:min-h-9"
          onClick={() => {
            if (!declining) {
              setDeclining(true);
              return;
            }
            void submit("refused");
          }}
        >
          {declining ? "Record that I declined" : "Decline to sign"}
        </Button>
      </div>
    </section>
  );
}
