// features/hr/settings/activation/HrActivationWizard.tsx
//
// THE ACTIVATION WIZARD (SPEC-EMPLOYEES §2.4) — the empty-org state of `/hr` AND of
// every `/hr/settings/*` route. There is exactly ONE of these, it is exported, and
// lane L9 mounts it on the home rather than deriving the state again.
//
// ── WHAT ACTUALLY HAPPENS WHEN YOU PRESS THE BUTTON ────────────────────────
// One call to `hr_activate_employer(p_payload jsonb)` — one shot, audited, gated on
// org owner/admin. It creates: the employer profile, the first location, the first
// department, the nominee's person + spell, and the first `hr_owner` role
// assignment, then writes ONE `hr.access_audit` row with `basis='activation'`.
//
// ── THE REFUSALS, AS THEY ARE ACTUALLY WRITTEN ─────────────────────────────
// Read out of the shipped function body (2026-08-26). All three are DATA, not
// exceptions, and each renders as a first-class state with a real next move:
//   • `not_org_owner_or_admin` — the caller is not an owner/admin of THIS org.
//   • `already_activated`      — ANY `hr_owner` assignment exists, live OR
//                                historical. A second HR owner is an ordinary role
//                                assignment made by the first, at route 77.
//   • `nominee_not_a_member`   — the nominated person is not in the organization.
// Plus two client-side refusals the server would otherwise turn into garbage rows,
// because the RPC `coalesce`s almost everything: a malformed EIN, and a location
// with no jurisdiction.
//
// ── 🚨 THREE HONEST GAPS THIS WIZARD REFUSES TO PAPER OVER ────────────────
//  1. NO SEEDS. §2.4 says activation seeds the earning codes, the deduction codes,
//     the `platform.categories` dimensions and the jurisdiction's holiday calendar.
//     The live function seeds NONE of them. Step 4 renders what the envelope
//     REPORTS and says "nothing was seeded" when it reports nothing — it never
//     claims a seed that did not happen (R-L1 wizard steps C4/C5).
//  2. THE PROFILE FIELDS THE RPC DROPS. It reads `legal_name` and `ein` and nothing
//     else off step 1 — `entity_form`, `formation_state` and `primary_address` are
//     not in its INSERT. They are sent anyway so they land the moment the server
//     lane widens the insert, and step 1 says plainly that they are finished at
//     route 68 today.
//  3. THE LOCATION ADDRESS. Same shape: `location_name`, `tz` and `jurisdiction_id`
//     are read; the address is not. Step 2 says so and points at route 69.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Info,
  Loader2,
  MapPin,
  ShieldAlert,
  Sprout,
  UserPlus,
  Users,
} from "lucide-react";

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
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { getOrganizationMembers } from "@/features/organizations/service";
import type { OrganizationMemberWithUser } from "@/features/organizations/types";

import { activateHrEmployer, fetchHrStructure } from "../../service";
import { isHrDenied, type HrDenied, type HrFailed } from "../../types";
import { hrEmployeeHref, hrPeopleNewHref, hrSettingsHref } from "../../routes";
import type {
  HrActivationRefusalReason,
  HrActivationResult,
  HrJurisdiction,
} from "../types";
import { checkEin, formatEinInput } from "./ein";
import { useHrActivationState } from "./useHrActivationState";

// A short, honest list. IANA carries hundreds; a US-first employer needs these, and
// anything else is typed. The field accepts any IANA name — this is a shortcut, not
// a ceiling, and the input says so.
const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Puerto_Rico",
  "UTC",
];

const ENTITY_FORMS = [
  { value: "llc", label: "LLC" },
  { value: "c_corp", label: "C corporation" },
  { value: "s_corp", label: "S corporation" },
  { value: "partnership", label: "Partnership" },
  { value: "sole_proprietorship", label: "Sole proprietorship" },
  { value: "nonprofit", label: "Nonprofit" },
  { value: "government", label: "Government entity" },
];

type Draft = {
  legalName: string;
  dbaName: string;
  ein: string;
  entityForm: string;
  formationState: string;
  addressLine1: string;
  addressCity: string;
  addressState: string;
  addressPostal: string;
  locationName: string;
  tz: string;
  jurisdictionId: string;
  departmentName: string;
  ownerIsMe: boolean;
  nomineeUserId: string;
  legalFirstName: string;
  legalLastName: string;
  employeeNumber: string;
  hireDate: string;
};

