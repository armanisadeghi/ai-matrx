// features/hr/settings/structure/HrStructurePanel.tsx
//
// ROUTE 69 — DEPARTMENTS · LOCATIONS · JOB TITLES. The three things a person is
// assigned to, and the only three.
//
// ── THE FOUR RULES THIS PANEL ENFORCES AT THE CONTROL ──────────────────────
//  1. A DEPARTMENT'S PARENT IS CYCLE-CHECKED. A department cannot be its own
//     ancestor; the picker simply does not offer a descendant, so the cycle is
//     unrepresentable rather than rejected on save.
//  2. A LOCATION NEEDS AN IANA TIME ZONE AND A JURISDICTION. Both required, and the
//     form says WHY: nothing can be scheduled or stamped against a location without
//     a jurisdiction, because overtime, breaks, minimum wage and holidays are all
//     read from it.
//  3. A JOB TITLE NEEDS AN EEO-1 JOB CATEGORY. It is a NOT NULL column on
//     `hr.job_title`, and a title without one cannot be reported on.
//  4. DEACTIVATING A ROW CURRENT ASSIGNMENTS REFERENCE IS REFUSED — with the count
//     as a DOOR to exactly those people. `assignment_count` comes off the structure
//     envelope, counted server-side over live assignments.
//
// ── THE EDGE, STATED ON THE PANEL ──────────────────────────────────────────
// Re-mapping a job title's EEO-1 category does NOT rewrite history. Existing
// assignments keep the category that was denormalized onto them at write, which is
// what makes a past EEO-1 filing reproducible.
//
// `?focus=<id>` opens the matching row — the profile's department / location / title
// doors land here (`hrStructureFocusHref`).
//
// ── 🚨 G2 F3: THE CREATE PATH ──────────────────────────────────────────────
// All three editors used to be mounted ONLY as the `detail:` renderer of a
// `MatrxDataTable` row — the expansion of a row that already exists. With zero rows
// there was no path to any of them, while this panel's own empty state promised the
// opposite ("Setup creates the first one; add the rest as the org grows"). An org
// could not add its second department, its second location, or ANY job title.
//
// Each section now carries a primary action in its header AND inside its empty
// state — the empty state most of all, because that is the moment somebody is most
// likely to act. There is no second form: each editor takes its row as
// `T | null`, and null is create mode. `upsertHrStructure` omits `id` to insert,
// which is exactly what `public.hr_structure_upsert` branches on.

"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Info, ListTree, Loader2, MapPin, Plus, Save, Users } from "lucide-react";

import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";

import { upsertHrStructure } from "../../service";
import { isHrDenied } from "../../types";
import type { HrDepartment, HrJobTitle, HrLocation, HrResult } from "../../types";
import { hrPeopleHref } from "../../routes";
import { useHrContext } from "../../shared/useHrContext";
import { useHrSettingsStructure } from "../hooks/useHrSettingsStructure";
import { HrSettingsShell } from "../HrSettingsShell";
import type { HrJurisdiction } from "../types";

/** The nine EEO-1 job categories. Fixed by the EEOC — not an org's to invent. */
const EEO1_JOB_CATEGORIES = [
  { value: "executive_senior_officials", label: "Executive / senior-level officials and managers" },
  { value: "first_mid_officials", label: "First / mid-level officials and managers" },
  { value: "professionals", label: "Professionals" },
  { value: "technicians", label: "Technicians" },
  { value: "sales_workers", label: "Sales workers" },
  { value: "administrative_support", label: "Administrative support workers" },
  { value: "craft_workers", label: "Craft workers" },
  { value: "operatives", label: "Operatives" },
  { value: "laborers_helpers", label: "Laborers and helpers" },
  { value: "service_workers", label: "Service workers" },
];

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

// ── The refusal, rendered where it happened ─────────────────────────────────

/**
 * 🚨 A REFUSAL IS DATA, NOT AN EXCEPTION. `hr_structure_upsert` answers
 * `{ok:false, reason:'validation', field:'jurisdiction_id', detail:'…'}` with NO
 * Postgres error, so `supabase.rpc()` resolves happily and a caller that only
 * catches throws reports a save that never happened.
 *
 * The server names the control it rejected (`field`) and, where one exists, the
 * place to go and fix it (`door`). Both are carried to the form, so the sentence
 * lands ON the offending input rather than becoming "something went wrong".
 */
type WriteRefusal = { message: string; field: string | null; door: string | null };

function refusalOf<T>(result: HrResult<T>, fallback: string): WriteRefusal | null {
  if (result.ok) return null;
  if (isHrDenied(result)) {
    return {
      message:
        result.detail?.trim() ||
        `${fallback} (${result.reason.replace(/_/g, " ")}).`,
      field: result.field,
      door: result.door,
    };
  }
  return { message: result.message, field: null, door: null };
}

