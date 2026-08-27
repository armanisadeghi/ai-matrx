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

"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Info, ListTree, Loader2, MapPin, Save, Users } from "lucide-react";

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
import type { HrDepartment, HrJobTitle, HrLocation } from "../../types";
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
      <header className="flex items-start gap-3 border-b border-border p-4">
        <ListTree className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-1">
          <h2 className="text-sm font-semibold text-foreground">Departments</h2>
          <p className="text-sm text-muted-foreground">
            Departments nest. A department can never be placed under one of its own
            descendants — the picker does not offer them.
          </p>
        </div>
      </header>
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
            description: "Setup creates the first one; add the rest as the org grows.",
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

function DepartmentEditor({
  department,
  departments,
  organizationId,
  orgRef,
  onSaved,
}: {
  department: HrDepartment;
  departments: HrDepartment[];
  organizationId: string | null;
  orgRef: string | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState(department.name);
  const [code, setCode] = useState(department.code ?? "");
  const [costCenter, setCostCenter] = useState(department.cost_center ?? "");
  const [parentId, setParentId] = useState(department.parent_department_id ?? "");
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);

  // 🚨 THE CYCLE CHECK, MADE UNREPRESENTABLE: this department and everything under
  // it are simply not in the list.
  const blocked = descendantsOf(departments, department.id);
  const parentOptions = departments.filter((candidate) => !blocked.has(candidate.id));

  const save = async () => {
    if (!organizationId) return;
    if (name.trim() === "") {
      setWhy("A department needs a name.");
      return;
    }
    setBusy(true);
    setWhy(null);
    const result = await upsertHrStructure({
      kind: "department",
      payload: {
        id: department.id,
        organization_id: organizationId,
        name: name.trim(),
        code: code.trim() || null,
        cost_center: costCenter.trim() || null,
        parent_department_id: parentId || null,
      },
    });
    setBusy(false);
    if (!result.ok) {
      setWhy(
        isHrDenied(result)
          ? result.detail || `The server refused this change (${result.reason}).`
          : result.message,
      );
      return;
    }
    toast.success(`${name.trim()} is saved.`);
    onSaved();
  };

  const toggleActive = async () => {
    if (!organizationId) return;
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
    if (!result.ok) {
      setWhy(
        isHrDenied(result)
          ? result.detail || `The server refused this change (${result.reason}).`
          : result.message,
      );
      return;
    }
    onSaved();
  };

  return (
    <div className="space-y-4 p-3">
      <EditorField id="dept-name" label="Name" value={name} onChange={setName} />
      <EditorField id="dept-code" label="Code" value={code} onChange={setCode} />
      <EditorField
        id="dept-cc"
        label="Cost centre"
        value={costCenter}
        onChange={setCostCenter}
      />
      <div className="space-y-1.5">
        <Label htmlFor="dept-parent" className="text-sm font-medium">
          Reports into
        </Label>
        <Select value={parentId} onValueChange={setParentId}>
          <SelectTrigger id="dept-parent">
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
          This department and everything beneath it are not offered — a department
          cannot report into itself.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="dept-active"
          checked={department.is_active}
          disabled={busy}
          onCheckedChange={toggleActive}
        />
        <Label htmlFor="dept-active" className="text-sm">
          Offered for new assignments
        </Label>
      </div>

      {why ? (
        <p role="alert" className="text-sm text-destructive">
          {why}
        </p>
      ) : null}

      <Button
        type="button"
        size="sm"
        onClick={save}
        disabled={busy}
        className="min-h-11 sm:min-h-9"
      >
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Save className="mr-2 h-4 w-4" />
        )}
        Save
      </Button>
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
      <header className="flex items-start gap-3 border-b border-border p-4">
        <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-1">
          <h2 className="text-sm font-semibold text-foreground">Locations</h2>
          <p className="text-sm text-muted-foreground">
            Every location carries a time zone and a jurisdiction. Both are required,
            because every punch, shift and workweek is stamped from them.
          </p>
        </div>
      </header>
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
              "Setup creates the first one. Nothing can be scheduled or stamped until at least one exists.",
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

