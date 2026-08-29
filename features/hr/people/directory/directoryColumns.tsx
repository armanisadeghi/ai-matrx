"use client";

// features/hr/people/directory/directoryColumns.tsx
//
// Route 10's columns. Default set from SPEC-UI-IA §5.1: name (door) · job title ·
// department · location · manager (door) · worker class · status · start date.
//
// 🚨 EVERY OPTIONAL COLUMN IS PUBLISHED BY THE DOOR, NOT BY THIS FILE.
// `page.columns` carries `{hire_date, manager, worker_class, employment_detail}`;
// `false` means the column is ABSENT from the table — not rendered empty, not
// rendered greyed. §4.2 applies to columns exactly as it applies to fields, and a
// column of blanks announces that the data exists and that this viewer is not
// getting it.
//
// 🚨 AND THE GATING HERE IS NOT THE SECURITY BOUNDARY — `hr_l1_65` IS. The door
// REMOVES the working-record keys from a directory-tier viewer's payload; this file
// exists so nothing renders a header over data that is no longer on the wire.
// Hiding a column client-side cannot unsend a payload, so if these flags and the
// door ever disagree, the door is right and this file is the bug.
//
// 🚨 STATUS OPTIONS COME FROM `page.statuses.allowed`, NEVER FROM THE FOUR
// CONSTANTS. Offering `prehire` to a viewer whose door refuses it produces a
// filter that returns a refusal — and the option itself discloses that a category
// of people exists which this viewer is not allowed to see.
//
// 🚨 FILTER OPTIONS ARE SERVER-SIDE, NEVER DERIVED FROM LOADED ROWS. Departments,
// locations and job titles come from `hr_structure_list`; manager options come
// from `hr_org_chart`, which returns every node in one call. Deriving "which
// departments exist" from the current page would make the facet list a function
// of the page you are on — the exact defect `lib/entity-list` was built to end.

import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";

import { hrPeopleHref, hrStructureFocusHref, type HrOrgRef } from "../../routes";
import {
  HrRowBasisNote,
  HrStatusChip,
  formatFullDate,
} from "../shared/HrStatusChip";
import { HrWorkerClassChip, hrWorkerClassLabel } from "../shared/HrWorkerClassChip";
import { HrPersonDoor, HrStructureDoor } from "../doors/HrPersonDoor";
import type { HrDirectoryRow } from "../../types";
import {
  HR_DIRECTORY_STATUSES,
  HR_WORKER_CLASSES,
  type HrDirectoryStatus,
} from "../../constants";

export type HrDirectoryFacetOptions = {
  departments: { value: string; label: string }[];
  locations: { value: string; label: string }[];
  jobTitles: { value: string; label: string }[];
  /** Empty when the org chart is not reachable for this viewer — see below. */
  managers: { value: string; label: string }[];
};

export const EMPTY_FACET_OPTIONS: HrDirectoryFacetOptions = {
  departments: [],
  locations: [],
  jobTitles: [],
  managers: [],
};

const STATUS_LABEL: Record<HrDirectoryStatus, string> = {
  prehire: "Not started yet",
  active: "Active",
  on_leave: "On leave",
  terminated: "Former",
};

/**
 * The status facet for one viewer.
 *
 * 🚨 `ALL_STATUSES_OPTION` IS WHY THIS IS A FUNCTION AND NOT A CONSTANT. The shared
 * header filter renders its own "All" item that CLEARS the filter — and a cleared
 * status filter is route 10's DEFAULT view, which withholds former employees. So
 * "All" was a label promising twenty people and delivering seventeen. The cleared
 * state now writes `?status=all`, this explicit option is what shows as selected,
 * and the door resolves `all` to every status the viewer may see. A viewer who may
 * not see `terminated` gets a two-status `allowed` list and an All that is honestly
 * all of it.
 */
export const ALL_STATUSES_OPTION = { value: "all", label: "All statuses" };

export function hrStatusOptions(
  allowed: readonly HrDirectoryStatus[],
): { value: string; label: string }[] {
  const inVocabularyOrder = HR_DIRECTORY_STATUSES.filter((s) =>
    allowed.includes(s),
  );
  return [
    ALL_STATUSES_OPTION,
    ...inVocabularyOrder.map((value) => ({
      value,
      label: STATUS_LABEL[value],
    })),
  ];
}

const WORKER_CLASS_OPTIONS = HR_WORKER_CLASSES.map((value) => ({
  value,
  label: hrWorkerClassLabel(value) ?? value,
}));

/** What THIS viewer's directory publishes — the org's knobs and their tier, folded. */
export type HrDirectoryPublishes = {
  hire_date: boolean;
  manager: boolean;
  worker_class: boolean;
  employment_detail: boolean;
};