/** The one alert block, with the server's door offered when it sent one. */
function RefusalNote({ refusal }: { refusal: WriteRefusal }) {
  return (
    <div
      role="alert"
      className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3"
    >
      <p className="text-sm text-destructive">{refusal.message}</p>
      {refusal.door ? (
        <Link
          href={refusal.door}
          className="inline-flex min-h-11 items-center text-sm font-medium text-foreground underline underline-offset-2 sm:min-h-0"
        >
          Go and fix it
        </Link>
      ) : null}
    </div>
  );
}

/** The message repeated at the named control — the whole point of `field`. */
function FieldRefusal({
  refusal,
  field,
}: {
  refusal: WriteRefusal | null;
  field: string;
}) {
  if (!refusal || refusal.field !== field) return null;
  return <p className="text-sm text-destructive">{refusal.message}</p>;
}

function invalidFor(refusal: WriteRefusal | null, field: string): boolean {
  return refusal?.field === field;
}

// ── The create affordance ───────────────────────────────────────────────────

/**
 * The primary action, rendered identically in a section header and inside that
 * section's empty state. Two call sites, one control — an org with forty
 * departments needs the forty-first, and an org with none needs the first from the
 * very place that explains why it matters.
 */
function NewRowButton({
  label,
  onClick,
  disabled,
  full,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  full?: boolean;
}) {
  return (
    <Button
      type="button"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className={
        full
          ? "min-h-11 w-full shrink-0 sm:min-h-9 sm:w-auto"
          : "min-h-11 shrink-0 sm:min-h-9"
      }
    >
      <Plus className="mr-2 h-4 w-4" />
      {label}
    </Button>
  );
}

/** The create editor's frame — same place on every section, above the list. */
function CreatePanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border bg-muted/30 p-4">
      <h3 className="px-3 text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

// ── Cycle safety ────────────────────────────────────────────────────────────

/**
 * Every department that is `id` or a descendant of it — the set that may NOT be its
 * parent. Offering only the complement makes a cycle unrepresentable in the UI.
 */
function descendantsOf(departments: HrDepartment[], id: string): Set<string> {
  const blocked = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const department of departments) {
      if (
        department.parent_department_id &&
        blocked.has(department.parent_department_id) &&
        !blocked.has(department.id)
      ) {
        blocked.add(department.id);
        grew = true;
      }
    }
  }
  return blocked;
}

// ── The panel ───────────────────────────────────────────────────────────────

export function HrStructurePanel() {
  const { active, orgRef } = useHrContext();
  const organizationId = active?.organization_id ?? null;
  const searchParams = useSearchParams();
  const focus = searchParams?.get("focus") ?? null;

  const { structure, isLoading, error, refresh } = useHrSettingsStructure(organizationId);

  const departments = structure?.departments ?? [];
  const locations = structure?.locations ?? [];
  const jobTitles = structure?.job_titles ?? [];
  const jurisdictions = structure?.jurisdictions ?? [];

  return (
    <HrSettingsShell
      section="structure"
      title="Structure"
      description="Departments, locations and job titles."
      loading={isLoading}
      error={error}
      operation="This employer's departments, locations and job titles"
      onRetry={refresh}
    >
      <div className="space-y-6 p-4 sm:p-6">
        <DepartmentsSection
          departments={departments}
          organizationId={organizationId}
          orgRef={orgRef}
          focus={focus}
          onSaved={refresh}
        />
        <LocationsSection
          locations={locations}
          jurisdictions={jurisdictions}
          organizationId={organizationId}
          orgRef={orgRef}
          focus={focus}
          onSaved={refresh}
        />
        <JobTitlesSection
          jobTitles={jobTitles}
          organizationId={organizationId}
          orgRef={orgRef}
          focus={focus}
          onSaved={refresh}
        />
      </div>
    </HrSettingsShell>
  );
}

// ── A shared "this row is in use" door ──────────────────────────────────────

/**
 * A COUNT IS A DOOR. `12 people` opens the directory filtered to exactly those
 * twelve — never a dead number in a cell.
 */
function AssignmentCount({
  count,
  href,
}: {
  count: number;
  href: string;
}) {
  if (count === 0) {
    return <span className="text-sm text-muted-foreground">Nobody</span>;
  }
  return (
    <Link
      href={href}
      className="text-sm font-medium text-foreground underline-offset-2 hover:underline"
    >
      {count} {count === 1 ? "person" : "people"}
    </Link>
  );
}

/**
 * Deactivation, with the refusal that matters: a row current assignments reference
 * cannot be switched off, and the count is the door to the people who would be
 * orphaned by it.
 */
