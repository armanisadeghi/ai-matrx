"use client";

// features/hr/people/profile/ChangePositionForm.tsx — §4.2 / §4.3 / §6
//
// ONE FORM, TWO VERBS. "Change position" (promotion, reclass, FTE change) and
// "Transfer" (department, location or manager moves) share §4.2's machinery —
// both write a NEW `hr.position_assignment` row and close the prior one. They
// differ only in what the form leads with, so they are one component with a
// `kind`, not two forms that drift.
//
// 🚨 A LOCATION CHANGE IS A JURISDICTION CHANGE, AND THE FORM SAYS SO BEFORE
// COMMIT. Not in a toast afterwards, not on the confirmation screen — while the
// user still has the choice. The sentence names the new jurisdiction and what
// moves with it: overtime rules, the sick-leave floor, break rules, and the
// final-pay deadline. Somebody changing an address in a form has no reason to
// know that; telling them is the entire point of this block.
//
// 🚨 A TITLE'S DEFAULTS ARE SUGGESTIONS. Picking a job title with a
// `default_flsa_status` offers it and says where it came from. It never
// silently overwrites a classification — a person's exempt status is a legal
// determination, not a dropdown side effect.
//
// 🚨 THE SERVER IS THE AUTHORITY. Every check below is mirrored from
// SPEC-EMPLOYEES §2.3.3's server-side validation and exists for SPEED ONLY. The
// refusal that matters comes back in the envelope, including
// `location_without_jurisdiction`, which arrives with its own door.

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Info } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";

import {
  EffectiveDatedForm,
  useEffectiveDating,
} from "../../shared/EffectiveDatedForm";
import { recordHrPositionChange } from "../../service";
import { hrSettingsHref } from "../../routes";
import { activeStructure, useHrStructure } from "../shared/useHrStructure";

type Row = Record<string, unknown>;