function LocationEditor({
  location,
  jurisdictions,
  organizationId,
  orgRef,
  onSaved,
}: {
  location: HrLocation;
  jurisdictions: HrJurisdiction[];
  organizationId: string | null;
  orgRef: string | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState(location.name);
  const [code, setCode] = useState(location.code ?? "");
  const [tz, setTz] = useState(location.tz ?? "");
  const [jurisdictionId, setJurisdictionId] = useState(location.jurisdiction_id ?? "");
  const [isRemote, setIsRemote] = useState(location.is_remote);
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);

  const timezoneOptions = COMMON_TIMEZONES.includes(tz)
    ? COMMON_TIMEZONES
    : tz
      ? [tz, ...COMMON_TIMEZONES]
      : COMMON_TIMEZONES;

  const save = async () => {
    if (!organizationId) return;
    if (name.trim() === "") {
      setWhy("A location needs a name.");
      return;
    }
    if (tz.trim() === "") {
      setWhy(
        "A location needs an IANA time zone. Every punch and shift at this location is " +
          "stamped in it, and without one hours land on the wrong day.",
      );
      return;
    }
    // 🚨 THE REFUSAL WITH ITS REASON, AT THE CONTROL, BEFORE THE SAVE.
    if (jurisdictionId.trim() === "") {
      setWhy(
        "A location cannot be saved without a jurisdiction. Nothing can be scheduled " +
          "or stamped against it: overtime, breaks, minimum wage and holidays are all " +
          "read from the jurisdiction, and a location without one silently produces " +
          "unlawful results.",
      );
      return;
    }

    setBusy(true);
    setWhy(null);
    const result = await upsertHrStructure({
      kind: "location",
      payload: {
        id: location.id,
        organization_id: organizationId,
        name: name.trim(),
        code: code.trim() || null,
        tz: tz.trim(),
        jurisdiction_id: jurisdictionId,
        is_remote: isRemote,
      },
    });
    setBusy(false);
    if (!result.ok) {
      setWhy(
        isHrDenied(result)
          ? result.detail || `The server refused this change (${result.reason}).`
          : result.message,
      );
      return;
    }
    toast.success(`${name.trim()} is saved.`);
    onSaved();
  };

  const toggleActive = async () => {
    if (!organizationId) return;
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
    if (!result.ok) {
      setWhy(
        isHrDenied(result)
          ? result.detail || `The server refused this change (${result.reason}).`
          : result.message,
      );
      return;
    }
    onSaved();
  };

  return (
    <div className="space-y-4 p-3">
      <EditorField id="loc-name" label="Name" value={name} onChange={setName} />
      <EditorField id="loc-code" label="Code" value={code} onChange={setCode} />

      <div className="space-y-1.5">
        <Label htmlFor="loc-tz" className="text-sm font-medium">
          Time zone <span className="text-destructive">*</span>
        </Label>
        <Select value={tz} onValueChange={setTz}>
          <SelectTrigger id="loc-tz">
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
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="loc-jurisdiction" className="text-sm font-medium">
          Jurisdiction <span className="text-destructive">*</span>
        </Label>
        <Select value={jurisdictionId} onValueChange={setJurisdictionId}>
          <SelectTrigger id="loc-jurisdiction">
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
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="loc-remote"
          checked={isRemote}
          disabled={busy}
          onCheckedChange={setIsRemote}
        />
        <Label htmlFor="loc-remote" className="text-sm">
          Remote location
        </Label>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="loc-active"
          checked={location.is_active}
          disabled={busy}
          onCheckedChange={toggleActive}
        />
        <Label htmlFor="loc-active" className="text-sm">
          Offered for new assignments
        </Label>
      </div>

      {why ? (
        <p role="alert" className="text-sm text-destructive">
          {why}
        </p>
      ) : null}

      <Button
        type="button"
        size="sm"
        onClick={save}
        disabled={busy}
        className="min-h-11 sm:min-h-9"
      >
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Save className="mr-2 h-4 w-4" />
        )}
        Save
      </Button>
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
      <header className="flex items-start gap-3 border-b border-border p-4">
        <Users className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-1">
          <h2 className="text-sm font-semibold text-foreground">Job titles</h2>
          <p className="text-sm text-muted-foreground">
            Every title carries an EEO-1 job category, because a title without one
            cannot be reported on.
          </p>
        </div>
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
              "Titles can be added at any time — setup deliberately does not create one, because a made-up title on a real person is worse than none.",
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

