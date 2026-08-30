"use client";

// features/hr/people/new/HrNewEmployee.tsx — ROUTE 12, SPEC-EMPLOYEES §4.1
//
// FOUR ENTRY MODES, ONE FORM. New person · link org member · link CRM party ·
// convert candidate. They differ ONLY in how the person is identified; the
// spell, the position and the pay are the same three steps in all four, because
// four forms would be four sets of validation that drift.
//
// EIGHT STATES: mode-select · new-person · link-member · link-party ·
// convert-candidate · duplicate-suspected · saving · created.
//
// 🚨 THE DUPLICATE SCAN RUNS BEFORE SUBMIT, NEVER AFTER. Matches render WITH
// DOORS, and "Continue anyway" requires an explicit not-the-same-person tick —
// a checkbox somebody has to physically assert, not a second click on the same
// button. The scan also reports which legs it SKIPPED (an SSN leg needs an HMAC
// only aidream can compute), because "no matches" from an incomplete scan is a
// different and more dangerous answer than "no matches".
//
// 🚨 THE SERVER IS THE AUTHORITY. Everything checked here is mirrored from
// `hr_employee_create`'s own validation (read live 2026-08-26) and exists for
// SPEED. Three refusals cannot be pre-empted client-side and each arrives with
// its own handling: `location_without_jurisdiction` (a DOOR to structure),
// `not_activated` (a door to the employer profile), and `rehire_required`
// (opens the §4.6 rehire panel with the prior spells).
//
// 🚨 THE CONTRACTOR BRANCH IS ABSENCE, NOT DISABLEMENT. Choosing `contractor`
// removes the pay-basis-as-employee framing and adds the engagement fields.
// Nothing anywhere on this form says "not available for contractors", and there
// is no I-9, W-4, PTO or overtime control to disable in the first place —
// they are not part of hiring.
//
// 🚨 THE NO-LOGIN CASE IS FIRST CLASS. `link_user_id` stays null unless the user
// deliberately links an account. Kiosk-only staff are normal, and nothing on
// this form assumes a login exists.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  IdCard,
  Link2,
  UserPlus,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { announceComingSoon } from "@/lib/coming-soon/announce";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOrganizationMembers } from "@/features/organizations/hooks";
import { searchPartiesByName } from "@/features/crm/service";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { HrPageState } from "../../shared/HrStates";
import { useHrContext } from "../../shared/useHrContext";
import { useHrPersona } from "../../shared/useHrPersona";
import {
  createHrEmployee,
  restoreHrEmployee,
  scanHrDuplicates,
} from "../../service";
import { fingerprintHrSsn, storeHrSsn } from "../identity/storeSsn";
import { useBackendApi } from "@/hooks/useBackendApi";
import { hrEmployeeHref, hrPeopleHref, hrSettingsHref } from "../../routes";
import { HR_WORKER_CLASSES } from "../../constants";
import {
  activeStructure,
  payFrequencyWords,
  payGroupOptions,
  useHrStructure,
} from "../shared/useHrStructure";
import { readWriteAck, type HrWriteRefusal } from "./writeAck";
import { DuplicatePanel, type HrDuplicateScan } from "./DuplicatePanel";
import { RehirePanel, type HrPriorEmployment } from "./RehirePanel";

type Mode = "new-person" | "link-member" | "link-party" | "convert-candidate";

/**
 * Radix `Select` refuses an empty-string item value, and "no pay group" is a real,
 * legitimate answer — not the absence of one. So it is a sentinel that never
 * leaves this file: the form state keeps `""` and the submit keeps sending `null`.
 */
const NO_PAY_GROUP = "__no_pay_group__";

