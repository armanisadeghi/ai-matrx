// features/hr/people/relations/components/IncidentStatePanel.tsx
//
// The six incident states and the two gates that actually matter:
//
//   • MOVING TO `resolved` REQUIRES `resolution_summary`. A case that closes
//     with no statement of what was concluded is a case nobody can defend later.
//   • MOVING TO `closed` REQUIRES `resolved_at` AND STARTS THE RETENTION CLOCK
//     (`retention_trigger_at`). The surface says so out loud before the click,
//     because the person clicking is starting a legal timer.
//
// `referred` is reachable from any live state. `closed` is terminal here:
// re-opening a closed case is a records-governance act, not a dropdown, because
// the clock has already started.
//
// 🚨 AND THERE IS NO DELETE ANYWHERE ON THIS PANEL, DELIBERATELY. A report filed
// in error, a duplicate, or one recorded against the wrong person is VOIDED —
// SPEC-EMPLOYEES §4.8's law for the sibling record is "The record is NOT
// deleted. Rescission is a state with a reason." The voided row keeps listing
// and keeps opening, struck through with its reason, because a void the reader
// cannot see is a deletion with better manners. The control is ABSENT once the
// record is already void, and absent under a legal hold — not disabled with a
// tooltip, absent (§2.2 r16).

"use client";

import { useState } from "react";
import { ArrowRight, Ban } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import { advanceHrIncident, voidHrIncident } from "@/features/hr/service";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { hrErrorSentence } from "@/features/hr/shared/HrStates";

import {
  HR_INCIDENT_NEXT_STATES,
  HR_INCIDENT_STATE_LABELS,
  HR_INCIDENT_STATE_TOKEN,
  type HrIncidentRow,
  type HrIncidentState,
} from "../types";
import { ProTextarea } from "@/components/official/ProTextarea";

/** The server speaks `intake`; the UI vocabulary calls that state `open`. */
function toUiState(raw: string): HrIncidentState {
  if (raw === "intake") return "open";
  const normalized = raw.replace(/_/g, "-") as HrIncidentState;
  return normalized in HR_INCIDENT_STATE_LABELS ? normalized : "open";
}

export function IncidentStatePanel({
  incident,
  canWrite,
  onChanged,
}: {
  incident: HrIncidentRow;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const current = toUiState(String(incident.state));
  const [target, setTarget] = useState<HrIncidentState | null>(null);
  const [resolutionSummary, setResolutionSummary] = useState(
    incident.resolution_summary ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);

  const next = HR_INCIDENT_NEXT_STATES[current];
  const isVoid = Boolean(incident.voided_at);
  const underHold = (incident.legal_hold_count ?? 0) > 0;

  async function voidIt() {
    if (!voidReason.trim() || saving) return;
    const ok = await confirm({
      title: "Set this record aside?",
      description:
        "It stays on file and stays readable — it will show as set aside, with your reason. " +
        "Nobody who was named on it gets their access back, and there is no way to delete it.",
      confirmLabel: "Set it aside",
      variant: "destructive",
    });
    if (!ok) return;
    setSaving(true);
    const result = await voidHrIncident({
      incidentId: incident.id,
      reason: voidReason.trim(),
    });
    setSaving(false);
    if (result.ok) {
      setVoidReason("");
      setVoiding(false);
      onChanged();
      return;
    }
    toast.error(hrErrorSentence(result, "Setting this record aside"));
  }

  const blocked =
    target === "resolved" && resolutionSummary.trim().length === 0;

  async function advance() {
    if (!target || blocked || saving) return;
    setSaving(true);
    const result = await advanceHrIncident({
      incidentId: incident.id,
      toState: HR_INCIDENT_STATE_TOKEN[target],
      resolutionSummary:
        target === "resolved" ? resolutionSummary.trim() : null,
    });
    setSaving(false);

    if (result.ok) {
      setTarget(null);
      onChanged();
      return;
    }
    toast.error(hrErrorSentence(result, "Advancing this case"));
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">State</h2>
        <Badge variant="outline">{HR_INCIDENT_STATE_LABELS[current]}</Badge>
      </div>

      {incident.resolution_summary ? (
        <div>
          <p className="text-xs text-muted-foreground">What was concluded</p>
          <p className="whitespace-pre-wrap text-sm text-foreground">
            {incident.resolution_summary}
          </p>
        </div>
      ) : null}

      {canWrite && next.length > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {next.map((state) => (
              <Button
                key={state}
                type="button"
                size="sm"
                variant={target === state ? "default" : "outline"}
                className="min-h-11 sm:min-h-9"
                onClick={() => setTarget(target === state ? null : state)}
              >
                <ArrowRight className="mr-1.5 h-4 w-4" />
                {HR_INCIDENT_STATE_LABELS[state]}
              </Button>
            ))}
          </div>

          {target === "resolved" ? (
            <div className="space-y-1.5">
              <Label htmlFor="state-resolution">
                What was concluded (required)
              </Label>
              <ProTextarea
                id="state-resolution"
                value={resolutionSummary}
                onChange={(e) => setResolutionSummary(e.target.value)}
                rows={4}
              />
            </div>
          ) : null}

          {target ? (
            <Button
              type="button"
              size="sm"
              onClick={advance}
              disabled={blocked || saving}
              className="min-h-11 sm:min-h-9"
            >
              Move to {HR_INCIDENT_STATE_LABELS[target].toLowerCase()}
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* THE VOID LANE. Absent when the record is already void and absent under
          a legal hold — the door refuses both in words, and a control whose only
          outcome is a refusal is the defect this feature was full of. */}
      {canWrite && !isVoid && !underHold ? (
        <div className="border-t border-border pt-3">
          {voiding ? (
            <div className="space-y-2">
              <Label htmlFor="state-void-reason">
                Why should this record not stand? (required)
              </Label>
              <Input
                id="state-void-reason"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                className="min-h-11 sm:min-h-9"
                placeholder="Duplicate of an earlier report; filed against the wrong person"
              />
              <p className="text-xs text-muted-foreground">
                The record is kept and stays readable. It cannot be deleted, and
                nobody who was named on it gets their access back.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={voidIt}
                  disabled={!voidReason.trim() || saving}
                  className="min-h-11 sm:min-h-9"
                >
                  Set it aside
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setVoiding(false)}
                  className="min-h-11 sm:min-h-9"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setVoiding(true)}
              className="min-h-11 text-muted-foreground sm:min-h-9"
            >
              <Ban className="mr-1.5 h-3.5 w-3.5" />
              This record should not stand
            </Button>
          )}
        </div>
      ) : null}
    </section>
  );
}
