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

"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { advanceHrIncident } from "@/features/hr/service";
import { hrErrorSentence } from "@/features/hr/shared/HrStates";

import {
  HR_INCIDENT_NEXT_STATES,
  HR_INCIDENT_STATE_LABELS,
  HR_INCIDENT_STATE_TOKEN,
  type HrIncidentRow,
  type HrIncidentState,
} from "../types";

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
  const [resolvedAt, setResolvedAt] = useState(
    incident.resolved_at?.slice(0, 10) ?? "",
  );
  const [referralNote, setReferralNote] = useState("");
  const [saving, setSaving] = useState(false);

  const next = HR_INCIDENT_NEXT_STATES[current];

  const blocked =
    (target === "resolved" && resolutionSummary.trim().length === 0) ||
    (target === "closed" && resolvedAt.length === 0);

  async function advance() {
    if (!target || blocked || saving) return;
    setSaving(true);
    const result = await advanceHrIncident({
      incidentId: incident.id,
      toState: HR_INCIDENT_STATE_TOKEN[target],
      resolutionSummary:
        target === "resolved" ? resolutionSummary.trim() : null,
      resolvedAt: target === "closed" ? resolvedAt : null,
      referralNote: target === "referred" ? referralNote.trim() || null : null,
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
              <Textarea
                id="state-resolution"
                value={resolutionSummary}
                onChange={(e) => setResolutionSummary(e.target.value)}
                rows={4}
              />
            </div>
          ) : null}

          {target === "closed" ? (
            <div className="space-y-1.5">
              <Label htmlFor="state-resolved-at">
                Date it was resolved (required)
              </Label>
              <Input
                id="state-resolved-at"
                type="date"
                value={resolvedAt}
                onChange={(e) => setResolvedAt(e.target.value)}
                className="min-h-11 sm:min-h-9"
              />
              <p className="text-xs text-muted-foreground">
                Closing starts this record&apos;s retention clock from this date.
                A legal hold blocks every disposition regardless.
              </p>
            </div>
          ) : null}

          {target === "referred" ? (
            <div className="space-y-1.5">
              <Label htmlFor="state-referral">Where it was referred</Label>
              <Input
                id="state-referral"
                value={referralNote}
                onChange={(e) => setReferralNote(e.target.value)}
                className="min-h-11 sm:min-h-9"
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
    </section>
  );
}