function JobTitleEditor({
  jobTitle,
  organizationId,
  orgRef,
  onSaved,
}: {
  jobTitle: HrJobTitle;
  organizationId: string | null;
  orgRef: string | null;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(jobTitle.title);
  const [code, setCode] = useState(jobTitle.code ?? "");
  const [family, setFamily] = useState(jobTitle.job_family ?? "");
  const [level, setLevel] = useState(jobTitle.job_level ?? "");
  const [eeo1, setEeo1] = useState(jobTitle.eeo1_job_category ?? "");
  const [isSupervisor, setIsSupervisor] = useState(jobTitle.is_supervisor);
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);

  const save = async () => {
    if (!organizationId) return;
    if (title.trim() === "") {
      setWhy("A job title needs a title.");
      return;
    }
    if (eeo1.trim() === "") {
      setWhy(
        "An EEO-1 job category is required. It is what makes this title reportable, " +
          "and it is stamped onto every assignment written against it.",
      );
      return;
    }
    setBusy(true);
    setWhy(null);
    const result = await upsertHrStructure({
      kind: "job_title",
      payload: {
        id: jobTitle.id,
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
    if (!result.ok) {
      setWhy(
        isHrDenied(result)
          ? result.detail || `The server refused this change (${result.reason}).`
          : result.message,
      );
      return;
    }
    toast.success(`${title.trim()} is saved.`);
    onSaved();
  };

  const toggleActive = async () => {
    if (!organizationId) return;
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
    if (!result.ok) {
      setWhy(
        isHrDenied(result)
          ? result.detail || `The server refused this change (${result.reason}).`
          : result.message,
      );
      return;
    }
    onSaved();
  };

  return (
    <div className="space-y-4 p-3">
      <EditorField id="title-name" label="Title" value={title} onChange={setTitle} />
      <EditorField id="title-code" label="Code" value={code} onChange={setCode} />
      <EditorField id="title-family" label="Job family" value={family} onChange={setFamily} />
      <EditorField id="title-level" label="Level" value={level} onChange={setLevel} />

      <div className="space-y-1.5">
        <Label htmlFor="title-eeo1" className="text-sm font-medium">
          EEO-1 job category <span className="text-destructive">*</span>
        </Label>
        <Select value={eeo1} onValueChange={setEeo1}>
          <SelectTrigger id="title-eeo1">
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
          Fixed by the EEOC — these ten are the whole list. Changing it here does not
          re-categorise assignments already written.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="title-supervisor"
          checked={isSupervisor}
          disabled={busy}
          onCheckedChange={setIsSupervisor}
        />
        <Label htmlFor="title-supervisor" className="text-sm">
          People in this title supervise others
        </Label>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="title-active"
          checked={jobTitle.is_active}
          disabled={busy}
          onCheckedChange={toggleActive}
        />
        <Label htmlFor="title-active" className="text-sm">
          Offered for new assignments
        </Label>
      </div>

      {why ? (
        <p role="alert" className="text-sm text-destructive">
          {why}
        </p>
      ) : null}

      <Button
        type="button"
        size="sm"
        onClick={save}
        disabled={busy}
        className="min-h-11 sm:min-h-9"
      >
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Save className="mr-2 h-4 w-4" />
        )}
        Save
      </Button>
    </div>
  );
}

// ── One field ───────────────────────────────────────────────────────────────

function EditorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