function str(row: Row | null, key: string): string | null {
  if (!row) return null;
  const value = row[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export function ChangePositionForm({
  kind,
  employmentId,
  organizationId,
  currentAssignment,
  onDone,
  onCancel,
}: {
  kind: "position" | "transfer";
  employmentId: string;
  organizationId: string;
  /** The row currently in force — what the new row supersedes. */
  currentAssignment: Row | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const dating = useEffectiveDating();
  const structureRead = useHrStructure(organizationId);
  const structure = structureRead.data;
  const [submitting, setSubmitting] = useState(false);
  const [refusal, setRefusal] = useState<{
    reason: string;
    detail: string | null;
  } | null>(null);

  const [jobTitleId, setJobTitleId] = useState(
    str(currentAssignment, "job_title_id") ?? "",
  );
  const [departmentId, setDepartmentId] = useState(
    str(currentAssignment, "department_id") ?? "",
  );
  const [locationId, setLocationId] = useState(
    str(currentAssignment, "location_id") ?? "",
  );
  const [fte, setFte] = useState(String(currentAssignment?.fte ?? "1"));
  const [flsaStatus, setFlsaStatus] = useState(
    str(currentAssignment, "flsa_status") ?? "",
  );
  const [exemptionBasis, setExemptionBasis] = useState(
    str(currentAssignment, "flsa_exemption_basis") ?? "",
  );
  const [changeReason, setChangeReason] = useState("");

  const { jobTitles, locations, departments } = activeStructure(structure);

  const currentLocationId = str(currentAssignment, "location_id");
  const currentLocation = locations.find((l) => l.id === currentLocationId) ?? null;
  const nextLocation = locations.find((l) => l.id === locationId) ?? null;
  const jurisdictionMoves =
    nextLocation !== null &&
    currentLocation !== null &&
    nextLocation.jurisdiction_id !== currentLocation.jurisdiction_id;

  const chosenTitle = jobTitles.find((t) => t.id === jobTitleId) ?? null;
  const titleSuggestsFlsa =
    chosenTitle?.default_flsa_status &&
    chosenTitle.default_flsa_status !== flsaStatus;

  // ── Client mirrors of the server's validation. Speed, never authority. ──
  const fteNumber = Number(fte);
  const fteInvalid = !Number.isFinite(fteNumber) || fteNumber <= 0 || fteNumber > 2;
  const exemptWithoutBasis =
    flsaStatus === "exempt" && exemptionBasis.trim() === "";
  const locationWithoutJurisdiction =
    nextLocation !== null && !nextLocation.jurisdiction_id;

  const blocked =
    fteInvalid || exemptWithoutBasis || locationWithoutJurisdiction || !jobTitleId;

  const submit = async () => {
    setSubmitting(true);
    setRefusal(null);

    const result = await recordHrPositionChange({
      employment_id: employmentId,
      supersedes_id: str(currentAssignment, "id"),
      job_title_id: jobTitleId || null,
      department_id: departmentId || null,
      location_id: locationId || null,
      fte: fteNumber,
      flsa_status: flsaStatus || null,
      flsa_exemption_basis: exemptionBasis || null,
      effective_from: dating.value.effectiveFrom,
      change_intent: dating.value.mode,
      change_reason: changeReason || null,
      is_transfer: kind === "transfer",
    });

    setSubmitting(false);

    if (result.ok) {
      toast.success(
        dating.value.isFuture
          ? `Scheduled for ${dating.value.effectiveFrom}. Nothing changes until then.`
          : "Position change recorded.",
      );
      onDone();
      return;
    }

    if (result.kind === "denied") {
      setRefusal({ reason: result.reason, detail: result.detail });
      return;
    }
    setRefusal({ reason: "failed", detail: result.message });
  };

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-3 sm:p-4">
      <h3 className="text-sm font-semibold text-foreground">
        {kind === "transfer" ? "Transfer" : "Change position"}
      </h3>

      <EffectiveDatedForm
        dating={dating}
        onSubmit={submit}
        submitting={submitting}
        disabled={blocked}
        cancel={
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            className="min-h-11 sm:min-h-9"
          >
            Cancel
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Job title">
            <Select value={jobTitleId} onValueChange={setJobTitleId}>
              <SelectTrigger className="h-11 sm:h-9">
                <SelectValue placeholder="Pick a job title" />
              </SelectTrigger>
              <SelectContent>
                {jobTitles.map((title) => (
                  <SelectItem key={title.id} value={title.id}>
                    {title.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Department">
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger className="h-11 sm:h-9">
                <SelectValue placeholder="Pick a department" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((department) => (
                  <SelectItem key={department.id} value={department.id}>
                    {department.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Location">
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger className="h-11 sm:h-9">
                <SelectValue placeholder="Pick a location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="FTE"
            error={fteInvalid ? "FTE has to be more than 0 and at most 2.0." : null}
          >
            <Input
              type="number"
              step="0.05"
              min="0.05"
              max="2"
              value={fte}
              onChange={(event) => setFte(event.target.value)}
              className="h-11 sm:h-9"
            />
          </Field>

          <Field label="FLSA status">
            <Select value={flsaStatus} onValueChange={setFlsaStatus}>
              <SelectTrigger className="h-11 sm:h-9">
                <SelectValue placeholder="Pick a status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="exempt">Exempt</SelectItem>
                <SelectItem value="nonexempt">Non-exempt</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {flsaStatus === "exempt" ? (
            <Field
              label="Exemption basis"
              error={
                exemptWithoutBasis
                  ? "An exempt classification needs the basis it rests on."
                  : null
              }
            >
              <Input
                value={exemptionBasis}
                onChange={(event) => setExemptionBasis(event.target.value)}
                placeholder="e.g. executive, administrative, professional"
                className="h-11 sm:h-9"
              />
            </Field>
          ) : null}
        </div>

        {/* 🚨 A SUGGESTION, NEVER A SILENT OVERWRITE. */}
        {titleSuggestsFlsa && chosenTitle ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
            <Info className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-sm text-foreground">
              {chosenTitle.title} is usually{" "}
              {chosenTitle.default_flsa_status?.replace(/_/g, " ")}
              {chosenTitle.default_pay_basis
                ? `, paid ${chosenTitle.default_pay_basis.replace(/_/g, " ")}`
                : ""}
              .
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 sm:min-h-8"
              onClick={() => setFlsaStatus(chosenTitle.default_flsa_status ?? "")}
            >
              Use that
            </Button>
          </div>
        ) : null}

        {/* 🚨 THE JURISDICTION SENTENCE, BEFORE COMMIT. */}
        {jurisdictionMoves && nextLocation && currentLocation ? (
          <div className="space-y-1 rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden />
              <span className="text-sm font-medium text-foreground">
                This moves them from{" "}
                {currentLocation.jurisdiction_name ?? "their current jurisdiction"}{" "}
                to {nextLocation.jurisdiction_name ?? "a new jurisdiction"}.
              </span>
            </div>
            <p className="text-xs text-foreground">
              From the effective date forward, this person&apos;s overtime rules,
              minimum sick-leave floor, break rules and final-pay deadline are the
              new jurisdiction&apos;s. Anything already calculated keeps the
              jurisdiction it was stamped with — nothing is recomputed backwards.
            </p>
          </div>
        ) : null}

        {locationWithoutJurisdiction && nextLocation ? (
          <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
            <p className="text-sm text-foreground">
              {nextLocation.name} has no jurisdiction set, so nothing can be
              scheduled or stamped against it.
            </p>
            <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-9">
              <Link href={hrSettingsHref("structure", { focus: nextLocation.id })}>
                Set its jurisdiction
              </Link>
            </Button>
          </div>
        ) : null}

        <Field label="Why is this changing?">
          <Textarea
            value={changeReason}
            onChange={(event) => setChangeReason(event.target.value)}
            rows={2}
            placeholder="Promotion, reclassification, team move…"
          />
        </Field>
      </EffectiveDatedForm>

      {refusal ? <Refusal refusal={refusal} /> : null}
    </section>
  );
}

/**
 * The server refused. Some refusals carry their own door — most importantly
 * `location_without_jurisdiction`, which is unfixable from this form.
 */
function Refusal({
  refusal,
}: {
  refusal: { reason: string; detail: string | null };
}) {
  const needsStructure = refusal.reason === "location_without_jurisdiction";

  return (
    <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
      <p className="text-sm text-foreground">
        {refusal.detail?.trim() ||
          "That change wasn't accepted, and nothing was written."}
      </p>
      {needsStructure ? (
        <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-9">
          <Link href={hrSettingsHref("structure")}>
            Open departments, locations and job titles
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