const EMPTY_DRAFT: Draft = {
  legalName: "",
  dbaName: "",
  ein: "",
  entityForm: "",
  formationState: "",
  addressLine1: "",
  addressCity: "",
  addressState: "",
  addressPostal: "",
  locationName: "Head office",
  tz: "",
  jurisdictionId: "",
  departmentName: "General",
  ownerIsMe: true,
  nomineeUserId: "",
  legalFirstName: "",
  legalLastName: "",
  employeeNumber: "EMP-00001",
  hireDate: "",
};

// ── The component ───────────────────────────────────────────────────────────

export function HrActivationWizard({
  organizationId,
  onComplete,
  className,
}: {
  /** The employer being activated. Must be the RESOLVED employer, not a guess. */
  organizationId: string;
  /** Fired after a successful activation, with what the server actually created. */
  onComplete?: (result: HrActivationResult) => void;
  className?: string;
}) {
  const activation = useHrActivationState(organizationId);
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [refusal, setRefusal] = useState<HrDenied | HrFailed | null>(null);
  const [result, setResult] = useState<HrActivationResult | null>(null);

  const [jurisdictions, setJurisdictions] = useState<HrJurisdiction[] | null>(null);
  const [members, setMembers] = useState<OrganizationMemberWithUser[] | null>(null);

  // The jurisdiction list and the org roster are the two things the wizard cannot
  // invent. Both are read once; a failure on either is shown at the control that
  // needs it, never as a page-level error that hides a form the user could still
  // half-fill.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const structure = await fetchHrStructure(organizationId);
      if (cancelled) return;
      setJurisdictions(
        structure.ok
          ? ((structure.data.jurisdictions ?? []) as unknown as HrJurisdiction[])
          : [],
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const roster = await getOrganizationMembers(organizationId);
      if (!cancelled) setMembers(roster);
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  // ── The finished state ────────────────────────────────────────────────────
  if (result) {
    return (
      <ActivationDone
        result={result}
        orgRef={activation.orgRef}
        className={className}
      />
    );
  }

  // ── First-hire door — a profile exists, so the wizard would be REFUSED ─────
  if (activation.mode === "first_hire") {
    return <FirstHireDoor href={activation.firstHireHref} className={className} />;
  }

  // ── The gate. `can_activate` is the server's own answer, not a role string ──
  if (activation.mode === "wizard" && !activation.canActivate) {
    return (
      <RefusalPanel
        reason="not_org_owner_or_admin"
        detail={null}
        orgRef={activation.orgRef}
        className={className}
      />
    );
  }

  const einCheck = checkEin(draft.ein);
  const step1Ready = draft.legalName.trim().length > 0 && einCheck.ok;
  const step2Ready =
    draft.locationName.trim().length > 0 &&
    draft.tz.trim().length > 0 &&
    draft.jurisdictionId.trim().length > 0 &&
    draft.departmentName.trim().length > 0;
  const step3Ready =
    draft.legalFirstName.trim().length > 0 &&
    draft.legalLastName.trim().length > 0 &&
    (draft.ownerIsMe || draft.nomineeUserId.trim().length > 0);

  const submit = async () => {
    if (!step1Ready || !step2Ready || !step3Ready) return;
    setSubmitting(true);
    setRefusal(null);

    const payload: Record<string, unknown> = {
      organization_id: organizationId,
      // Step 1 — the two the RPC reads today…
      legal_name: draft.legalName.trim(),
      ein: einCheck.ok ? einCheck.value : draft.ein.trim(),
      // …and the four it does not yet, sent so they land the day it widens.
      dba_name: draft.dbaName.trim() || null,
      entity_form: draft.entityForm || null,
      formation_state: draft.formationState.trim() || null,
      primary_address: {
        line1: draft.addressLine1.trim() || null,
        city: draft.addressCity.trim() || null,
        region: draft.addressState.trim() || null,
        postal_code: draft.addressPostal.trim() || null,
        country: "US",
      },
      // Step 2
      location_name: draft.locationName.trim(),
      tz: draft.tz.trim(),
      jurisdiction_id: draft.jurisdictionId,
      department_name: draft.departmentName.trim(),
      // Step 3
      nominee_user_id: draft.ownerIsMe ? null : draft.nomineeUserId,
      legal_first_name: draft.legalFirstName.trim(),
      legal_last_name: draft.legalLastName.trim(),
      display_name: `${draft.legalFirstName.trim()} ${draft.legalLastName.trim()}`.trim(),
      employee_number: draft.employeeNumber.trim() || "EMP-00001",
      hire_date: draft.hireDate || null,
    };

    const activated = await activateHrEmployer(payload);
    setSubmitting(false);

    if (!activated.ok) {
      setRefusal(activated);
      return;
    }

    const created = activated.data as unknown as HrActivationResult;
    setResult(created);
    // The employer context now says `is_activated: true`; without this every other
    // surface would keep rendering the wizard until a hard reload.
    activation.refresh();
    toast.success("HR is set up for this employer.");
    onComplete?.(created);
  };

  // ── A refusal from the server is a STATE, not a toast ─────────────────────
  if (refusal) {
    const reason = isHrDenied(refusal) ? refusal.reason : null;
    if (
      reason === "not_org_owner_or_admin" ||
      reason === "already_activated" ||
      reason === "nominee_not_a_member"
    ) {
      return (
        <RefusalPanel
          reason={reason}
          detail={isHrDenied(refusal) ? refusal.detail : null}
          orgRef={activation.orgRef}
          onRetry={() => setRefusal(null)}
          className={className}
        />
      );
    }
  }

  return (
    <div className={cn("w-full min-w-0 p-4 sm:p-6", className)}>
      <div className="mx-auto w-full max-w-2xl space-y-5">
        <header className="space-y-1">
          <h1 className="text-base font-semibold text-foreground">
            Set up HR for this employer
          </h1>
          <p className="text-sm text-muted-foreground">
            Three things: who the employer of record is, where the first people work,
            and who runs HR. Everything here can be changed afterwards.
          </p>
        </header>

        <StepRail current={step} />

        {step === 1 ? (
          <StepShell
            icon={Building2}
            title="Employer of record"
            blurb="The legal entity that employs people. It is the name on every W-2, letter and notice this system will ever produce."
          >
            <Field
              id="legal-name"
              label="Legal name"
              required
              value={draft.legalName}
              onChange={(v) => set("legalName", v)}
              hint="Exactly as it appears on the entity's formation documents."
            />
            <Field
              id="dba"
              label="Doing business as"
              value={draft.dbaName}
              onChange={(v) => set("dbaName", v)}
              hint="Only if the trading name differs from the legal name."
            />
            <div className="space-y-1.5">
              <Label htmlFor="ein" className="text-sm font-medium">
                EIN <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ein"
                value={draft.ein}
                inputMode="numeric"
                placeholder="12-3456789"
                onChange={(event) => set("ein", formatEinInput(event.target.value))}
                aria-invalid={draft.ein.length > 0 && !einCheck.ok}
                className="max-w-[12rem]"
              />
              {draft.ein.length > 0 && !einCheck.ok ? (
                <p role="alert" className="text-sm text-destructive">
                  {einCheck.why}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nine digits, written NN-NNNNNNN. Once saved, this number is
                  confidential and is never returned to a browser.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="entity-form" className="text-sm font-medium">
                  Entity form
                </Label>
                <Select
                  value={draft.entityForm}
                  onValueChange={(v) => set("entityForm", v)}
                >
                  <SelectTrigger id="entity-form">
                    <SelectValue placeholder="Choose one" />
                  </SelectTrigger>
                  <SelectContent>
                    {ENTITY_FORMS.map((form) => (
                      <SelectItem key={form.value} value={form.value}>
                        {form.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Field
                id="formation-state"
                label="Formation state"
                value={draft.formationState}
                onChange={(v) => set("formationState", v)}
                hint="Two letters — DE, CA, TX."
              />
            </div>

            <fieldset className="space-y-3 rounded-md border border-border p-3">
              <legend className="px-1 text-xs font-medium text-muted-foreground">
                Primary address
              </legend>
              <Field
                id="addr1"
                label="Street"
                value={draft.addressLine1}
                onChange={(v) => set("addressLine1", v)}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field
                  id="addr-city"
                  label="City"
                  value={draft.addressCity}
                  onChange={(v) => set("addressCity", v)}
                />
                <Field
                  id="addr-state"
                  label="State"
                  value={draft.addressState}
                  onChange={(v) => set("addressState", v)}
                />
                <Field
                  id="addr-zip"
                  label="ZIP"
                  value={draft.addressPostal}
                  onChange={(v) => set("addressPostal", v)}
                />
              </div>
            </fieldset>

            <HonestGap>
              Setup stores the legal name and the EIN today. The entity form, formation
              state and address are sent with them and will be stored the moment the
              server accepts them — until then you finish them on the employer profile,
              which is the first place this wizard sends you.
            </HonestGap>
          </StepShell>
        ) : null}

        {step === 2 ? (
          <StepShell
            icon={MapPin}
            title="Where the first people work"
            blurb="One location and one department is enough to start. You can add job titles later — a location you cannot."
          >
            <Field
              id="location-name"
              label="Location name"
              required
              value={draft.locationName}
              onChange={(v) => set("locationName", v)}
            />

            <div className="space-y-1.5">
              <Label htmlFor="tz" className="text-sm font-medium">
                Time zone <span className="text-destructive">*</span>
              </Label>
              <Select value={draft.tz} onValueChange={(v) => set("tz", v)}>
                <SelectTrigger id="tz">
                  <SelectValue placeholder="Choose the location's time zone" />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_TIMEZONES.map((zone) => (
                    <SelectItem key={zone} value={zone}>
                      {zone.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Every punch, shift and workweek at this location is stamped in this
                zone. Getting it wrong moves people&apos;s hours across day boundaries.
              </p>
            </div>

            {/* 🚨 THE ONE FIELD THAT CANNOT BE DEFERRED, WITH THE REASON AT THE CONTROL */}
            <div className="space-y-1.5">
              <Label htmlFor="jurisdiction" className="text-sm font-medium">
                Jurisdiction <span className="text-destructive">*</span>
              </Label>
              {jurisdictions === null ? (
                <Skeleton className="h-10 w-full" />
              ) : jurisdictions.length === 0 ? (
                <p
                  role="alert"
                  className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-foreground"
                >
                  No jurisdictions are loaded in this system, so no location can be
                  created — nothing could be lawfully scheduled or stamped against it.
                  This is a platform gap, not something you can fill in here. Send this
                  screen to whoever runs the platform.
                </p>
              ) : (
                <Select
                  value={draft.jurisdictionId}
                  onValueChange={(v) => set("jurisdictionId", v)}
                >
                  <SelectTrigger id="jurisdiction">
                    <SelectValue placeholder="Choose the jurisdiction" />
                  </SelectTrigger>
                  <SelectContent>
                    {jurisdictions.map((jurisdiction) => (
                      <SelectItem key={jurisdiction.id} value={jurisdiction.id}>
                        {jurisdiction.name} ({jurisdiction.level})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-sm text-muted-foreground">
                A location cannot be created without one, because nothing can be
                scheduled or stamped without a jurisdiction — overtime, breaks, minimum
                wage and holiday rules are all read from it.
              </p>
            </div>

            <fieldset className="space-y-3 rounded-md border border-border p-3">
              <legend className="px-1 text-xs font-medium text-muted-foreground">
                Location address
              </legend>
              <p className="text-sm text-muted-foreground">
                Setup does not store the location address yet — add it on the structure
                panel right after this, where the location also gets its code, geofence
                and establishment link.
              </p>
            </fieldset>

            <Field
              id="department-name"
              label="First department"
              required
              value={draft.departmentName}
              onChange={(v) => set("departmentName", v)}
              hint="One is enough. Departments nest, so this can become the parent of everything else."
            />
          </StepShell>
        ) : null}

        {step === 3 ? (
          <StepShell
            icon={Users}
            title="The first HR owner"
            blurb="One person gets full HR standing here. This is the single place where owning the organization confers HR authority — after this, every other role is assigned by the HR owner."
          >
            <div className="space-y-2">
              <Label className="text-sm font-medium">Who runs HR here?</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => set("ownerIsMe", true)}
                  className={cn(
                    "min-h-11 rounded-md border px-3 py-2 text-left text-sm",
                    draft.ownerIsMe
                      ? "border-foreground bg-accent text-accent-foreground"
                      : "border-border text-foreground hover:bg-accent/50",
                  )}
                >
                  Me
                </button>
                <button
                  type="button"
                  onClick={() => set("ownerIsMe", false)}
                  className={cn(
                    "min-h-11 rounded-md border px-3 py-2 text-left text-sm",
                    !draft.ownerIsMe
                      ? "border-foreground bg-accent text-accent-foreground"
                      : "border-border text-foreground hover:bg-accent/50",
                  )}
                >
                  Someone else in this organization
                </button>
              </div>
            </div>

            {!draft.ownerIsMe ? (
              <div className="space-y-1.5">
                <Label htmlFor="nominee" className="text-sm font-medium">
                  Nominee <span className="text-destructive">*</span>
                </Label>
                {members === null ? (
                  <Skeleton className="h-10 w-full" />
                ) : members.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nobody else is a member of this organization yet, so there is nobody
                    to nominate. Choose &quot;Me&quot;, or invite them to the
                    organization first.
                  </p>
                ) : (
                  <Select
                    value={draft.nomineeUserId}
                    onValueChange={(v) => set("nomineeUserId", v)}
                  >
                    <SelectTrigger id="nominee">
                      <SelectValue placeholder="Choose an organization member" />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((member) => (
                        <SelectItem key={member.userId} value={member.userId}>
                          {member.user?.displayName || member.user?.email || member.userId}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-sm text-muted-foreground">
                  Only a member of this organization can be nominated. Anyone else is
                  refused.
                </p>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                id="legal-first"
                label="Legal first name"
                required
                value={draft.legalFirstName}
                onChange={(v) => set("legalFirstName", v)}
              />
              <Field
                id="legal-last"
                label="Legal last name"
                required
                value={draft.legalLastName}
                onChange={(v) => set("legalLastName", v)}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                id="employee-number"
                label="Employee number"
                value={draft.employeeNumber}
                onChange={(v) => set("employeeNumber", v)}
              />
              <div className="space-y-1.5">
                <Label htmlFor="hire-date" className="text-sm font-medium">
                  Hire date
                </Label>
                <Input
                  id="hire-date"
                  type="date"
                  value={draft.hireDate}
                  onChange={(event) => set("hireDate", event.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Leave blank for today.
                </p>
              </div>
            </div>

            <HonestGap>
              This runs once. The moment an HR owner exists here — now or at any point
              in the past — setup refuses to run again, and a second HR owner becomes an
              ordinary role assignment made by the first.
            </HonestGap>

            {refusal ? (
              <p role="alert" className="text-sm text-destructive">
                {isHrDenied(refusal)
                  ? refusal.detail || `Setup was refused (${refusal.reason}).`
                  : refusal.message}
              </p>
            ) : null}
          </StepShell>
        ) : null}

        {/* ── The rail ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 sm:min-h-9"
            disabled={step === 1 || submitting}
            onClick={() => setStep((current) => Math.max(1, current - 1))}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          {step < 3 ? (
            <Button
              type="button"
              size="sm"
              className="min-h-11 sm:min-h-9"
              disabled={step === 1 ? !step1Ready : !step2Ready}
              onClick={() => setStep((current) => Math.min(3, current + 1))}
            >
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              className="min-h-11 sm:min-h-9"
              disabled={!step3Ready || submitting}
              onClick={submit}
            >
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Set up HR
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step 4 — what was created, and what was NOT ─────────────────────────────

function ActivationDone({
  result,
  orgRef,
  className,
}: {
  result: HrActivationResult;
  orgRef: string | null;
  className?: string;
}) {
  const seededEarning = result.seeded_earning_code_ids ?? [];
  const seededDeduction = result.seeded_deduction_code_ids ?? [];
  const seededDimensions = result.seeded_category_dimension_keys ?? [];
  const seededCalendar = result.seeded_holiday_calendar_id ?? null;
  const seededAnything =
    seededEarning.length > 0 ||
    seededDeduction.length > 0 ||
    seededDimensions.length > 0 ||
    Boolean(seededCalendar);

  return (
    <div className={cn("w-full min-w-0 p-4 sm:p-6", className)}>
      <div className="mx-auto w-full max-w-2xl space-y-5">
        <header className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-foreground" />
          <div className="space-y-1">
            <h1 className="text-base font-semibold text-foreground">HR is set up</h1>
            <p className="text-sm text-muted-foreground">
              Here is exactly what was created. Everything below is a door.
            </p>
          </div>
        </header>

        <section className="rounded-lg border border-border bg-card">
          <h2 className="border-b border-border p-3 text-sm font-semibold text-foreground">
            Created
          </h2>
          <ul className="divide-y divide-border">
            <CreatedRow
              label="Employer profile"
              detail="The legal entity of record"
              href={hrSettingsHref("employer", { org: orgRef })}
            />
            <CreatedRow
              label="First location"
              detail="With its time zone and jurisdiction"
              href={hrSettingsHref("structure", {
                org: orgRef,
                focus: result.location_id,
              })}
            />
            <CreatedRow
              label="First department"
              detail="Everything else can nest under it"
              href={hrSettingsHref("structure", {
                org: orgRef,
                focus: result.department_id,
              })}
            />
            <CreatedRow
              label="First HR owner"
              detail="Full HR standing for this employer"
              href={hrEmployeeHref(result.employee_id, "job", { org: orgRef })}
            />
          </ul>
        </section>

        {/* 🚨 SEEDS: report what the envelope says, and nothing more. */}
        <section className="rounded-lg border border-border bg-card">
          <h2 className="flex items-center gap-2 border-b border-border p-3 text-sm font-semibold text-foreground">
            <Sprout className="h-4 w-4" />
            Starting codes and calendars
          </h2>
          <div className="space-y-3 p-3">
            {seededAnything ? (
              <ul className="space-y-1 text-sm text-foreground">
                {seededEarning.length > 0 ? (
                  <li>{seededEarning.length} earning codes</li>
                ) : null}
                {seededDeduction.length > 0 ? (
                  <li>{seededDeduction.length} deduction codes</li>
                ) : null}
                {seededDimensions.length > 0 ? (
                  <li>
                    Category dimensions: {seededDimensions.join(", ")}
                  </li>
                ) : null}
                {seededCalendar ? <li>A default holiday calendar</li> : null}
                <li className="text-muted-foreground">
                  Tip-related earning codes ship seeded, not enabled — they exist so a
                  tipped employer does not have to invent them, and stay switched off
                  until that employer turns them on.
                </li>
              </ul>
            ) : (
              <p className="text-sm text-foreground">
                <span className="font-medium">Nothing was seeded.</span> Setup created no
                earning codes, no deduction codes, no category dimensions and no holiday
                calendar for this employer — so timesheets have no vocabulary to write
                against until you create some. That is the current behaviour of the
                setup step, not a failure of yours.
              </p>
            )}
            <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-9">
              <Link href={hrSettingsHref("codes", { org: orgRef })}>
                Open earning and deduction codes
              </Link>
            </Button>
          </div>
        </section>

        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" className="min-h-11 sm:min-h-9">
            <Link href={hrPeopleNewHref({ org: orgRef })}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add the first person
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-9">
            <Link href={hrSettingsHref("employer", { org: orgRef })}>
              Finish the employer profile
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-9">
            <Link href={hrSettingsHref("structure", { org: orgRef })}>
              Departments, locations and job titles
            </Link>
          </Button>
        </div>

        {result.audit_id ? (
          // The audit row's id is deliberately NOT printed: `hr.access_audit` is
          // readable only through `hr_access_audit_query`, so an id on screen would be
          // an identity with nowhere to open — a dead end with extra steps. What an
          // admin can act on is the fact that it was recorded, which is what this says.
          <p className="text-[0.6875rem] text-muted-foreground">
            Recorded in the access audit. Activation is the highest-privilege event in
            this employer&apos;s life and stays visible permanently.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function CreatedRow({
  label,
  detail,
  href,
}: {
  label: string;
  detail: string;
  href: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-[3rem] items-center gap-3 px-3 py-2 hover:bg-accent"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">{label}</span>
          <span className="block text-xs text-muted-foreground">{detail}</span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

// ── The first-hire door ─────────────────────────────────────────────────────

/**
 * The employer profile EXISTS and there are no people. Running the wizard here would
 * be refused `already_activated`, so this is the honest next move instead.
 */
function FirstHireDoor({ href, className }: { href: string; className?: string }) {
  return (
    <div className={cn("w-full min-w-0 p-4 sm:p-6", className)}>
      <div className="mx-auto flex max-w-xl flex-col items-start gap-3 rounded-lg border border-border bg-card p-4 sm:p-6">
        <ClipboardCheck className="h-5 w-5 shrink-0 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">
          This employer is set up — there is nobody in it yet
        </h2>
        <p className="text-sm text-muted-foreground">
          The employer of record, the first location and the first department all
          exist. Everything else in HR starts from a person, so the next step is to add
          one.
        </p>
        <Button asChild size="sm" className="min-h-11 sm:min-h-9">
          <Link href={href}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add the first person
          </Link>
        </Button>
      </div>
    </div>
  );
}

// ── Refusals, as first-class states ─────────────────────────────────────────

function RefusalPanel({
  reason,
  detail,
  orgRef,
  onRetry,
  className,
}: {
  reason: HrActivationRefusalReason;
  detail: string | null;
  orgRef: string | null;
  onRetry?: () => void;
  className?: string;
}) {
  const copy: Record<
    HrActivationRefusalReason,
    { title: string; body: string; door?: { label: string; href: string } }
  > = {
    not_org_owner_or_admin: {
      title: "Setting up HR is the organization owner's to do",
      body:
        "This is the one place where owning the organization confers HR authority, so " +
        "it is deliberately narrow: an owner or an admin of this organization runs it " +
        "once, and everything after that is assigned inside HR.",
    },
    already_activated: {
      title: "This employer already has an HR owner",
      body:
        "Setup runs exactly once. An HR owner exists here — now, or at some point in " +
        "the past — so a second one is not another setup: it is an ordinary role " +
        "assignment, made by the current HR owner on the Access Levels panel.",
      door: { label: "Open Access Levels", href: hrSettingsHref("access", { org: orgRef }) },
    },
    nominee_not_a_member: {
      title: "That person is not in this organization",
      body:
        "Only a member of this organization can be made its HR owner. Invite them to " +
        "the organization first, then run setup and nominate them.",
    },
  };

  const shown = copy[reason];

  return (
    <div className={cn("w-full min-w-0 p-4 sm:p-6", className)}>
      <div className="mx-auto flex max-w-xl flex-col items-start gap-3 rounded-lg border border-border bg-card p-4 sm:p-6">
        <ShieldAlert className="h-5 w-5 shrink-0 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{shown.title}</h2>
        <p className="text-sm text-muted-foreground">{detail?.trim() || shown.body}</p>
        <div className="flex flex-wrap gap-2">
          {shown.door ? (
            <Button asChild size="sm" className="min-h-11 sm:min-h-9">
              <Link href={shown.door.href}>{shown.door.label}</Link>
            </Button>
          ) : null}
          {onRetry ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRetry}
              className="min-h-11 sm:min-h-9"
            >
              Back to setup
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Small shared pieces ─────────────────────────────────────────────────────

function StepRail({ current }: { current: number }) {
  const steps = ["Employer", "People structure", "HR owner"];
  return (
    <ol className="flex min-w-0 flex-wrap gap-2" aria-label="Setup steps">
      {steps.map((label, index) => {
        const number = index + 1;
        const state =
          number < current ? "done" : number === current ? "current" : "upcoming";
        return (
          <li
            key={label}
            aria-current={state === "current" ? "step" : undefined}
            className={cn(
              "inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs",
              state === "current"
                ? "border-foreground bg-accent text-accent-foreground"
                : state === "done"
                  ? "border-border text-foreground"
                  : "border-border text-muted-foreground",
            )}
          >
            {state === "done" ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <span className="font-mono">{number}</span>
            )}
            {label}
          </li>
        );
      })}
    </ol>
  );
}

function StepShell({
  icon: Icon,
  title,
  blurb,
  children,
}: {
  icon: typeof Building2;
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-5">
      <header className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-1">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{blurb}</p>
        </div>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  hint,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function HonestGap({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-dashed border-border p-3">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