export function HrNewEmployee({
  prefill,
}: {
  prefill: {
    name?: string | null;
    partyId?: string | null;
    userId?: string | null;
    candidateId?: string | null;
  };
}) {
  const router = useRouter();
  const api = useBackendApi();
  const { active, orgRef } = useHrContext();
  const { can } = useHrPersona();
  const organizationId = active?.organization_id ?? null;

  // A door that carried an identity picks the mode, so nobody re-chooses what
  // the link they followed already decided.
  const [mode, setMode] = useState<Mode | null>(
    prefill.partyId
      ? "link-party"
      : prefill.userId
        ? "link-member"
        : prefill.candidateId
          ? "convert-candidate"
          : null,
  );

  const structure = useHrStructure(organizationId).data;
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ employeeId: string } | null>(null);
  const [refusal, setRefusal] = useState<HrWriteRefusal | null>(null);
  const [scan, setScan] = useState<HrDuplicateScan | null>(null);
  const [notTheSamePerson, setNotTheSamePerson] = useState(false);
  const [rehire, setRehire] = useState<{
    spells: HrPriorEmployment[];
    employeeId: string | null;
    acknowledged: boolean;
    overrideReason: string;
  } | null>(null);
  // 🚨 `employee_archived` is a REFUSAL WITH A NEXT STEP, not an error (hr_l1_68/68a).
  // The person already has a record in this employer — §1.1 gives them exactly one, for life —
  // and it is archived, so nothing can be created beside it. The server no longer hands back a
  // door because there is no page that renders an archived record; it hands back the record's
  // id and `restorable: true`, and the restore happens right here, the way `rehire_required`
  // opens the rehire panel instead of sending anybody anywhere.
  const [archived, setArchived] = useState<{
    employeeId: string;
    employeeNumber: string | null;
    archivedAt: string | null;
    detail: string;
    restoring: boolean;
  } | null>(null);

  const [form, setForm] = useState({
    legal_first_name: prefill.name?.split(" ")[0] ?? "",
    legal_last_name: prefill.name?.split(" ").slice(1).join(" ") ?? "",
    preferred_first_name: "",
    work_email: "",
    work_phone: "",
    party_id: prefill.partyId ?? "",
    link_user_id: prefill.userId ?? "",
    hire_date: "",
    pay_group_id: "",
    ssn: "",
    job_title_id: "",
    department_id: "",
    location_id: "",
    manager_employment_id: "",
    worker_class: "employee",
    flsa_status: "nonexempt",
    flsa_exemption_basis: "",
    pay_basis: "hourly",
    schedule_class: "full_time",
    fte: "1",
    standard_hours_per_week: "",
    compensation_amount: "",
    platform_of_record: "direct",
    platform_external_id: "",
    platform_url: "",
  });

  const set = (patch: Partial<typeof form>) =>
    setForm((current) => ({ ...current, ...patch }));

  const { locations, departments, jobTitles } = activeStructure(structure);
  const chosenLocation =
    locations.find((l) => l.id === form.location_id) ?? null;

  // A deactivated pay group is not a choice you can make at hire.
  const payGroups = payGroupOptions(structure).filter((group) => group.isActive);
  const chosenPayGroup =
    payGroups.find((group) => group.id === form.pay_group_id) ?? null;

  const isContractor = form.worker_class === "contractor";

  // ── The client's mirror of the server's validation. Speed only. ─────────
  const problems: { field: string; sentence: string }[] = [];
  if (!form.hire_date) {
    problems.push({
      field: "hire_date",
      sentence: "A start date is required — every employment is dated.",
    });
  }
  if (!form.location_id) {
    problems.push({
      field: "location_id",
      sentence: "A position needs a location.",
    });
  }
  /*
    🚨 `job_title_id` IS NOT NULL ON `hr.position_assignment`, AND THIS FORM LET YOU
    SUBMIT WITHOUT ONE. The picker sat there empty, the button stayed enabled, and the
    database's own constraint message came back at the user — a raw SQL sentence for a
    field the form should have refused at the keyboard. A validation that exists in the
    database and nowhere else is not validation, it is a trap with a stack trace.
  */
  if (!form.job_title_id) {
    problems.push({
      field: "job_title_id",
      sentence:
        jobTitles.length === 0
          ? "This employer has no job titles yet, and every position needs one."
          : "A position needs a job title.",
    });
  }
  if (chosenLocation && !chosenLocation.jurisdiction_id) {
    problems.push({
      field: "location_id",
      sentence: `${chosenLocation.name} has no jurisdiction set, so nothing can be scheduled or stamped against it.`,
    });
  }
  if (form.flsa_status === "exempt" && !form.flsa_exemption_basis.trim()) {
    problems.push({
      field: "flsa_exemption_basis",
      sentence: "An exempt classification needs the basis it rests on.",
    });
  }
  /*
    🚨 A NULL STANDARD WEEK MAKES A LEAVE DAY COST ZERO HOURS — L5-A5. The leave
    door now refuses the null honestly instead of booking a free week, and the fix
    belongs here: it is the hire that never asked.

    🚨 AND THERE IS NO DEFAULT, DELIBERATELY. SPEC-DATA-MODEL declares this column
    `numeric(6,2)` — nullable, no default — sitting directly beneath
    `fte numeric(5,4) NOT NULL DEFAULT 1.0`, so the spec made two different choices
    on two adjacent lines and this is the one it left to be authored;
    SPEC-EMPLOYEES §442 lists it among the position's authored axes. There is also no
    employer knob naming a full-time week, so a "40" here would be THIS FORM deciding
    how long a working week is at somebody else's company — and 37.5 and 35 are both
    ordinary. A wrong number costs leave silently; an absent one is refused loudly.

    Required only where leave actually accrues. A contractor has no PTO (§4.7), so
    demanding their standard week would be inventing a fact nobody needs.
  */
  const accruesLeave = !["contractor", "volunteer"].includes(form.worker_class);
  const standardHours = form.standard_hours_per_week.trim();
  if (accruesLeave && !standardHours) {
    problems.push({
      field: "standard_hours_per_week",
      sentence:
        "A standard week is needed — it is what a day of leave costs against.",
    });
  } else if (standardHours) {
    const n = Number(standardHours);
    if (!Number.isFinite(n) || n <= 0 || n > 168) {
      problems.push({
        field: "standard_hours_per_week",
        sentence: "Standard hours must be more than 0 and no more than 168.",
      });
    }
  }

  const fteNumber = Number(form.fte);
  if (!Number.isFinite(fteNumber) || fteNumber <= 0 || fteNumber > 2) {
    problems.push({
      field: "fte",
      sentence: "FTE must be more than 0 and no more than 2.0.",
    });
  }
  if (mode === "new-person" && !form.legal_last_name.trim()) {
    problems.push({
      field: "legal_last_name",
      sentence:
        "A legal last name is required — it is what tax artifacts carry.",
    });
  }

  const duplicateBlocks =
    scan !== null && scan.matches.length > 0 && !notTheSamePerson;
  const rehireBlocks =
    rehire !== null &&
    !rehire.acknowledged &&
    // `false` is blocked by default; an `hr_owner` override needs a reason.
    true;

  const canSubmit =
    problems.length === 0 && !duplicateBlocks && !rehireBlocks && !saving;

  // ── The duplicate scan, BEFORE submit ──────────────────────────────────
  const runScan = async () => {
    if (!organizationId) return null;

    /*
      🚨 THE `ssn_hmac` LEG REPORTED `skipped` ON EVERY HIRE UNTIL THIS CALL EXISTED.
      `hr_duplicate_scan` matches on `p_probe.ssn_hmac_hex` and the HMAC key never
      enters the database (SPEC-ACCESS §4.5), so only aidream can compute it — and
      only through a call that stores NOTHING, because at probe time the candidate
      has no `hr.employee` row to seal a value against.

      A fingerprint that fails does NOT fail the hire: the scan still runs on the
      other legs and honestly reports `ssn_hmac` as skipped, which is what it did
      before. Refusing to hire because an optional duplicate leg was unavailable
      would be a worse answer than the one the scan already knows how to give.
    */
    let ssnHmacHex: string | null = null;
    if (form.ssn.trim()) {
      const fp = await fingerprintHrSsn({
        request: api.fetch,
        organizationId,
        ssn: form.ssn,
      });
      if (fp.kind === "fingerprinted") ssnHmacHex = fp.ssnHmacHex;
    }

    const result = await scanHrDuplicates({
      organizationId,
      probe: {
        display_name:
          `${form.preferred_first_name || form.legal_first_name} ${form.legal_last_name}`.trim(),
        work_email: form.work_email || null,
        party_id: form.party_id || null,
        ...(ssnHmacHex ? { ssn_hmac_hex: ssnHmacHex } : {}),
      },
    });
    const ack = readWriteAck<HrDuplicateScan>(
      result,
      "The duplicate check could not run.",
    );
    if (!ack.ok) {
      // A scan that could not run is NOT a clean scan. Say so and stop.
      setRefusal(ack.refusal);
      return null;
    }
    setScan(ack.data);
    return ack.data;
  };

  const submit = async () => {
    if (!organizationId) return;
    setRefusal(null);
    setArchived(null);
    setSaving(true);

    // 🚨 THE SCAN RUNS FIRST, ALWAYS, AND ITS RESULT GATES THE WRITE.
    //
    // Three outcomes, three behaviours:
    //   • it could not run  → STOP. A scan that failed is not a clean scan, and
    //                         creating anyway is how a duplicate person is born.
    //   • matches found     → STOP and show them. The user has to open them and
    //                         tick "different person" before the button will fire
    //                         again — which is why this returns rather than
    //                         chaining straight into the write.
    //   • nothing matched   → continue into the write in the SAME click. Making
    //                         somebody press a second time to confirm nothing is
    //                         a confirmation dialog with no question in it.
    if (scan === null) {
      const scanned = await runScan();
      if (!scanned || scanned.matches.length > 0) {
        setSaving(false);
        return;
      }
    }

    const result = await createHrEmployee({
      organization_id: organizationId,
      party_id: form.party_id || null,
      link_user_id: form.link_user_id || null,
      legal_first_name: form.legal_first_name || null,
      legal_last_name: form.legal_last_name || null,
      preferred_first_name: form.preferred_first_name || null,
      work_email: form.work_email || null,
      work_phone: form.work_phone || null,
      hire_date: form.hire_date,
      pay_group_id: form.pay_group_id || null,
      job_title_id: form.job_title_id || null,
      department_id: form.department_id || null,
      location_id: form.location_id || null,
      manager_employment_id: form.manager_employment_id || null,
      worker_class: form.worker_class,
      flsa_status: form.flsa_status,
      flsa_exemption_basis: form.flsa_exemption_basis || null,
      pay_basis: form.pay_basis,
      schedule_class: form.schedule_class,
      fte: fteNumber,
      standard_hours_per_week: form.standard_hours_per_week.trim()
        ? Number(form.standard_hours_per_week)
        : null,
      compensation_amount: form.compensation_amount || null,
      is_rehire: rehire !== null,
      ...(isContractor
        ? {
            platform_of_record: form.platform_of_record,
            platform_external_id: form.platform_external_id || null,
            platform_url: form.platform_url || null,
          }
        : {}),
      ...(rehire?.overrideReason
        ? { rehire_override_reason: rehire.overrideReason }
        : {}),
    });

    setSaving(false);

    const ack = readWriteAck<{ employee_id: string }>(
      result,
      "Nothing was created.",
    );

    if (ack.ok) {
      const employeeId = String(ack.data.employee_id);

      /*
        🚨 THE NUMBER IS SEALED AFTER THE PERSON EXISTS, because it is stored AGAINST
        an employee and there is no employee until the write above returns.

        If this fails the hire still stands — the person was created and undoing that
        to report a secondary failure would be far worse. So it says exactly what
        happened and where to finish it, rather than a green toast that implies the
        number was saved when it was not.
      */
      if (form.ssn.trim()) {
        const sealed = await storeHrSsn({
          request: api.fetch,
          employeeId,
          organizationId,
          ssn: form.ssn,
        });
        setForm((prev) => ({ ...prev, ssn: "" }));
        if (sealed.kind !== "stored") {
          setCreated({ employeeId });
          toast.error(
            `${form.legal_first_name || "The employee"} was created, but the Social Security number was not saved: ${sealed.message} You can add it on their profile.`,
          );
          return;
        }
      }

      setCreated({ employeeId });
      toast.success("Employee created.");
      return;
    }

    // 🚨 `rehire_required` OPENS THE REHIRE PANEL (§4.6) rather than reading as
    // an error. The server hands back the prior spells with their dates, reason,
    // `rehire_eligible` and its note — everything that panel needs.
    if (ack.refusal.reason === "rehire_required") {
      const existing = ack.refusal.payload.existing as
        { employee_id?: string; spells?: HrPriorEmployment[] } | undefined;
      setRehire({
        spells: existing?.spells ?? [],
        employeeId: existing?.employee_id ?? null,
        acknowledged: false,
        overrideReason: "",
      });
      return;
    }

    // 🚨 `employee_archived` OFFERS THE RESTORE instead of reading as an error. The record
    // exists, it is archived, and the one act that unblocks the hire is bringing it back —
    // which is a decision an HR admin makes, not something this form does silently.
    if (
      ack.refusal.reason === "employee_archived" &&
      typeof ack.refusal.payload.employee_id === "string"
    ) {
      setArchived({
        employeeId: ack.refusal.payload.employee_id,
        employeeNumber:
          typeof ack.refusal.payload.archived_employee_number === "string"
            ? ack.refusal.payload.archived_employee_number
            : null,
        archivedAt:
          typeof ack.refusal.payload.archived_at === "string"
            ? ack.refusal.payload.archived_at
            : null,
        detail:
          ack.refusal.detail ??
          "This person already has an archived employee record in this employer.",
        restoring: false,
      });
      return;
    }

    setRefusal(ack.refusal);
  };

  const onRestoreArchived = async () => {
    if (!archived || archived.restoring) return;
    setArchived((current) => (current ? { ...current, restoring: true } : current));
    const result = await restoreHrEmployee({ employeeId: archived.employeeId });
    const ack = readWriteAck<{ employee_id: string }>(
      result,
      "That record was not restored.",
    );
    if (!ack.ok) {
      setArchived((current) =>
        current ? { ...current, restoring: false } : current,
      );
      setRefusal(ack.refusal);
      return;
    }
    toast.success(
      "Record restored. Their history is back — record the return from their profile.",
    );
    router.push(hrEmployeeHref(archived.employeeId, null, { org: orgRef }));
  };

  // ── States ─────────────────────────────────────────────────────────────
  return (
    <HrPageState
      operation="Creating this employee"
      variant="panel"
      noAccessSentence="Adding people isn't yours here. A manager who needs a hire starts a requisition."
      granted={can("identity.write")}
    >
      <div className="mx-auto w-full max-w-3xl space-y-5 p-3 sm:p-4">
        {created ? (
          <Created
            employeeId={created.employeeId}
            org={orgRef}
            isFuture={form.hire_date > new Date().toISOString().slice(0, 10)}
          />
        ) : mode === null ? (
          <ModeSelect onPick={setMode} />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-11 lg:min-h-9"
                onClick={() => setMode(null)}
              >
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
                Change how
              </Button>
              <h1 className="text-sm font-semibold text-foreground">
                {MODE_TITLE[mode]}
              </h1>
            </div>

            {mode === "link-member" ? (
              <MemberPicker
                organizationId={organizationId}
                value={form.link_user_id}
                onPick={(userId, email, name) =>
                  set({
                    link_user_id: userId,
                    work_email: form.work_email || email,
                    legal_first_name:
                      form.legal_first_name || (name ?? "").split(" ")[0] || "",
                    legal_last_name:
                      form.legal_last_name ||
                      (name ?? "").split(" ").slice(1).join(" "),
                  })
                }
              />
            ) : null}

            {mode === "link-party" ? (
              <PartyPicker
                organizationId={organizationId}
                value={form.party_id}
                onPick={(partyId, name) =>
                  set({
                    party_id: partyId,
                    legal_first_name:
                      form.legal_first_name || name.split(" ")[0] || "",
                    legal_last_name:
                      form.legal_last_name ||
                      name.split(" ").slice(1).join(" "),
                  })
                }
              />
            ) : null}

            {mode === "convert-candidate" ? (
              <CandidateNote candidateId={prefill.candidateId ?? null} />
            ) : null}

            <Fieldset title="Who">
              <Grid>
                <Field label="Legal first name">
                  <Input
                    value={form.legal_first_name}
                    onChange={(event) =>
                      set({ legal_first_name: event.target.value })
                    }
                    className="h-11 lg:h-9"
                  />
                </Field>
                <Field
                  label="Legal last name"
                  error={problemFor(problems, "legal_last_name")}
                >
                  <Input
                    value={form.legal_last_name}
                    onChange={(event) =>
                      set({ legal_last_name: event.target.value })
                    }
                    className="h-11 lg:h-9"
                  />
                </Field>
                <Field
                  label="Goes by"
                  hint="What everyone actually calls them. Used everywhere except tax artifacts."
                >
                  <Input
                    value={form.preferred_first_name}
                    onChange={(event) =>
                      set({ preferred_first_name: event.target.value })
                    }
                    className="h-11 lg:h-9"
                  />
                </Field>
                <Field label="Work email">
                  <Input
                    type="email"
                    value={form.work_email}
                    onChange={(event) =>
                      set({ work_email: event.target.value })
                    }
                    className="h-11 lg:h-9"
                  />
                </Field>
                <Field label="Work phone">
                  <Input
                    value={form.work_phone}
                    onChange={(event) =>
                      set({ work_phone: event.target.value })
                    }
                    className="h-11 lg:h-9"
                  />
                </Field>

                {/*
                  🚨 OPTIONAL, MASKED, AND SEALED SERVER-SIDE — never held here and
                  never echoed. Typing it also turns on the duplicate check's
                  strongest leg: the scan matches on a keyed digest of this number,
                  which is the one identifier two records of the same person share
                  even when the names and emails differ.
                */}
                <Field label="Social Security number">
                  <Input
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    spellCheck={false}
                    value={form.ssn}
                    onChange={(event) => set({ ssn: event.target.value })}
                    placeholder="Optional — 000-00-0000"
                    className="h-11 font-mono lg:h-9"
                  />
                </Field>
              </Grid>

              {/* THE NO-LOGIN CASE, STATED. */}
              <p className="text-xs text-muted-foreground">
                A platform login is optional. Someone who only ever clocks in at
                a kiosk never needs one, and nothing in HR assumes they have
                one.
              </p>
            </Fieldset>

            <Fieldset title="Employment">
              <Grid>
                <Field
                  label="Start date"
                  error={problemFor(problems, "hire_date")}
                  hint={
                    form.hire_date > new Date().toISOString().slice(0, 10)
                      ? "A future start date creates them as not-started-yet. They are not counted in headcount until the day arrives."
                      : undefined
                  }
                >
                  <Input
                    type="date"
                    value={form.hire_date}
                    onChange={(event) => set({ hire_date: event.target.value })}
                    className="h-11 lg:h-9"
                  />
                </Field>
                <Field label="Worker class">
                  <Select
                    value={form.worker_class}
                    onValueChange={(value) => set({ worker_class: value })}
                  >
                    <SelectTrigger className="h-11 lg:h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HR_WORKER_CLASSES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                {/* 🚨 THE PAY GROUP. `pay_group_id` was in this form's state and in
                    its submit from the day it shipped, with NO CONTROL — so every
                    person hired here was created with a null one, and
                    `hr.pay_period` is generated from a pay group's calendar. No
                    group, no period; no period, no timesheet, no attestation, no
                    approval, no lock and no export for that person, ever. */}
                {payGroups.length === 0 ? (
                  <div className="min-w-0 space-y-1.5">
                    <span className="block text-xs font-medium">Pay group</span>
                    <p className="text-xs text-muted-foreground">
                      This employer has no pay groups yet. Pay periods are cut from a
                      pay group&apos;s calendar, so nobody here can have a timesheet
                      until one exists.
                    </p>
                    <Button
                      asChild
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-11 lg:min-h-9"
                    >
                      <Link href={hrSettingsHref("pay-groups", { org: orgRef })}>
                        Create a pay group
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <Field
                    label="Pay group"
                    hint={
                      chosenPayGroup
                        ? [
                            payFrequencyWords(chosenPayGroup.payFrequency),
                            "Their pay periods are cut from this group's calendar.",
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : undefined
                    }
                  >
                    <Select
                      value={form.pay_group_id || NO_PAY_GROUP}
                      onValueChange={(value) =>
                        set({ pay_group_id: value === NO_PAY_GROUP ? "" : value })
                      }
                    >
                      <SelectTrigger className="h-11 lg:h-9">
                        <SelectValue placeholder="Choose a pay group" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_PAY_GROUP}>No pay group</SelectItem>
                        {payGroups.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            {group.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </Grid>

              {/* NOT REQUIRED — a contractor may legitimately have none — but the
                  consequence is real and the form does not hide it. */}
              {payGroups.length > 0 && !form.pay_group_id ? (
                <p className="max-w-prose text-xs text-muted-foreground">
                  No pay group — this person will have no pay periods, so no
                  timesheet. That is a normal answer for a contractor who invoices;
                  for anyone whose hours you compute, pick one.
                </p>
              ) : null}
            </Fieldset>

            <Fieldset title="Position">
              <Grid>
                <Field label="Job title">
                  {/*
                    🚨 THE FIRST-RUN GAP, SAID OUT LOUD. Activation seeds a location and
                    a department but NO job title — deliberately, because a job title
                    carries an EEO category and is the employer's to name, so inventing
                    one on their behalf would be putting words in their mouth on a
                    compliance field. That is the right call, and it means a freshly
                    activated employer genuinely cannot hire until somebody creates a
                    title. What was wrong was leaving that fact for the database to
                    deliver: an empty dropdown is not an explanation, and it is
                    especially not one on the very first thing a new employer tries.
                  */}
                  {jobTitles.length === 0 ? (
                    <div className="space-y-1.5 rounded-md border border-dashed border-border p-2.5">
                      <p className="text-sm text-foreground">
                        No job titles exist yet.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Every position needs one, and a job title carries an EEO
                        category — so it is yours to name, not ours to guess.
                      </p>
                      <Link
                        href={hrSettingsHref("structure", { org: orgRef })}
                        className="inline-flex min-h-11 items-center text-xs text-foreground underline underline-offset-2 hover:text-primary lg:min-h-0"
                      >
                        Create one first — Settings → Structure
                      </Link>
                    </div>
                  ) : (
                  <Select
                    value={form.job_title_id}
                    onValueChange={(value) => {
                      const title = jobTitles.find((t) => t.id === value);
                      // A SUGGESTION, NEVER A SILENT OVERWRITE: the defaults are
                      // applied only into fields the user has not set.
                      set({
                        job_title_id: value,
                        flsa_status:
                          form.flsa_status === "nonexempt" &&
                          title?.default_flsa_status
                            ? title.default_flsa_status
                            : form.flsa_status,
                        pay_basis:
                          form.pay_basis === "hourly" &&
                          title?.default_pay_basis
                            ? title.default_pay_basis
                            : form.pay_basis,
                      });
                    }}
                  >
                    <SelectTrigger className="h-11 lg:h-9">
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
                  )}
                </Field>

                <Field label="Department">
                  <Select
                    value={form.department_id}
                    onValueChange={(value) => set({ department_id: value })}
                  >
                    <SelectTrigger className="h-11 lg:h-9">
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

                <Field
                  label="Location"
                  error={problemFor(problems, "location_id")}
                  hint={
                    chosenLocation?.jurisdiction_name
                      ? `Their overtime rules, sick-leave floor and final-pay deadline come from ${chosenLocation.jurisdiction_name}.`
                      : undefined
                  }
                >
                  <Select
                    value={form.location_id}
                    onValueChange={(value) => set({ location_id: value })}
                  >
                    <SelectTrigger className="h-11 lg:h-9">
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

                <Field label="FLSA status">
                  <Select
                    value={form.flsa_status}
                    onValueChange={(value) => set({ flsa_status: value })}
                  >
                    <SelectTrigger className="h-11 lg:h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nonexempt">Non-exempt</SelectItem>
                      <SelectItem value="exempt">Exempt</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                {form.flsa_status === "exempt" ? (
                  <Field
                    label="Exemption basis"
                    error={problemFor(problems, "flsa_exemption_basis")}
                  >
                    <Input
                      value={form.flsa_exemption_basis}
                      onChange={(event) =>
                        set({ flsa_exemption_basis: event.target.value })
                      }
                      placeholder="executive, administrative, professional…"
                      className="h-11 lg:h-9"
                    />
                  </Field>
                ) : null}

                <Field label="FTE" error={problemFor(problems, "fte")}>
                  <Input
                    type="number"
                    step="0.05"
                    min="0.05"
                    max="2"
                    value={form.fte}
                    onChange={(event) => set({ fte: event.target.value })}
                    className="h-11 lg:h-9"
                  />
                </Field>

                <Field
                  label="Standard hours a week"
                  error={problemFor(problems, "standard_hours_per_week")}
                >
                  <Input
                    type="number"
                    step="0.25"
                    min="0.25"
                    max="168"
                    value={form.standard_hours_per_week}
                    onChange={(event) =>
                      set({ standard_hours_per_week: event.target.value })
                    }
                    placeholder={accruesLeave ? "e.g. 40" : "Optional"}
                    className="h-11 lg:h-9"
                  />
                  {/* Said here, where the number is typed, not in a toast later. */}
                  <p className="mt-1 text-[0.6875rem] text-muted-foreground">
                    {accruesLeave
                      ? "What a day of leave costs against. Yours to state — plenty of employers are 37.5 or 35, so nothing is assumed."
                      : "Optional for this worker class — no leave accrues against it."}
                  </p>
                </Field>
              </Grid>

              {/* A LOCATION WITH NO JURISDICTION IS A DOOR, NOT A DEAD END. */}
              {chosenLocation && !chosenLocation.jurisdiction_id ? (
                <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
                  <p className="text-sm text-foreground">
                    {chosenLocation.name} has no jurisdiction, so nobody can be
                    scheduled, stamped or paid against it.
                  </p>
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="min-h-11 lg:min-h-9"
                  >
                    <Link
                      href={hrSettingsHref("structure", {
                        org: orgRef,
                        focus: chosenLocation.id,
                      })}
                    >
                      Set its jurisdiction
                    </Link>
                  </Button>
                </div>
              ) : null}
            </Fieldset>

            {/* ── The contractor branch: ADDITION, never disablement. ────── */}
            {isContractor ? (
              <Fieldset
                title="Engagement"
                description="Where this contractor is engaged, and their id there. It shows here and on their Job tab — not on the directory row."
              >
                <Grid>
                  <Field label="Engaged through">
                    <Input
                      value={form.platform_of_record}
                      onChange={(event) =>
                        set({ platform_of_record: event.target.value })
                      }
                      placeholder="direct, upwork, an agency…"
                      className="h-11 lg:h-9"
                    />
                  </Field>
                  <Field label="Their id there">
                    <Input
                      value={form.platform_external_id}
                      onChange={(event) =>
                        set({ platform_external_id: event.target.value })
                      }
                      className="h-11 lg:h-9"
                    />
                  </Field>
                  <Field label="Link">
                    <Input
                      value={form.platform_url}
                      onChange={(event) =>
                        set({ platform_url: event.target.value })
                      }
                      className="h-11 lg:h-9"
                    />
                  </Field>
                </Grid>
              </Fieldset>
            ) : null}

            <Fieldset
              title="Pay"
              description={
                isContractor
                  ? "A contract rate. It is one compensation record like any other, not a field on the engagement."
                  : "Their starting base rate. Everything else about pay happens on their record afterwards."
              }
            >
              <Grid>
                <Field label={isContractor ? "Contract rate" : "Amount"}>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.compensation_amount}
                    onChange={(event) =>
                      set({ compensation_amount: event.target.value })
                    }
                    className="h-11 lg:h-9"
                  />
                </Field>
                <Field label="Basis">
                  <Select
                    value={form.pay_basis}
                    onValueChange={(value) => set({ pay_basis: value })}
                  >
                    <SelectTrigger className="h-11 lg:h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Hourly</SelectItem>
                      <SelectItem value="salary">Salary</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="piece">Per piece</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </Grid>
            </Fieldset>

            {/* ── Duplicate scan result ───────────────────────────────── */}
            {scan ? (
              <DuplicatePanel
                scan={scan}
                org={orgRef}
                acknowledged={notTheSamePerson}
                onAcknowledge={setNotTheSamePerson}
              />
            ) : null}

            {/* ── Rehire (§4.6) ───────────────────────────────────────── */}
            {rehire ? (
              <RehirePanel
                spells={rehire.spells}
                employeeId={rehire.employeeId}
                org={orgRef}
                acknowledged={rehire.acknowledged}
                overrideReason={rehire.overrideReason}
                canOverride={can("identity.write")}
                onAcknowledge={(value) =>
                  setRehire((current) =>
                    current ? { ...current, acknowledged: value } : current,
                  )
                }
                onOverrideReason={(value) =>
                  setRehire((current) =>
                    current ? { ...current, overrideReason: value } : current,
                  )
                }
              />
            ) : null}

            {/* ── Archived record (§1.1 — one record per person, for life) ── */}
            {archived ? (
              <ArchivedRecordPanel
                detail={archived.detail}
                employeeNumber={archived.employeeNumber}
                archivedAt={archived.archivedAt}
                restoring={archived.restoring}
                canRestore={can("identity.write")}
                onRestore={onRestoreArchived}
              />
            ) : null}

            {refusal ? <RefusalNotice refusal={refusal} org={orgRef} /> : null}

            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <Button
                type="button"
                onClick={() => void submit()}
                disabled={!canSubmit}
                className="min-h-11 lg:min-h-9"
              >
                {saving
                  ? "Saving…"
                  : scan === null
                    ? "Check for duplicates and create"
                    : "Create"}
              </Button>
              <Button asChild variant="ghost" className="min-h-11 lg:min-h-9">
                <Link href={hrPeopleHref({ org: orgRef })}>Cancel</Link>
              </Button>
              {problems.length > 0 ? (
                <span className="text-xs text-muted-foreground">
                  {problems[0].sentence}
                </span>
              ) : null}
            </div>
          </>
        )}
      </div>
    </HrPageState>
  );
}

// ── Mode select ─────────────────────────────────────────────────────────────

const MODE_TITLE: Record<Mode, string> = {
  "new-person": "Add someone new",
  "link-member": "Add someone already on the platform",
  "link-party": "Add someone already in the CRM",
  "convert-candidate": "Hire a candidate",
};

function ModeSelect({ onPick }: { onPick: (mode: Mode) => void }) {
  const options: { mode: Mode; icon: typeof UserPlus; blurb: string }[] = [
    {
      mode: "new-person",
      icon: UserPlus,
      blurb: "Nobody in the system knows them yet.",
    },
    {
      mode: "link-member",
      icon: Users,
      blurb: "They already sign in here — reuse that account.",
    },
    {
      mode: "link-party",
      icon: Building2,
      blurb: "They are already a contact in the CRM.",
    },
    {
      mode: "convert-candidate",
      icon: IdCard,
      blurb: "They accepted an offer.",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h1 className="text-base font-semibold text-foreground">
          Add someone to HR
        </h1>
        <p className="text-sm text-muted-foreground">
          Start from what you already have. Every route lands in the same form —
          this only decides how they are identified.
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {options.map((option) => (
          <li key={option.mode}>
            <button
              type="button"
              onClick={() => onPick(option.mode)}
              className="flex min-h-[4.5rem] w-full items-start gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent"
            >
              <option.icon
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">
                  {MODE_TITLE[option.mode]}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {option.blurb}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Pickers ─────────────────────────────────────────────────────────────────

function MemberPicker({
  organizationId,
  value,
  onPick,
}: {
  organizationId: string | null;
  value: string;
  onPick: (userId: string, email: string, name: string | null) => void;
}) {
  const { members, loading } = useOrganizationMembers(
    organizationId ?? undefined,
  );

  return (
    <Fieldset
      title="Which account"
      description="Only people who already belong to this organization. Linking reuses their login rather than creating a second identity."
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading members…</p>
      ) : members.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nobody else belongs to this organization yet.
        </p>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {members.map((member) => (
            <li key={member.id}>
              <button
                type="button"
                onClick={() =>
                  onPick(
                    member.userId,
                    member.user?.email ?? "",
                    member.user?.displayName ?? null,
                  )
                }
                className={cn(
                  "flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-accent",
                  value === member.userId && "bg-accent",
                )}
              >
                <Link2
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span className="min-w-0 truncate">
                  {member.user?.displayName ??
                    member.user?.email ??
                    member.userId}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Fieldset>
  );
}

function PartyPicker({
  organizationId,
  value,
  onPick,
}: {
  organizationId: string | null;
  value: string;
  onPick: (partyId: string, name: string) => void;
}) {
  const [term, setTerm] = useState("");
  // Keyed by the search that produced it, so a stale result set for a term the
  // user has already changed is simply not rendered — no synchronous clear in
  // the effect, and no flash of the previous person's matches.
  const [found, setFound] = useState<{
    term: string;
    rows: { id: string; display_name: string | null }[];
  } | null>(null);

  const searchable = Boolean(organizationId) && term.trim().length >= 2;

  useEffect(() => {
    if (!organizationId || !searchable) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const rows = await searchPartiesByName({
            orgId: organizationId,
            search: term,
          });
          if (!cancelled) setFound({ term, rows });
        } catch {
          if (!cancelled) setFound({ term, rows: [] });
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [organizationId, term, searchable]);

  const results = searchable && found?.term === term ? found.rows : [];

  return (
    <Fieldset
      title="Which CRM record"
      description="An employee is one-to-one with a CRM record. Linking the existing one keeps their history in one place instead of creating a second copy of the same person."
    >
      <Input
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder="Search by name"
        className="h-11 max-w-sm lg:h-9"
      />
      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {results.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => onPick(row.id, row.display_name ?? "")}
              className={cn(
                "flex min-h-11 w-full items-center rounded-md px-2 text-left text-sm transition-colors hover:bg-accent",
                value === row.id && "bg-accent",
              )}
            >
              {row.display_name ?? row.id}
            </button>
          </li>
        ))}
      </ul>
    </Fieldset>
  );
}

/**
 * Convert-candidate. `hr.candidate` has no client read door, so this mode
 * carries the candidate id it was handed by the Hiring surface's own door and
 * says plainly what it could not prefill — rather than showing empty fields that
 * read as "the candidate record had nothing in it".
 *
 * 🚨 AND IT MUST NOT OFFER A DOOR BACK. It used to link `this candidate` to
 * `/hr/hiring/candidates/<id>` — a route under a pillar that is not built, so
 * the only outbound link on a screen that has just admitted it could not prefill
 * anything went to "We couldn't find that page". Worse in a new tab, where the
 * 404 arrives with no way back to the half-filled form. The id is still worth
 * naming — it is the evidence this hire came from a candidate — so it is shown
 * as text, with the registered promise beside it.
 */
function CandidateNote({ candidateId }: { candidateId: string | null }) {
  return (
    <Fieldset title="From a candidate">
      {candidateId ? (
        <p className="text-sm text-muted-foreground">
          Hiring candidate{" "}
          <span className="font-mono text-xs text-foreground">
            {candidateId}
          </span>
          . Their details are not carried over automatically yet — fill in what
          you need below. Interview notes, self-ID and rejection history never
          cross into an employee record by design.{" "}
          <button
            type="button"
            onClick={() =>
              void announceComingSoon("hr.hiring.candidate-record")
            }
            className="underline underline-offset-2 hover:text-primary"
          >
            About the candidate record
          </button>
          .
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Open the candidate from Hiring and choose Hire — that link carries the
          candidate through. Nothing here can look one up on its own.
        </p>
      )}
    </Fieldset>
  );
}

// ── Result states ───────────────────────────────────────────────────────────

function Created({
  employeeId,
  org,
  isFuture,
}: {
  employeeId: string;
  org: string | null;
  isFuture: boolean;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <CheckCircle2 className="h-5 w-5 text-success" aria-hidden />
      <h2 className="text-sm font-semibold text-foreground">
        They are on the record
      </h2>
      <p className="text-sm text-muted-foreground">
        {isFuture
          ? "They start on a future date, so they show as not-started-yet and are not counted in headcount until then."
          : "Everything else in HR keys off this record from here."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" className="min-h-11 lg:min-h-9">
          <Link href={hrEmployeeHref(employeeId, "job", { org })}>
            Open their record
          </Link>
        </Button>
        <Button
          asChild
          size="sm"
          variant="outline"
          className="min-h-11 lg:min-h-9"
        >
          <Link href={hrPeopleHref({ org })}>Back to the directory</Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * The archived-record panel (hr_l1_68 / 68a).
 *
 * NOT a `RefusalNotice`. That component renders a sentence and a "Go fix that" link, and there is
 * no page that renders an archived record to link TO — `hr_employee_profile` answers
 * `not_reachable` for one and the directory filters archived rows out. The act that unblocks the
 * hire happens here.
 */
function ArchivedRecordPanel({
  detail,
  employeeNumber,
  archivedAt,
  restoring,
  canRestore,
  onRestore,
}: {
  detail: string;
  employeeNumber: string | null;
  archivedAt: string | null;
  restoring: boolean;
  canRestore: boolean;
  onRestore: () => void;
}) {
  return (
    <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-3">
      <p className="text-sm text-foreground">{detail}</p>
      {employeeNumber || archivedAt ? (
        <p className="text-xs text-muted-foreground">
          {[
            employeeNumber ? `Employee number ${employeeNumber}` : null,
            archivedAt
              ? `archived ${new Date(archivedAt).toLocaleDateString()}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
      {canRestore ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 lg:min-h-9"
          disabled={restoring}
          onClick={onRestore}
        >
          {restoring ? "Restoring…" : "Restore their record"}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          Restoring an archived record needs the same access as hiring. Ask
          someone who has it.
        </p>
      )}
    </div>
  );
}

function RefusalNotice({
  refusal,
  org,
}: {
  refusal: HrWriteRefusal;
  org: string | null;
}) {
  // The server hands back a door for the two refusals a form cannot fix.
  const door =
    refusal.door ??
    (refusal.reason === "not_activated"
      ? hrSettingsHref("employer", { org })
      : null);

  return (
    <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
      <p className="text-sm text-foreground">
        {refusal.detail || "That wasn't accepted, and nothing was created."}
      </p>
      {door ? (
        <Button
          asChild
          size="sm"
          variant="outline"
          className="min-h-11 lg:min-h-9"
        >
          <Link href={door}>Go fix that</Link>
        </Button>
      ) : null}
    </div>
  );
}

// ── Layout pieces ───────────────────────────────────────────────────────────

function Fieldset({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-0.5">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="max-w-prose text-xs text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label className="block space-y-1.5">
        <span className="block text-xs font-medium">{label}</span>
        {children}
      </Label>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function problemFor(
  problems: { field: string; sentence: string }[],
  field: string,
): string | null {
  return problems.find((problem) => problem.field === field)?.sentence ?? null;
}
