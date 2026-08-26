// features/hr/people/relations/components/NewIncidentDialog.tsx
//
// INCIDENT / COMPLAINT INTAKE (SPEC-EMPLOYEES §4.9b).
//
// 🚨 THIS SURFACE STAYS CLINICAL AND EVIDENTIARY. Deliberately, and by ruling.
// The warm voice belongs to the coaching door and nowhere near this form: what
// is typed here may be read years later by a regulator, an investigator or a
// court, and reassuring copy around a harassment report is worse than useless.
//
// 🚨 THE OSHA 300/301 SET IS CAPTURED NOW OR NEVER. For an injury or illness
// the field set is impossible to reconstruct after the fact — nobody remembers
// in March which body part, which object, whether treatment went beyond first
// aid. So the fields appear the moment the kind is chosen, before the report is
// saved, and they are never a "complete this later" task.
//
// 🚨 RECORDABILITY IS NOT SET HERE. It is a HUMAN DECISION WITH A RULES ASSIST,
// made on the case page after the facts are in (§4.9b L3). Nothing on this form
// may set `osha_recordable`, and no heuristic may set it for anybody.
//
// 🚨 SUBJECT EXCLUSION DEFAULTS BY KIND. Complaint / ethics / harassment /
// discrimination default the subject OUT of their own record; safety and near
// miss do not. The control is offered because the reporter knows things the
// kind does not — but the real enforcement is `hr.incident_excluded()` on the
// server, evaluated per row after every allow lane.

"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";

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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { createHrIncident } from "@/features/hr/service";
import { hrErrorSentence } from "@/features/hr/shared/HrStates";
import { useHrContext } from "@/features/hr/shared/useHrContext";

import {
  HR_INCIDENT_KINDS,
  HR_INCIDENT_KIND_LABELS,
  defaultSubjectExcluded,
  needsOshaCapture,
  type HrIncidentKind,
} from "../types";
import { EmploymentPicker } from "./EmploymentPicker";

/**
 * The OSHA 300/301 capture set, verbatim from §4.9b C1. Every one of these is a
 * fact that decays: ask now or lose it.
 */
const OSHA_TEXT_FIELDS = [
  { key: "body_part", label: "Body part" },
  { key: "nature_of_injury", label: "Nature of the injury or illness" },
  { key: "object_substance", label: "Object or substance that harmed them" },
  { key: "event_description", label: "How it happened" },
  { key: "facility", label: "Facility where treatment was given" },
  { key: "physician", label: "Physician or provider" },
  { key: "work_restrictions", label: "Work restrictions" },
  { key: "return_to_work", label: "Return-to-work date" },
  { key: "workers_comp_claim_ref", label: "Workers' comp claim reference" },
  { key: "provider_ref", label: "Provider reference" },
] as const;

const OSHA_FLAGS = [
  { key: "treatment_beyond_first_aid", label: "Treatment beyond first aid" },
  { key: "hospitalized", label: "Hospitalized in-patient" },
  { key: "emergency_room", label: "Treated in an emergency room" },
] as const;

const OSHA_COUNTS = [
  { key: "days_away", label: "Days away from work" },
  { key: "days_restricted", label: "Days on restricted duty" },
] as const;