async function confirmDeactivate(args: {
  label: string;
  count: number;
  href: string;
}): Promise<boolean> {
  if (args.count > 0) {
    await confirm({
      title: `${args.label} is still in use`,
      description:
        `${args.count} current ${args.count === 1 ? "assignment references" : "assignments reference"} it, so ` +
        "switching it off would leave those people pointing at something inactive. " +
        "Move them first — the count on the row opens the list of exactly who they are.",
      confirmLabel: "Got it",
      cancelLabel: null,
    });
    return false;
  }
  return confirm({
    title: `Switch off ${args.label}?`,
    description:
      "It stays in the record and on every historical assignment — it simply stops " +
      "being offered for new ones.",
    confirmLabel: "Switch it off",
  });
}

// ── Departments ─────────────────────────────────────────────────────────────

function DepartmentsSection({
  departments,
  organizationId,
  orgRef,
  focus,
  onSaved,
}: {
  departments: HrDepartment[];
  organizationId: string | null;
  orgRef: string | null;
  focus: string | null;
  onSaved: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const byId = new Map(departments.map((department) => [department.id, department]));

  const columns: MatrxColumnDef<HrDepartment>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: "Department",
      cell: (row) => (
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">{row.name}</span>
          {row.code ? (
            <span className="block font-mono text-[0.6875rem] text-muted-foreground">
              {row.code}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: "parent",
      accessorFn: (row) =>
        row.parent_department_id ? byId.get(row.parent_department_id)?.name ?? "—" : "—",
      header: "Reports into",
      filter: "select",
    },
    { id: "cost_center", accessorKey: "cost_center", header: "Cost centre", mobileHidden: true },
    {
      id: "assignments",
      accessorKey: "assignment_count",
      header: "People",
      cell: (row) => (
        <AssignmentCount
          count={row.assignment_count}
          href={hrPeopleHref({ org: orgRef, departmentId: row.id })}
        />
      ),
    },
    {
      id: "active",
      accessorFn: (row) => (row.is_active ? "Active" : "Inactive"),
      header: "Status",
      filter: "select",
      cell: (row) => (
        <Badge variant={row.is_active ? "secondary" : "outline"}>
          {row.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
  ];

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <ListTree className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 space-y-1">
            <h2 className="text-sm font-semibold text-foreground">Departments</h2>
            <p className="text-sm text-muted-foreground">
              Departments nest. A department can never be placed under one of its own
              descendants — the picker does not offer them.
            </p>
          </div>
        </div>
        <NewRowButton
          label="New department"
          full
          disabled={creating || !organizationId}
          onClick={() => setCreating(true)}
        />
      </header>

      {creating ? (
        <CreatePanel title="New department">
          <DepartmentEditor
            department={null}
            departments={departments}
            organizationId={organizationId}
            orgRef={orgRef}
            onSaved={() => {
              setCreating(false);
              onSaved();
            }}
            onCancel={() => setCreating(false)}
          />
        </CreatePanel>
      ) : null}

      <div className="p-4">
        <MatrxDataTable
          data={departments}
          columns={columns}
          getRowId={(row) => row.id}
          pageSize={25}
          selectedId={focus}
          urlState={{ id: "hr-departments" }}
          toolbar={{ search: true, searchPlaceholder: "Search departments" }}
          emptyState={{
            title: "No departments yet",
            description:
              "Nobody can be assigned to a department until one exists. Add the first one here — and the rest as the org grows.",
            action: (
              <NewRowButton
                label="New department"
                disabled={creating || !organizationId}
                onClick={() => setCreating(true)}
              />
            ),
          }}
          detail={{
            title: (row) => row.name,
            render: (row) => (
              <DepartmentEditor
                department={row}
                departments={departments}
                organizationId={organizationId}
                orgRef={orgRef}
                onSaved={onSaved}
              />
            ),
          }}
        />
      </div>
    </section>
  );
}

/** `department === null` is CREATE. Same form, same rules, no second component. */
function DepartmentEditor({
  department,
  departments,
  organizationId,
  orgRef,
  onSaved,
  onCancel,
}: {
  department: HrDepartment | null;
  departments: HrDepartment[];
  organizationId: string | null;
  orgRef: string | null;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const isCreate = department === null;
  // Distinct ids per mounted editor: the create panel and an expanded row can both
  // be on the page, and duplicate DOM ids break every `htmlFor`.
  const uid = useId();

  const [name, setName] = useState(department?.name ?? "");
  const [code, setCode] = useState(department?.code ?? "");
  const [costCenter, setCostCenter] = useState(department?.cost_center ?? "");
  const [parentId, setParentId] = useState(department?.parent_department_id ?? "");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<WriteRefusal | null>(null);

  // 🚨 THE CYCLE CHECK, MADE UNREPRESENTABLE: this department and everything under
  // it are simply not in the list. A department that does not exist yet has no
  // descendants, so on a create every department is a legitimate parent.
  const blocked = department ? descendantsOf(departments, department.id) : null;
  const parentOptions = blocked
    ? departments.filter((candidate) => !blocked.has(candidate.id))
    : departments;

  const save = async () => {
    if (!organizationId) return;
    if (name.trim() === "") {
      setRefusal({ message: "A department needs a name.", field: "name", door: null });
      return;
    }
    setBusy(true);
    setRefusal(null);
    const result = await upsertHrStructure({
      kind: "department",
      payload: {
        // No `id` is what makes this an INSERT server-side.
        ...(department ? { id: department.id } : {}),
        organization_id: organizationId,
        name: name.trim(),
        code: code.trim() || null,
        cost_center: costCenter.trim() || null,
        parent_department_id: parentId || null,
      },
    });
    setBusy(false);

    const denial = refusalOf(result, "The server refused this department");
    if (denial) {
      setRefusal(denial);
      return;
    }
    toast.success(
      isCreate ? `${name.trim()} is created.` : `${name.trim()} is saved.`,
    );
    onSaved();
  };

  const toggleActive = async () => {
    if (!organizationId || !department) return;
    if (department.is_active) {
      const proceed = await confirmDeactivate({
        label: department.name,
        count: department.assignment_count,
        href: hrPeopleHref({ org: orgRef, departmentId: department.id }),
      });
      if (!proceed) return;
    }
    setBusy(true);
    const result = await upsertHrStructure({
      kind: "department",
      payload: {
        id: department.id,
        organization_id: organizationId,
        is_active: !department.is_active,
      },
    });
    setBusy(false);

    const denial = refusalOf(result, "The server refused this change");
    if (denial) {
      setRefusal(denial);
      return;
    }
    onSaved();
  };

  return (
    <div className="space-y-4 p-3">
      <EditorField
        id={`${uid}-name`}
        label="Name"
        required
        value={name}
        onChange={setName}
        disabled={busy}
        invalid={invalidFor(refusal, "name")}
      />
      <FieldRefusal refusal={refusal} field="name" />
      <EditorField
        id={`${uid}-code`}
        label="Code"
        value={code}
        onChange={setCode}
        disabled={busy}
      />
      <EditorField
        id={`${uid}-cc`}
        label="Cost centre"
        value={costCenter}
        onChange={setCostCenter}
        disabled={busy}
      />
      <div className="space-y-1.5">
        <Label htmlFor={`${uid}-parent`} className="text-sm font-medium">
          Reports into
        </Label>
        <Select value={parentId} onValueChange={setParentId}>
          <SelectTrigger
            id={`${uid}-parent`}
            aria-invalid={invalidFor(refusal, "parent_department_id")}
          >
            <SelectValue placeholder="Top level" />
          </SelectTrigger>
          <SelectContent>
            {parentOptions.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {isCreate
            ? "Leave it at top level if this department reports into nobody."
            : "This department and everything beneath it are not offered — a department cannot report into itself."}
        </p>
        <FieldRefusal refusal={refusal} field="parent_department_id" />
      </div>

      {department ? (
        <div className="flex items-center gap-3">
          <Switch
            id={`${uid}-active`}
            checked={department.is_active}
            disabled={busy}
            onCheckedChange={toggleActive}
          />
          <Label htmlFor={`${uid}-active`} className="text-sm">
            Offered for new assignments
          </Label>
        </div>
      ) : null}

      {refusal ? <RefusalNote refusal={refusal} /> : null}

      <EditorActions
        isCreate={isCreate}
        busy={busy}
        createLabel="Create department"
        onSave={save}
        onCancel={onCancel}
      />
    </div>
  );
}

// ── Locations ───────────────────────────────────────────────────────────────

function LocationsSection({
  locations,
  jurisdictions,
  organizationId,
  orgRef,
  focus,
  onSaved,
}: {
  locations: HrLocation[];
  jurisdictions: HrJurisdiction[];
  organizationId: string | null;
  orgRef: string | null;
  focus: string | null;
  onSaved: () => void;
}) {
  const [creating, setCreating] = useState(false);

  const columns: MatrxColumnDef<HrLocation>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: "Location",
      cell: (row) => (
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">{row.name}</span>
          {row.is_remote ? (
            <span className="block text-xs text-muted-foreground">Remote</span>
          ) : null}
        </span>
      ),
    },
    { id: "tz", accessorKey: "tz", header: "Time zone", filter: "select" },
    {
      id: "jurisdiction",
      accessorFn: (row) => row.jurisdiction_name ?? "MISSING",
      header: "Jurisdiction",
      filter: "select",
      cell: (row) =>
        row.jurisdiction_id ? (
          <span className="text-sm text-foreground">{row.jurisdiction_name}</span>
        ) : (
          <Badge variant="destructive">No jurisdiction</Badge>
        ),
    },
    {
      id: "assignments",
      accessorKey: "assignment_count",
      header: "People",
      cell: (row) => (
        <AssignmentCount
          count={row.assignment_count}
          href={hrPeopleHref({ org: orgRef, locationId: row.id })}
        />
      ),
    },
    {
      id: "active",
      accessorFn: (row) => (row.is_active ? "Active" : "Inactive"),
      header: "Status",
      filter: "select",
      cell: (row) => (
        <Badge variant={row.is_active ? "secondary" : "outline"}>
          {row.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
  ];

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 space-y-1">
            <h2 className="text-sm font-semibold text-foreground">Locations</h2>
            <p className="text-sm text-muted-foreground">
              Every location carries a time zone and a jurisdiction. Both are required,
              because every punch, shift and workweek is stamped from them.
            </p>
          </div>
        </div>
        <NewRowButton
          label="New location"
          full
          disabled={creating || !organizationId}
          onClick={() => setCreating(true)}
        />
      </header>

      {creating ? (
        <CreatePanel title="New location">
          <LocationEditor
            location={null}
            jurisdictions={jurisdictions}
            organizationId={organizationId}
            orgRef={orgRef}
            onSaved={() => {
              setCreating(false);
              onSaved();
            }}
            onCancel={() => setCreating(false)}
          />
        </CreatePanel>
      ) : null}

      <div className="p-4">
        <MatrxDataTable
          data={locations}
          columns={columns}
          getRowId={(row) => row.id}
          pageSize={25}
          selectedId={focus}
          urlState={{ id: "hr-locations" }}
          toolbar={{ search: true, searchPlaceholder: "Search locations" }}
          emptyState={{
            title: "No locations yet",
            description:
              "Nothing can be scheduled or stamped until at least one exists — a punch has no rules to be checked against without a location.",
            action: (
              <NewRowButton
                label="New location"
                disabled={creating || !organizationId}
                onClick={() => setCreating(true)}
              />
            ),
          }}
          detail={{
            title: (row) => row.name,
            render: (row) => (
              <LocationEditor
                location={row}
                jurisdictions={jurisdictions}
                organizationId={organizationId}
                orgRef={orgRef}
                onSaved={onSaved}
              />
            ),
          }}
        />
      </div>
    </section>
  );
}

/** `location === null` is CREATE. Both required fields are enforced in both modes. */
function LocationEditor({
  location,
  jurisdictions,
  organizationId,
  orgRef,
  onSaved,
  onCancel,
}: {
  location: HrLocation | null;
  jurisdictions: HrJurisdiction[];
  organizationId: string | null;
  orgRef: string | null;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const isCreate = location === null;
  const uid = useId();

  const [name, setName] = useState(location?.name ?? "");
  const [code, setCode] = useState(location?.code ?? "");
  const [tz, setTz] = useState(location?.tz ?? "");
  const [jurisdictionId, setJurisdictionId] = useState(location?.jurisdiction_id ?? "");
  const [isRemote, setIsRemote] = useState(location?.is_remote ?? false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<WriteRefusal | null>(null);

  const timezoneOptions = COMMON_TIMEZONES.includes(tz)
    ? COMMON_TIMEZONES
    : tz
      ? [tz, ...COMMON_TIMEZONES]
      : COMMON_TIMEZONES;

  const save = async () => {
    if (!organizationId) return;
    if (name.trim() === "") {
      setRefusal({ message: "A location needs a name.", field: "name", door: null });
      return;
    }
    if (tz.trim() === "") {
      setRefusal({
        message:
          "A location needs an IANA time zone. Every punch and shift at this location is " +
          "stamped in it, and without one hours land on the wrong day.",
        field: "tz",
        door: null,
      });
      return;
    }
    // 🚨 THE REFUSAL WITH ITS REASON, AT THE CONTROL, BEFORE THE SAVE. The server
    // refuses the same thing with `field: "jurisdiction_id"`; saying it here saves a
    // round trip without ever being the only thing that checks.
    if (jurisdictionId.trim() === "") {
      setRefusal({
        message:
          "A location cannot be saved without a jurisdiction. Nothing can be scheduled " +
          "or stamped against it: overtime, breaks, minimum wage and holidays are all " +
          "read from the jurisdiction, and a location without one silently produces " +
          "unlawful results.",
        field: "jurisdiction_id",
        door: null,
      });
      return;
    }

    setBusy(true);
    setRefusal(null);
    const result = await upsertHrStructure({
      kind: "location",
      payload: {
        ...(location ? { id: location.id } : {}),
        organization_id: organizationId,
        name: name.trim(),
        code: code.trim() || null,
        tz: tz.trim(),
        jurisdiction_id: jurisdictionId,
        is_remote: isRemote,
      },
    });
    setBusy(false);

    const denial = refusalOf(result, "The server refused this location");
    if (denial) {
      setRefusal(denial);
      return;
    }
    toast.success(
      isCreate ? `${name.trim()} is created.` : `${name.trim()} is saved.`,
    );
    onSaved();
  };

  const toggleActive = async () => {
    if (!organizationId || !location) return;
    if (location.is_active) {
      const proceed = await confirmDeactivate({
        label: location.name,
        count: location.assignment_count,
        href: hrPeopleHref({ org: orgRef, locationId: location.id }),
      });
      if (!proceed) return;
    }
    setBusy(true);
    const result = await upsertHrStructure({
      kind: "location",
      payload: {
        id: location.id,
        organization_id: organizationId,
        is_active: !location.is_active,
      },
    });
    setBusy(false);

    const denial = refusalOf(result, "The server refused this change");
    if (denial) {
      setRefusal(denial);
      return;
    }
    onSaved();
  };

  return (
    <div className="space-y-4 p-3">
      <EditorField
        id={`${uid}-name`}
        label="Name"
        required
        value={name}
        onChange={setName}
        disabled={busy}
        invalid={invalidFor(refusal, "name")}
      />
      <FieldRefusal refusal={refusal} field="name" />
      <EditorField
        id={`${uid}-code`}
        label="Code"
        value={code}
        onChange={setCode}
        disabled={busy}
      />

      <div className="space-y-1.5">
        <Label htmlFor={`${uid}-tz`} className="text-sm font-medium">
          Time zone <span className="text-destructive">*</span>
        </Label>
        <Select value={tz} onValueChange={setTz}>
          <SelectTrigger id={`${uid}-tz`} aria-invalid={invalidFor(refusal, "tz")}>
            <SelectValue placeholder="Choose an IANA time zone" />
          </SelectTrigger>
          <SelectContent>
            {timezoneOptions.map((zone) => (
              <SelectItem key={zone} value={zone}>
                {zone.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldRefusal refusal={refusal} field="tz" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${uid}-jurisdiction`} className="text-sm font-medium">
          Jurisdiction <span className="text-destructive">*</span>
        </Label>
        <Select value={jurisdictionId} onValueChange={setJurisdictionId}>
          <SelectTrigger
            id={`${uid}-jurisdiction`}
            aria-invalid={invalidFor(refusal, "jurisdiction_id")}
          >
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
        <p className="text-sm text-muted-foreground">
          Required. Nothing can be scheduled or stamped against a location without one
          — overtime, breaks, minimum wage and holidays are all read from it.
        </p>
        <FieldRefusal refusal={refusal} field="jurisdiction_id" />
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id={`${uid}-remote`}
          checked={isRemote}
          disabled={busy}
          onCheckedChange={setIsRemote}
        />
        <Label htmlFor={`${uid}-remote`} className="text-sm">
          Remote location
        </Label>
      </div>

      {location ? (
        <div className="flex items-center gap-3">
          <Switch
            id={`${uid}-active`}
            checked={location.is_active}
            disabled={busy}
            onCheckedChange={toggleActive}
          />
          <Label htmlFor={`${uid}-active`} className="text-sm">
            Offered for new assignments
          </Label>
        </div>
      ) : null}

      {refusal ? <RefusalNote refusal={refusal} /> : null}

      <EditorActions
        isCreate={isCreate}
        busy={busy}
        createLabel="Create location"
        onSave={save}
        onCancel={onCancel}
      />
    </div>
  );
}

// ── Job titles ──────────────────────────────────────────────────────────────

function JobTitlesSection({
  jobTitles,
  organizationId,
  orgRef,
  focus,
  onSaved,
}: {
  jobTitles: HrJobTitle[];
  organizationId: string | null;
  orgRef: string | null;
  focus: string | null;
  onSaved: () => void;
}) {
  const [creating, setCreating] = useState(false);

  const columns: MatrxColumnDef<HrJobTitle>[] = [
    {
      id: "title",
      accessorKey: "title",
      header: "Job title",
      cell: (row) => (
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">{row.title}</span>
          {row.job_family ? (
            <span className="block text-xs text-muted-foreground">{row.job_family}</span>
          ) : null}
        </span>
      ),
    },
    {
      id: "eeo1",
      accessorFn: (row) => row.eeo1_job_category ?? "MISSING",
      header: "EEO-1 category",
      filter: "select",
      cell: (row) =>
        row.eeo1_job_category ? (
          <span className="text-sm text-foreground">
            {EEO1_JOB_CATEGORIES.find(
              (category) => category.value === row.eeo1_job_category,
            )?.label ?? row.eeo1_job_category}
          </span>
        ) : (
          <Badge variant="destructive">Not set</Badge>
        ),
    },
    { id: "level", accessorKey: "job_level", header: "Level", mobileHidden: true },
    {
      id: "flsa",
      accessorKey: "default_flsa_status",
      header: "Default FLSA",
      filter: "select",
      mobileHidden: true,
    },
    {
      id: "assignments",
      accessorKey: "assignment_count",
      header: "People",
      cell: (row) => (
        <AssignmentCount
          count={row.assignment_count}
          href={hrPeopleHref({ org: orgRef, jobTitleId: row.id })}
        />
      ),
    },
    {
      id: "active",
      accessorFn: (row) => (row.is_active ? "Active" : "Inactive"),
      header: "Status",
      filter: "select",
      cell: (row) => (
        <Badge variant={row.is_active ? "secondary" : "outline"}>
          {row.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
  ];

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Users className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 space-y-1">
            <h2 className="text-sm font-semibold text-foreground">Job titles</h2>
            <p className="text-sm text-muted-foreground">
              Every title carries an EEO-1 job category, because a title without one
              cannot be reported on.
            </p>
          </div>
        </div>
        <NewRowButton
          label="New job title"
          full
          disabled={creating || !organizationId}
          onClick={() => setCreating(true)}
        />
      </header>

      {/* The edge, stated on the panel */}
      <div className="flex items-start gap-2 border-b border-border px-4 pb-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Changing a title&apos;s EEO-1 category does <span className="font-medium">not</span>{" "}
          rewrite history. Assignments already written keep the category they were
          stamped with, which is what makes a past EEO-1 filing reproducible — the new
          category applies from the next assignment onward.
        </p>
      </div>

      {creating ? (
        <CreatePanel title="New job title">
          <JobTitleEditor
            jobTitle={null}
            organizationId={organizationId}
            orgRef={orgRef}
            onSaved={() => {
              setCreating(false);
              onSaved();
            }}
            onCancel={() => setCreating(false)}
          />
        </CreatePanel>
      ) : null}

      <div className="p-4">
        <MatrxDataTable
          data={jobTitles}
          columns={columns}
          getRowId={(row) => row.id}
          pageSize={25}
          selectedId={focus}
          urlState={{ id: "hr-job-titles" }}
          toolbar={{ search: true, searchPlaceholder: "Search job titles" }}
          emptyState={{
            title: "No job titles yet",
            description:
              "Setup deliberately does not create one, because a made-up title on a real person is worse than none. Add the ones this org actually uses.",
            action: (
              <NewRowButton
                label="New job title"
                disabled={creating || !organizationId}
                onClick={() => setCreating(true)}
              />
            ),
          }}
          detail={{
            title: (row) => row.title,
            render: (row) => (
              <JobTitleEditor
                jobTitle={row}
                organizationId={organizationId}
                orgRef={orgRef}
                onSaved={onSaved}
              />
            ),
          }}
        />
      </div>
    </section>
  );
}

/** `jobTitle === null` is CREATE. The EEO-1 category is required in both modes. */
function JobTitleEditor({
  jobTitle,
  organizationId,
  orgRef,
  onSaved,
  onCancel,
}: {
  jobTitle: HrJobTitle | null;
  organizationId: string | null;
  orgRef: string | null;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const isCreate = jobTitle === null;
  const uid = useId();

  const [title, setTitle] = useState(jobTitle?.title ?? "");
  const [code, setCode] = useState(jobTitle?.code ?? "");
  const [family, setFamily] = useState(jobTitle?.job_family ?? "");
  const [level, setLevel] = useState(jobTitle?.job_level ?? "");
  const [eeo1, setEeo1] = useState(jobTitle?.eeo1_job_category ?? "");
  const [isSupervisor, setIsSupervisor] = useState(jobTitle?.is_supervisor ?? false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<WriteRefusal | null>(null);

  const save = async () => {
    if (!organizationId) return;
    if (title.trim() === "") {
      setRefusal({ message: "A job title needs a title.", field: "title", door: null });
      return;
    }
    // 🚨 `hr.job_title.eeo1_job_category` is NOT NULL and the server refuses with
    // `field: "eeo1_job_category"`. Saying it here names the control immediately.
    if (eeo1.trim() === "") {
      setRefusal({
        message:
          "An EEO-1 job category is required. It is what makes this title reportable, " +
          "and it is stamped onto every assignment written against it — re-mapping it " +
          "later does not rewrite the assignments already made.",
        field: "eeo1_job_category",
        door: null,
      });
      return;
    }
    setBusy(true);
    setRefusal(null);
    const result = await upsertHrStructure({
      kind: "job_title",
      payload: {
        ...(jobTitle ? { id: jobTitle.id } : {}),
        organization_id: organizationId,
        title: title.trim(),
        code: code.trim() || null,
        job_family: family.trim() || null,
        job_level: level.trim() || null,
        eeo1_job_category: eeo1,
        is_supervisor: isSupervisor,
      },
    });
    setBusy(false);

    const denial = refusalOf(result, "The server refused this job title");
    if (denial) {
      setRefusal(denial);
      return;
    }
    toast.success(
      isCreate ? `${title.trim()} is created.` : `${title.trim()} is saved.`,
    );
    onSaved();
  };

  const toggleActive = async () => {
    if (!organizationId || !jobTitle) return;
    if (jobTitle.is_active) {
      const proceed = await confirmDeactivate({
        label: jobTitle.title,
        count: jobTitle.assignment_count,
        href: hrPeopleHref({ org: orgRef, jobTitleId: jobTitle.id }),
      });
      if (!proceed) return;
    }
    setBusy(true);
    const result = await upsertHrStructure({
      kind: "job_title",
      payload: {
        id: jobTitle.id,
        organization_id: organizationId,
        is_active: !jobTitle.is_active,
      },
    });
    setBusy(false);

    const denial = refusalOf(result, "The server refused this change");
    if (denial) {
      setRefusal(denial);
      return;
    }
    onSaved();
  };

  return (
    <div className="space-y-4 p-3">
      <EditorField
        id={`${uid}-title`}
        label="Title"
        required
        value={title}
        onChange={setTitle}
        disabled={busy}
        invalid={invalidFor(refusal, "title")}
      />
      <FieldRefusal refusal={refusal} field="title" />
      <EditorField
        id={`${uid}-code`}
        label="Code"
        value={code}
        onChange={setCode}
        disabled={busy}
      />
      <EditorField
        id={`${uid}-family`}
        label="Job family"
        value={family}
        onChange={setFamily}
        disabled={busy}
      />
      <EditorField
        id={`${uid}-level`}
        label="Level"
        value={level}
        onChange={setLevel}
        disabled={busy}
      />

      <div className="space-y-1.5">
        <Label htmlFor={`${uid}-eeo1`} className="text-sm font-medium">
          EEO-1 job category <span className="text-destructive">*</span>
        </Label>
        <Select value={eeo1} onValueChange={setEeo1}>
          <SelectTrigger
            id={`${uid}-eeo1`}
            aria-invalid={invalidFor(refusal, "eeo1_job_category")}
          >
            <SelectValue placeholder="Choose the EEO-1 category" />
          </SelectTrigger>
          <SelectContent>
            {EEO1_JOB_CATEGORIES.map((category) => (
              <SelectItem key={category.value} value={category.value}>
                {category.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          Fixed by the EEOC — this list is the whole list. It is stamped onto every
          assignment written against this title, and changing it here does not
          re-categorise assignments already written.
        </p>
        <FieldRefusal refusal={refusal} field="eeo1_job_category" />
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id={`${uid}-supervisor`}
          checked={isSupervisor}
          disabled={busy}
          onCheckedChange={setIsSupervisor}
        />
        <Label htmlFor={`${uid}-supervisor`} className="text-sm">
          People in this title supervise others
        </Label>
      </div>

      {jobTitle ? (
        <div className="flex items-center gap-3">
          <Switch
            id={`${uid}-active`}
            checked={jobTitle.is_active}
            disabled={busy}
            onCheckedChange={toggleActive}
          />
          <Label htmlFor={`${uid}-active`} className="text-sm">
            Offered for new assignments
          </Label>
        </div>
      ) : null}

      {refusal ? <RefusalNote refusal={refusal} /> : null}

      <EditorActions
        isCreate={isCreate}
        busy={busy}
        createLabel="Create job title"
        onSave={save}
        onCancel={onCancel}
      />
    </div>
  );
}

// ── One field ───────────────────────────────────────────────────────────────

function EditorField({
  id,
  label,
  value,
  onChange,
  required = false,
  disabled = false,
  invalid = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label} {required ? <span className="text-destructive">*</span> : null}
      </Label>
      <Input
        id={id}
        value={value}
        disabled={disabled}
        aria-invalid={invalid}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function EditorActions({
  isCreate,
  busy,
  createLabel,
  onSave,
  onCancel,
}: {
  isCreate: boolean;
  busy: boolean;
  createLabel: string;
  onSave: () => void;
  onCancel?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        onClick={onSave}
        disabled={busy}
        className="min-h-11 sm:min-h-9"
      >
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : isCreate ? (
          <Plus className="mr-2 h-4 w-4" />
        ) : (
          <Save className="mr-2 h-4 w-4" />
        )}
        {isCreate ? createLabel : "Save"}
      </Button>
      {onCancel ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onCancel}
          disabled={busy}
          className="min-h-11 sm:min-h-9"
        >
          Cancel
        </Button>
      ) : null}
    </div>
  );
}