export function buildHrDirectoryColumns(args: {
  org: HrOrgRef;
  /** `page.columns` — what the door publishes to THIS viewer. */
  publishes: HrDirectoryPublishes;
  /** `page.statuses.allowed` — the only statuses this viewer may ask for. */
  allowedStatuses: readonly HrDirectoryStatus[];
  facets: HrDirectoryFacetOptions;
}): MatrxColumnDef<HrDirectoryRow>[] {
  const { org, publishes, allowedStatuses, facets } = args;
  const statusOptions = hrStatusOptions(allowedStatuses);

  const columns: MatrxColumnDef<HrDirectoryRow>[] = [
    {
      id: "display_name",
      accessorKey: "display_name",
      header: "Name",
      // Server-side search covers the name; a client text filter on one page
      // would contradict the count sitting under it.
      filter: false,
      // The peek card is handed the SAME tiered row: a field the door withheld is
      // `undefined` here and the card's own chips render nothing for it. Nothing is
      // re-derived, and nothing is substituted with a placeholder.
      cell: (row) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <HrPersonDoor
            person={{
              employeeId: row.employee_id,
              displayName: row.display_name,
              jobTitle: row.job_title,
              department: row.department,
              location: row.location,
              managerName: row.manager_name,
              managerEmployeeId: row.manager_employee_id,
              workerClass: row.worker_class,
              status: row.directory_status,
              employeeNumber: row.employee_number,
              workEmail: row.work_email,
              rowBasis: row.row_basis,
              hireDate: row.hire_date,
            }}
            org={org}
          />
          <HrRowBasisNote rowBasis={row.row_basis} hireDate={row.hire_date} />
        </div>
      ),
    },
    {
      id: "job_title",
      accessorKey: "job_title",
      header: "Job title",
      filter: facets.jobTitles.length > 0 ? "select" : false,
      filterOptions: facets.jobTitles,
      cell: (row) => (
        <HrStructureDoor
          id={row.job_title_id}
          label={row.job_title}
          href={hrStructureFocusHref(row.job_title_id ?? "", org)}
        />
      ),
    },
    {
      id: "department",
      accessorKey: "department",
      header: "Department",
      filter: facets.departments.length > 0 ? "select" : false,
      filterOptions: facets.departments,
      cell: (row) => (
        <HrStructureDoor
          id={row.department_id}
          label={row.department}
          href={hrStructureFocusHref(row.department_id ?? "", org)}
        />
      ),
    },
    {
      id: "location",
      accessorKey: "location",
      header: "Location",
      filter: facets.locations.length > 0 ? "select" : false,
      filterOptions: facets.locations,
      cell: (row) => (
        <HrStructureDoor
          id={row.location_id}
          label={row.location}
          href={hrStructureFocusHref(row.location_id ?? "", org)}
        />
      ),
    },
  ];

  // THE ORG PUBLISHES THIS COLUMN, OR IT IS NOT HERE.
  if (publishes.manager) {
    columns.push({
      id: "manager_name",
      accessorKey: "manager_name",
      header: "Manager",
      // The server filters on `manager_employee_id`, so the options must be
      // ids. When the org chart is not reachable there is no complete manager
      // roster to offer, and an incomplete one is worse than none — the
      // narrowing stays available through the "reports to" door and My team.
      filter: facets.managers.length > 0 ? "select" : false,
      filterOptions: facets.managers,
      accessorFn: (row) => row.manager_employee_id ?? "",
      cell: (row) =>
        row.manager_employee_id && row.manager_name ? (
          <HrPersonDoor
            person={{
              employeeId: row.manager_employee_id,
              displayName: row.manager_name,
            }}
            org={org}
            tab="job"
            showControls={false}
          />
        ) : null,
      mobileHidden: true,
    });
  }

  // WORKER CLASS IS A WORKING-RECORD FACT (`hr.position_assignment`), so it is
  // absent — column AND server-side filter — for a directory-tier viewer. Leaving
  // the filter behind would be worse than leaving the column: the door refuses it,
  // and offering it would let somebody probe one person at a time for the answer
  // the column no longer gives.
  if (publishes.worker_class) {
    columns.push({
      id: "worker_class",
      accessorKey: "worker_class",
      header: "Worker class",
      filter: "select",
      filterOptions: WORKER_CLASS_OPTIONS,
      // The chip renders nothing for `employee` — the default class needs no
      // annotation (Arman's Q3 ruling). The cell is therefore deliberately
      // empty for most rows rather than repeating "Employee" 400 times.
      cell: (row) => <HrWorkerClassChip workerClass={row.worker_class} />,
      width: 130,
    });
  }

  columns.push({
    id: "directory_status",
    accessorKey: "directory_status",
    header: "Status",
    filter: "select",
    filterOptions: statusOptions,
    cell: (row) => <HrStatusChip status={row.directory_status} />,
    width: 130,
  });

  if (publishes.hire_date) {
    columns.push({
      id: "hire_date",
      accessorKey: "hire_date",
      header: "Start date",
      filter: false,
      cell: (row) => (
        <span className="whitespace-nowrap text-sm text-foreground">
          {formatFullDate(row.hire_date)}
        </span>
      ),
      mobileHidden: true,
    });
  }

  columns.push(
    {
      id: "employee_number",
      accessorKey: "employee_number",
      header: "Employee #",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.employee_number ?? ""}
        </span>
      ),
      mobileHidden: true,
    },
    {
      id: "work_email",
      accessorKey: "work_email",
      header: "Work email",
      filter: "text",
      cell: (row) =>
        row.work_email ? (
          <a
            href={`mailto:${row.work_email}`}
            className="text-sm text-foreground underline-offset-2 hover:text-primary hover:underline"
          >
            {row.work_email}
          </a>
        ) : null,
      mobileHidden: true,
    },
  );

  return columns;
}

/** The label lookup the filtered-empty sentence uses to say words, not uuids. */
export function makeFacetLabelLookup(
  facets: HrDirectoryFacetOptions,
  allowedStatuses: readonly HrDirectoryStatus[] = HR_DIRECTORY_STATUSES,
) {
  const byColumn: Record<string, { value: string; label: string }[]> = {
    department: facets.departments,
    location: facets.locations,
    job_title: facets.jobTitles,
    manager_name: facets.managers,
    directory_status: hrStatusOptions(allowedStatuses),
    worker_class: WORKER_CLASS_OPTIONS,
  };
  return (columnId: string, value: string): string | null =>
    byColumn[columnId]?.find((option) => option.value === value)?.label ?? null;
}

/** The door a filtered directory becomes when somebody shares it. */
export function hrManagerScopeHref(managerEmployeeId: string, org: HrOrgRef) {
  return hrPeopleHref({ org, managerEmployeeId });
}