export function NewIncidentDialog({
  subjectEmploymentId,
  onClose,
  onCreated,
}: {
  subjectEmploymentId?: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { active } = useHrContext();

  const [kind, setKind] = useState<HrIncidentKind>("complaint");
  const [subject, setSubject] = useState<string | null>(
    subjectEmploymentId ?? null,
  );
  const [occurredAt, setOccurredAt] = useState("");
  const [summary, setSummary] = useState("");
  const [establishment, setEstablishment] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [excluded, setExcluded] = useState(defaultSubjectExcluded("complaint"));
  const [osha, setOsha] = useState<Record<string, string | boolean>>({});
  const [saving, setSaving] = useState(false);

  const showOsha = needsOshaCapture(kind);
  const canSave = summary.trim().length > 0 && !saving;

  function chooseKind(next: HrIncidentKind) {
    setKind(next);
    // The default follows the kind; an explicit change by the reporter is
    // theirs to keep, but changing the kind re-asks the question honestly.
    setExcluded(defaultSubjectExcluded(next));
  }

  async function save() {
    if (!canSave || !active) return;
    setSaving(true);
    const result = await createHrIncident({
      organization_id: active.organization_id,
      incident_kind: kind,
      // An anonymous report creates NO employment linkage, so no future join
      // can re-identify the reporter (§4.9b A2). The server owns the reporter
      // column; the client simply never sends one.
      reported_anonymously: anonymous,
      subject_employment_id: subject,
      subject_excluded: excluded,
      occurred_at: occurredAt || null,
      summary: summary.trim(),
      establishment: establishment.trim() || null,
      // Captured now because it cannot be captured later. `osha_recordable` is
      // deliberately NOT in this payload — that is a human decision made on the
      // case page with a rules assist.
      osha_fields: showOsha ? osha : null,
    });
    setSaving(false);

    if (result.ok) {
      toast.success("Report recorded");
      onCreated();
      return;
    }
    toast.error(hrErrorSentence(result, "Recording this report"));
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Report an incident</DialogTitle>
          <DialogDescription>
            Record what happened, when, and who was involved. This becomes a
            restricted record.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="in-kind">Kind</Label>
            <Select
              value={kind}
              onValueChange={(v) => chooseKind(v as HrIncidentKind)}
            >
              <SelectTrigger id="in-kind" className="min-h-11 sm:min-h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HR_INCIDENT_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {HR_INCIDENT_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="in-occurred">When it happened</Label>
            <Input
              id="in-occurred"
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="min-h-11 sm:min-h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="in-summary">What happened</Label>
            <Textarea
              id="in-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={5}
              placeholder="Facts only: what was observed, by whom, where, and when."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="in-establishment">Establishment</Label>
            <Input
              id="in-establishment"
              value={establishment}
              onChange={(e) => setEstablishment(e.target.value)}
              className="min-h-11 sm:min-h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="in-subject">Who this is about</Label>
            <EmploymentPicker
              id="in-subject"
              value={subject}
              onChange={setSubject}
              disabled={Boolean(subjectEmploymentId)}
            />
          </div>

          <label className="flex min-h-11 items-start justify-between gap-3 rounded-md border border-border px-3 py-2">
            <span className="min-w-0">
              <span className="text-sm font-medium text-foreground">
                Report anonymously
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                No link to you is created, so nothing later can identify you
                from this record.
              </span>
            </span>
            <Switch checked={anonymous} onCheckedChange={setAnonymous} />
          </label>

          <label className="flex min-h-11 items-start justify-between gap-3 rounded-md border border-border px-3 py-2">
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                Keep this out of the subject&apos;s reach
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                The person this is about will not be able to see this record,
                and no override restores it.
              </span>
            </span>
            <Switch checked={excluded} onCheckedChange={setExcluded} />
          </label>

          {showOsha ? (
            <section className="space-y-3 rounded-md border border-border p-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Injury and illness detail
                </h3>
                <p className="text-xs text-muted-foreground">
                  Record this now. These facts cannot be reconstructed later,
                  and the OSHA log is assembled from them.
                </p>
              </div>

              {OSHA_TEXT_FIELDS.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label htmlFor={`osha-${field.key}`}>{field.label}</Label>
                  <Input
                    id={`osha-${field.key}`}
                    value={String(osha[field.key] ?? "")}
                    onChange={(e) =>
                      setOsha((o) => ({ ...o, [field.key]: e.target.value }))
                    }
                    className="min-h-11 sm:min-h-9"
                  />
                </div>
              ))}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {OSHA_COUNTS.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label htmlFor={`osha-${field.key}`}>{field.label}</Label>
                    <Input
                      id={`osha-${field.key}`}
                      type="number"
                      min={0}
                      value={String(osha[field.key] ?? "")}
                      onChange={(e) =>
                        setOsha((o) => ({ ...o, [field.key]: e.target.value }))
                      }
                      className="min-h-11 sm:min-h-9"
                    />
                  </div>
                ))}
              </div>

              {OSHA_FLAGS.map((flag) => (
                <label
                  key={flag.key}
                  className="flex min-h-11 items-center justify-between gap-3"
                >
                  <span className="text-sm text-foreground">{flag.label}</span>
                  <Switch
                    checked={Boolean(osha[flag.key])}
                    onCheckedChange={(checked) =>
                      setOsha((o) => ({ ...o, [flag.key]: checked }))
                    }
                  />
                </label>
              ))}
            </section>
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
            Record it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
