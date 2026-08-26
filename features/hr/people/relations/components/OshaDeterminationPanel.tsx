// features/hr/people/relations/components/OshaDeterminationPanel.tsx
//
// 🚨 RECORDABILITY IS A **HUMAN DECISION WITH A RULES ASSIST**, NEVER AUTO-SET.
//
// The assist below reads the captured 300/301 facts and says what the rule
// usually implies. It does NOT pre-select the answer, it does NOT default the
// switch, and no code path anywhere may write `osha_recordable` without a
// person choosing it and stating a basis. An auto-set recordability is a
// federal filing made by a heuristic.
//
// `osha_privacy_case` suppresses the NAME in the 300-log rendering — the case
// still appears, the person does not. It is a separate decision from
// recordability and is asked separately.

"use client";

import { useState } from "react";
import { BrainCircuit, HardHat } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/lib/toast";
import { setHrOshaDetermination } from "@/features/hr/service";
import { hrErrorSentence } from "@/features/hr/shared/HrStates";

import {
  needsOshaCapture,
  type HrIncidentKind,
  type HrIncidentRow,
} from "../types";

/**
 * The rules ASSIST. Returns a sentence, never a value — deliberately, so it is
 * impossible for this function's result to be written to the database.
 */
function recordabilityAssist(
  fields: Record<string, unknown> | null | undefined,
): string | null {
  if (!fields) return null;
  const triggers: string[] = [];
  if (fields.treatment_beyond_first_aid) triggers.push("treatment beyond first aid");
  if (fields.hospitalized) triggers.push("in-patient hospitalization");
  if (Number(fields.days_away) > 0) triggers.push("days away from work");
  if (Number(fields.days_restricted) > 0) triggers.push("restricted duty");
  if (triggers.length === 0) return null;
  return `What was recorded here — ${triggers.join(", ")} — usually makes a case recordable. The determination is still yours.`;
}

export function OshaDeterminationPanel({
  incident,
  canWrite,
  onChanged,
}: {
  incident: HrIncidentRow;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [recordable, setRecordable] = useState(
    incident.osha_recordable ?? false,
  );
  const [privacyCase, setPrivacyCase] = useState(
    incident.osha_privacy_case ?? false,
  );
  const [basis, setBasis] = useState("");
  const [saving, setSaving] = useState(false);

  // The block only exists for the kinds that can be recordable at all. For a
  // complaint it is ABSENT, not shown-and-empty.
  if (!needsOshaCapture(incident.incident_kind as HrIncidentKind)) return null;

  const assist = recordabilityAssist(incident.osha_fields);
  const decided = incident.osha_recordable !== null && incident.osha_recordable !== undefined;

  async function save() {
    if (!basis.trim() || saving) return;
    setSaving(true);
    const result = await setHrOshaDetermination({
      incidentId: incident.id,
      recordable,
      privacyCase,
      basis: basis.trim(),
    });
    setSaving(false);
    if (result.ok) {
      setBasis("");
      onChanged();
      return;
    }
    toast.error(hrErrorSentence(result, "Recording the OSHA determination"));
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <HardHat className="h-3.5 w-3.5 text-muted-foreground" />
          OSHA determination
        </h2>
        {decided ? (
          <Badge variant={incident.osha_recordable ? "secondary" : "outline"}>
            {incident.osha_recordable ? "Recordable" : "Not recordable"}
          </Badge>
        ) : (
          <Badge variant="outline">Not yet determined</Badge>
        )}
      </div>

      {assist ? (
        <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <BrainCircuit className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{assist}</span>
        </p>
      ) : null}

      {incident.osha_privacy_case ? (
        <p className="text-xs text-muted-foreground">
          Recorded as a privacy case: this person&apos;s name is suppressed in
          the 300-log rendering.
        </p>
      ) : null}

      {canWrite ? (
        <div className="space-y-3">
          <label className="flex min-h-11 items-center justify-between gap-3">
            <span className="text-sm text-foreground">
              Recordable on the 300 log
            </span>
            <Switch checked={recordable} onCheckedChange={setRecordable} />
          </label>

          <label className="flex min-h-11 items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="text-sm text-foreground">Privacy case</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                The case appears on the log; the person&apos;s name does not.
              </span>
            </span>
            <Switch checked={privacyCase} onCheckedChange={setPrivacyCase} />
          </label>

          <div className="space-y-1.5">
            <Label htmlFor="osha-basis">
              Why you decided this (required)
            </Label>
            <Input
              id="osha-basis"
              value={basis}
              onChange={(e) => setBasis(e.target.value)}
              className="min-h-11 sm:min-h-9"
              placeholder="The rule and the fact you applied it to."
            />
          </div>

          <Button
            type="button"
            size="sm"
            onClick={save}
            disabled={!basis.trim() || saving}
            className="min-h-11 sm:min-h-9"
          >
            Record the determination
          </Button>
        </div>
      ) : null}
    </section>
  );
}
