// features/hr/people/relations/components/NewCorrectiveActionDialog.tsx
//
// 🚨 TWO DOORS, ONE RECORD — Arman's Q4 ruling (R-L1 §F).
//
//   "Log a coaching conversation"  → warm, one field, the `coaching` rung.
//   "Start a corrective action"    → formal, the full ladder from `verbal` up.
//
// Both write `hr.corrective_action`. They are ONE record with TWO doors because
// a manager who has to open something called *Corrective Action* to record a
// good coaching conversation simply will not record it — and that is exactly
// how undocumented discipline happens. Do not merge these into one form with a
// level dropdown; the dropdown is the thing that scares the manager off.
//
// 🚨 THE TONE RULE, RESTATED. The warmth belongs HERE and only here. The
// incident/complaint intake beside this file stays clinical and evidentiary,
// and softening it would be a mistake.
//
// 🚨 SKIPPING THE LADDER WARNS, NEVER BLOCKS (`hr.relations.corrective_action_ladder_skip`).
// `incident_on` after `issued_on` DOES block — a warning cannot be issued for
// something that has not happened yet.

"use client";

import { useState } from "react";
import { Info } from "lucide-react";

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
import { issueHrCorrectiveAction } from "@/features/hr/service";
import { hrErrorSentence } from "@/features/hr/shared/HrStates";
import { useHrContext } from "@/features/hr/shared/useHrContext";

import {
  HR_CORRECTIVE_ACTION_LEVELS,
  HR_CORRECTIVE_ACTION_LEVEL_LABELS,
  ladderSkipWarning,
  type HrCorrectiveActionLevel,
} from "../types";
import { EmploymentPicker } from "./EmploymentPicker";

/** The formal door starts at `verbal`; `coaching` is the warm door's whole point. */
const FORMAL_LEVELS = HR_CORRECTIVE_ACTION_LEVELS.filter((l) => l !== "coaching");

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NewCorrectiveActionDialog({
  door,
  subjectEmploymentId,
  priorLevel,
  priorActionId,
  onClose,
  onCreated,
}: {
  door: "coaching" | "formal";
  /** Pre-bound when opened from a profile's Relations tab. */
  subjectEmploymentId?: string | null;
  priorLevel?: HrCorrectiveActionLevel | null;
  priorActionId?: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { active } = useHrContext();
  const coaching = door === "coaching";

  const [subject, setSubject] = useState<string | null>(
    subjectEmploymentId ?? null,
  );
  const [level, setLevel] = useState<HrCorrectiveActionLevel>(
    coaching ? "coaching" : "verbal",
  );
  const [summary, setSummary] = useState("");
  const [issuedOn, setIssuedOn] = useState(today());
  const [incidentOn, setIncidentOn] = useState("");
  const [policyCited, setPolicyCited] = useState("");
  const [expectedImprovement, setExpectedImprovement] = useState("");
  const [consequence, setConsequence] = useState("");
  const [followUpOn, setFollowUpOn] = useState("");
  const [reasonCategory, setReasonCategory] = useState("");
  const [saving, setSaving] = useState(false);

  // BLOCKS. Not a warning: a corrective action cannot cite an incident that has
  // not happened yet.
  const dateOrderBroken = Boolean(
    incidentOn && issuedOn && incidentOn > issuedOn,
  );

  // WARNS. Never blocks. A first offence can genuinely be a suspension, and a
  // system that refuses to record what happened produces a worse record than
  // none. The warning exists so the issuer SEES the chain before committing.
  const skipWarning = coaching
    ? null
    : ladderSkipWarning(level, priorLevel ?? null);

  const canSave =
    Boolean(subject) && summary.trim().length > 0 && !dateOrderBroken && !saving;

  async function save() {
    if (!canSave || !active) return;
    setSaving(true);
    const result = await issueHrCorrectiveAction({
      organization_id: active.organization_id,
      subject_employment_id: subject,
      level,
      summary: summary.trim(),
      issued_on: issuedOn || null,
      incident_on: incidentOn || null,
      policy_cited: policyCited.trim() || null,
      expected_improvement: expectedImprovement.trim() || null,
      consequence_if_unmet: consequence.trim() || null,
      follow_up_on: followUpOn || null,
      reason_category: reasonCategory.trim() || null,
      prior_action_id: priorActionId ?? null,
      // The server records WHICH door produced the row so the coaching rung's
      // adoption is measurable — the point of the two-door ruling.
      entry_door: door,
    });
    setSaving(false);

    if (result.ok) {
      toast.success(
        coaching ? "Coaching conversation logged" : "Corrective action issued",
      );
      onCreated();
      return;
    }
    // A refusal is DATA and it gets read out loud, naming the operation.
    toast.error(
      hrErrorSentence(
        result,
        coaching ? "Logging this conversation" : "Issuing this corrective action",
      ),
    );
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {coaching ? "Log a coaching conversation" : "Start a corrective action"}
          </DialogTitle>
          <DialogDescription>
            {coaching
              ? "A short, honest note about a conversation you had. It goes on the record so the good work you already did is not invisible later."
              : "A formal step on the record. The employee will be able to read it and respond in their own words."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ca-subject">Who</Label>
            <EmploymentPicker
              id="ca-subject"
              value={subject}
              onChange={setSubject}
              disabled={Boolean(subjectEmploymentId)}
            />
          </div>

          {!coaching ? (
            <div className="space-y-1.5">
              <Label htmlFor="ca-level">Step</Label>
              <Select
                value={level}
                onValueChange={(v) => setLevel(v as HrCorrectiveActionLevel)}
              >
                <SelectTrigger id="ca-level" className="min-h-11 sm:min-h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMAL_LEVELS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {HR_CORRECTIVE_ACTION_LEVEL_LABELS[l]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {skipWarning ? (
                <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {/* WARN, never block. */}
                  <span>{skipWarning} You can still record this step.</span>
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="ca-summary">
              {coaching ? "What you talked about" : "What happened"}
            </Label>
            <Textarea
              id="ca-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              placeholder={
                coaching
                  ? "A sentence or two is plenty."
                  : "State the facts, dates and what was observed."
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ca-issued">
                {coaching ? "Date of the conversation" : "Issued on"}
              </Label>
              <Input
                id="ca-issued"
                type="date"
                value={issuedOn}
                onChange={(e) => setIssuedOn(e.target.value)}
                className="min-h-11 sm:min-h-9"
              />
            </div>
            {!coaching ? (
              <div className="space-y-1.5">
                <Label htmlFor="ca-incident">Incident date</Label>
                <Input
                  id="ca-incident"
                  type="date"
                  value={incidentOn}
                  onChange={(e) => setIncidentOn(e.target.value)}
                  className="min-h-11 sm:min-h-9"
                />
                {dateOrderBroken ? (
                  <p className="text-xs text-destructive">
                    The incident date is after the issue date. A step cannot be
                    issued for something that has not happened yet.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {!coaching ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ca-policy">Policy cited</Label>
                  <Input
                    id="ca-policy"
                    value={policyCited}
                    onChange={(e) => setPolicyCited(e.target.value)}
                    className="min-h-11 sm:min-h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ca-reason">Reason category</Label>
                  <Input
                    id="ca-reason"
                    value={reasonCategory}
                    onChange={(e) => setReasonCategory(e.target.value)}
                    className="min-h-11 sm:min-h-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ca-improve">Expected improvement</Label>
                <Textarea
                  id="ca-improve"
                  value={expectedImprovement}
                  onChange={(e) => setExpectedImprovement(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ca-consequence">Consequence if unmet</Label>
                <Textarea
                  id="ca-consequence"
                  value={consequence}
                  onChange={(e) => setConsequence(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ca-followup">Follow up on</Label>
                <Input
                  id="ca-followup"
                  type="date"
                  value={followUpOn}
                  onChange={(e) => setFollowUpOn(e.target.value)}
                  className="min-h-11 sm:min-h-9"
                />
              </div>
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="min-h-11 sm:min-h-9"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="min-h-11 sm:min-h-9"
          >
            {coaching ? "Log it" : "Issue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
