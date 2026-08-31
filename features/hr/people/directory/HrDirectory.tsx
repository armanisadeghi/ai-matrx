"use client";

// features/hr/people/directory/HrDirectory.tsx
//
// ROUTE 10 — `/hr/people`. The module's most-opened screen.
//
// THE FIVE THINGS THIS SURFACE GETS RIGHT OR IS WRONG:
//
//  1. ONE QUERY, REAL PAGINATION OVER THE FULL RESULT SET. `hr_directory_list`
//     counts and pages from the same CTE. Nothing here caps a fetch, and nothing
//     says "showing the first 100".
//  2. EMPTY ≠ FILTERED-EMPTY ≠ REFUSED. A real org with zero people gets the
//     first-hire door. A filter that matched nothing states the filters IN WORDS
//     and offers Clear. A refusal renders as a refusal. Three different facts,
//     three different screens — never one grey "No results".
//  3. TABLE ⇄ CARDS IS A PER-USER PREFERENCE, and the platform default is CARDS
//     (Arman's Q2 ruling: a spreadsheet of eleven people is a worse answer than
//     eleven faces). It is `useListViewPrefs`, not a config key, not localStorage.
//  4. CAPABILITY-GATED ACTIONS ARE ABSENT. New employee, bulk actions and Start
//     offboarding are missing entirely for someone who cannot use them.
//  5. CONTRACTORS ARE MARKED QUIETLY, AS A FACT (Arman's Q3 ruling) — one small
//     neutral chip. The marketplace of record shows only inside the Job tab.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Download,
  GraduationCap,
  LayoutGrid,
  Rows3,
  UserPlus,
  Users,
} from "lucide-react";

import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import { ItemContextMenu, ItemMenu } from "@/components/official/item/ItemMenu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal } from "lucide-react";
import { announceComingSoon } from "@/lib/coming-soon/announce";
import { useListViewPrefs } from "@/lib/list-views/useListViewPrefs";
import { cn } from "@/lib/utils";

import { HrError, HrPageState } from "../../shared/HrStates";
import { useHrContext } from "../../shared/useHrContext";
import { useHrPersona } from "../../shared/useHrPersona";
import { fetchHrOrgChart, fetchHrStructure } from "../../service";
import { hrPeopleNewHref } from "../../routes";
import type { HrDirectoryPage, HrDirectoryRow, HrResult } from "../../types";
import { useHrRequest } from "../shared/useHrRequest";
import { HrDirectoryCardGrid } from "./HrDirectoryCards";
import {
  buildHrDirectoryColumns,
  EMPTY_FACET_OPTIONS,
  makeFacetLabelLookup,
  type HrDirectoryFacetOptions,
} from "./directoryColumns";
import { useHrDirectory, useHrDirectoryUrlState } from "./useHrDirectory";
import {
  useHrEmployeeMenu,
  type HrEmployeeMenuSubject,
} from "./useHrEmployeeMenu";
import { OffboardEmployeeDialog } from "./offboarding/OffboardEmployeeDialog";

// ── Server-side facet options ───────────────────────────────────────────────
//
// 🚨 NEVER DERIVED FROM LOADED ROWS. Departments, locations and job titles come
// from `hr_structure_list`; the manager roster comes from `hr_org_chart`, which
// returns every node in one call. A facet list derived from the current page is
// a facet list that changes as you paginate.
//
// Either read may be REFUSED (an employee may not reach the org chart). A refused
// facet source is not an error: the affected column simply has no select filter,
// and the narrowing stays reachable through the doors. It never renders an
// options list that is quietly incomplete.

type FacetRequest = { organizationId: string };

/** Module-level, so the read hook's dependency array holds a stable reference. */
async function runFacets(
  args: FacetRequest,
): Promise<HrResult<{ facets: HrDirectoryFacetOptions; degraded: boolean }>> {
  const [structure, chart] = await Promise.all([
    fetchHrStructure(args.organizationId),
    fetchHrOrgChart({ organizationId: args.organizationId }),
  ]);

  const facets: HrDirectoryFacetOptions = {
    departments: [],
    locations: [],
    jobTitles: [],
    managers: [],
  };

  if (structure.ok) {
    facets.departments = structure.data.departments
      .filter((d) => d.is_active)
      .map((d) => ({ value: d.id, label: d.name }));
    facets.locations = structure.data.locations
      .filter((l) => l.is_active)
      .map((l) => ({ value: l.id, label: l.name }));
    facets.jobTitles = structure.data.job_titles
      .filter((t) => t.is_active)
      .map((t) => ({ value: t.id, label: t.title }));
  }

  if (chart.ok) {
    const byEmployment = new Map(
      chart.data.nodes.map((node) => [node.employment_id, node]),
    );
    const managerIds = new Set(
      chart.data.nodes
        .map((node) => node.manager_employment_id)
        .filter((id): id is string => Boolean(id)),
    );
    /*
      🚨 A MANAGER WHOSE NAME IS WITHHELD IS NOT AN OPTION IN THIS FILTER.
      `display_name` is null when this viewer may not have the name (the chart
      door suppresses it for anyone but HR and the subject), and offering the
      withheld treatment as a pickable option would be worse than a blank label:
      it lets a colleague narrow the directory to one hidden person's reports,
      which turns "who is the hidden manager of these two" into a single click.
      Their reports still appear in the list on their own account — this removes
      an affordance, not a person.
    */
    facets.managers = [...managerIds]
      .map((employmentId) => byEmployment.get(employmentId))
      .filter((node): node is NonNullable<typeof node> => Boolean(node))
      .filter(
        (node): node is typeof node & { display_name: string } =>
          typeof node.display_name === "string" && node.display_name.length > 0,
      )
      .map((node) => ({ value: node.employee_id, label: node.display_name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  // A refused facet source is NOT an error state for the directory — the list
  // still works, with fewer ways to narrow it, and the surface says so.
  return { ok: true, data: { facets, degraded: !structure.ok } };
}

function useHrDirectoryFacets(organizationId: string | null): {
  facets: HrDirectoryFacetOptions;
  degraded: boolean;
} {
  const request =
    organizationId === null
      ? null
      : JSON.stringify({ organizationId } satisfies FacetRequest);

  const state = useHrRequest<
    FacetRequest,
    { facets: HrDirectoryFacetOptions; degraded: boolean }
  >(request, runFacets);

  return {
    facets: state.data?.facets ?? EMPTY_FACET_OPTIONS,
    degraded: state.data?.degraded ?? false,
  };
}

// ── The surface ─────────────────────────────────────────────────────────────

export function HrDirectory() {
  const { active, orgRef } = useHrContext();
  const { persona, can, employeeId, employmentId } = useHrPersona();
  const organizationId = active?.organization_id ?? null;

  // 🚨 THE DOOR PUBLISHES THIS VIEWER'S VOCABULARY, AND THE SURFACE OBEYS IT.
  // `statuses.allowed` is what may be asked for and `statuses.default` is what an
  // unfiltered request returns — two different things, which is why the header's
  // bare "All" could not be left standing for either. Until the first response
  // lands there is no tier and no vocabulary, so the surface offers neither.
  const [vocabulary, setVocabulary] = useState<HrDirectoryPage["statuses"] | null>(
    null,
  );

  const url = useHrDirectoryUrlState(vocabulary?.default);
  const { facets, degraded } = useHrDirectoryFacets(organizationId);
  const directory = useHrDirectory({
    organizationId,
    queryState: url.queryState,
    myTeam: url.myTeam,
    hiredFrom: url.hiredFrom,
    hiredTo: url.hiredTo,
    myEmploymentId: employmentId,
  });

  const wireStatuses = directory.page?.statuses;
  useEffect(() => {
    if (!wireStatuses) return;
    setVocabulary((prior) =>
      prior &&
      prior.allowed.join() === wireStatuses.allowed.join() &&
      prior.default.join() === wireStatuses.default.join()
        ? prior
        : wireStatuses,
    );
  }, [wireStatuses]);

  // STYLE, not query. Persisted per user and synced across devices; the platform
  // default for THIS surface is cards (knob `hr.employees.directory_default_view`,
  // Arman's Q2 ruling). A future org-level override of that knob replaces the
  // `view` in `surfaceDefaults` — the user's own choice still wins over it.
  const { prefs, setView } = useListViewPrefs("hr-people-directory", {
    view: "cards",
    sort: "display_name",
    direction: "asc",
  });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // The offboarding dialog is hosted HERE — the common ancestor of the table and card menus
  // and the only `buildMenu` caller — mirroring how the create dialogs are hosted by their
  // page (RelationsCaseList / VerificationsSurface). "Start offboarding" hands the subject up.
  const [offboarding, setOffboarding] =
    useState<HrEmployeeMenuSubject | null>(null);
  const buildMenu = useHrEmployeeMenu({
    org: orgRef,
    can,
    onStartOffboarding: setOffboarding,
  });

  const canCreate = can("identity.write");
  const canBulk = can("working_record.read") || can("identity.write");

  const page = directory.page;
  const rows: HrDirectoryRow[] = page?.rows ?? [];
  const total = page?.total ?? 0;
  // Every flag defaults to FALSE while the door has not answered. A column that
  // appears before we know whether this viewer may have it is the wrong default in
  // exactly the direction that matters.
  const publishes = page?.columns ?? {
    hire_date: false,
    manager: false,
    worker_class: false,
    employment_detail: false,
  };
  const allowedStatuses = vocabulary?.allowed ?? [];

  const columns = buildHrDirectoryColumns({
    org: orgRef,
    publishes,
    allowedStatuses,
    facets,
  });
  const labelLookup = makeFacetLabelLookup(facets, allowedStatuses);
  const appliedFilters = url.describeFilters(labelLookup);

  const showMyTeamTab = persona === "manager" || can("working_record.read");

  return (
    <>
    <HrPageState
      loading={directory.isLoading}
      error={directory.error?.kind === "failed" ? directory.error : null}
      granted={directory.error?.kind !== "denied"}
      operation="The employee directory"
      variant={prefs.view === "cards" ? "cards" : "table"}
      rows={9}
      noAccessSentence="The people list isn't yours here. Your own record is always yours."
      onRetry={directory.refresh}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
        {/* ── Toolbar row: scope, view toggle, actions ───────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          {showMyTeamTab ? (
            <div
              role="tablist"
              aria-label="Directory scope"
              className="inline-flex items-center rounded-md border border-border p-0.5"
            >
              <ScopeTab
                active={!url.myTeam}
                onClick={() => url.setMyTeam(false)}
                label="Everyone"
              />
              <ScopeTab
                active={url.myTeam}
                onClick={() => url.setMyTeam(true)}
                label="My team"
              />
            </div>
          ) : null}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {directory.isFetching
                ? "Updating…"
                : `${total.toLocaleString()} ${total === 1 ? "person" : "people"}`}
            </span>

            <div
              className="inline-flex items-center rounded-md border border-border p-0.5"
              role="group"
              aria-label="How to show this list"
            >
              <ViewToggleButton
                active={prefs.view === "cards"}
                onClick={() => setView("cards")}
                label="Cards"
                icon={LayoutGrid}
              />
              <ViewToggleButton
                active={prefs.view !== "cards"}
                onClick={() => setView("table")}
                label="Table"
                icon={Rows3}
              />
            </div>

            {canCreate ? (
              <Button asChild size="sm" className="min-h-11 sm:min-h-9">
                <Link href={hrPeopleNewHref({ org: orgRef })}>
                  <UserPlus className="mr-2 h-4 w-4" aria-hidden />
                  New employee
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        {degraded ? (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            This employer&apos;s departments, locations and job titles could not be
            read, so those column filters aren&apos;t offered right now. Everything
            below is the real list.
          </p>
        ) : null}

        {/* ── The three empties, which are three different facts ─────────── */}
        {directory.error?.kind === "denied" ? (
          <HrError
            operation="The employee directory"
            error={directory.error}
            onRetry={directory.refresh}
            nextStep="Your own record is always yours — open My Info from the HR menu."
          />
        ) : rows.length === 0 && url.activeFilterCount > 0 ? (
          <FilteredEmpty filters={appliedFilters} onClear={url.clearAll} />
        ) : rows.length === 0 && total === 0 ? (
          <FirstHireDoor canCreate={canCreate} org={orgRef} />
        ) : prefs.view === "cards" ? (
          <div className="space-y-3">
            <HrDirectoryCardGrid rows={rows} org={orgRef} buildMenu={buildMenu} />
            <CardPager
              page={url.state.page}
              pageSize={url.state.pageSize}
              total={total}
              onPage={(next) =>
                url.onStateChange({ ...url.state, page: next })
              }
            />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <MatrxDataTable<HrDirectoryRow>
              data={rows}
              columns={columns}
              getRowId={(row) => row.employee_id}
              isFetching={directory.isFetching}
              query={{
                mode: "controlled",
                state: url.state,
                totalItems: total,
                onStateChange: url.onStateChange,
              }}
              toolbar={{
                search: true,
                searchPlaceholder: "Search people by name, number or email",
              }}
              selection={
                canBulk
                  ? {
                      selectedIds,
                      onSelectedIdsChange: setSelectedIds,
                      noun: "person",
                      actions: (selected, ids) => (
                        <BulkActions count={ids.length || selected.length} />
                      ),
                    }
                  : undefined
              }
              copy={{
                // Directory tier ONLY. Nothing Confidential is on this table, so
                // nothing Confidential can be copied off it.
                label: "Person",
                listLabel: "People",
                location: "/hr/people",
                rowKind: "hr_directory_row",
                listKind: "hr_directory",
                humanRow: (row) =>
                  [row.display_name, row.job_title, row.department, row.location]
                    .filter(Boolean)
                    .join(" · "),
                // A copy carries what the VIEWER received. `worker_class` is
                // spread in only when the door published it, so a directory-tier
                // copy has no key for it rather than a key holding `undefined`.
                agentRow: (row) => ({
                  employee_id: row.employee_id,
                  display_name: row.display_name,
                  job_title: row.job_title,
                  department: row.department,
                  location: row.location,
                  ...(publishes.worker_class
                    ? { worker_class: row.worker_class }
                    : {}),
                  directory_status: row.directory_status,
                }),
              }}
              rowActions={(row) => (
                <ItemMenu
                  config={() =>
                    buildMenu({
                      employeeId: row.employee_id,
                      displayName: row.display_name,
                      workEmail: row.work_email,
                      employmentId: row.employment_id,
                      status: row.directory_status,
                    })
                  }
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 lg:h-5 lg:w-5"
                    aria-label={`Actions for ${row.display_name}`}
                  >
                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                  </Button>
                </ItemMenu>
              )}
              rowWrapper={(row, children) => (
                <ItemContextMenu
                  sourceFeature="internal"
                  entity={{
                    type: "hr_employee",
                    id: row.employee_id,
                    title: row.display_name,
                  }}
                  config={() =>
                    buildMenu({
                      employeeId: row.employee_id,
                      displayName: row.display_name,
                      workEmail: row.work_email,
                      employmentId: row.employment_id,
                      status: row.directory_status,
                    })
                  }
                >
                  {children}
                </ItemContextMenu>
              )}
              detail={{ enabled: false }}
              window={{ enabled: false }}
              pageSize={url.state.pageSize}
              emptyState={{
                title: "Nobody on this page",
                description:
                  "The list moved under you. Go back to the first page.",
              }}
            />
          </div>
        )}
      </div>
    </HrPageState>
    <OffboardEmployeeDialog
      subject={offboarding}
      onClose={() => setOffboarding(null)}
      onDone={() => {
        setOffboarding(null);
        directory.refresh();
      }}
    />
    </>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function ScopeTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center rounded-sm px-3 text-sm font-medium transition-colors sm:min-h-8",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function ViewToggleButton({
  active,
  onClick,
  label,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: typeof LayoutGrid;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`Show as ${label.toLowerCase()}`}
      title={`Show as ${label.toLowerCase()}`}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors sm:min-h-8",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/**
 * FILTERED-EMPTY. It states the filters IN WORDS and offers Clear. "No results"
 * over a filter the user forgot they set is how a person concludes their
 * colleague was fired.
 */
function FilteredEmpty({
  filters,
  onClear,
}: {
  filters: string[];
  onClear: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
      <h2 className="text-sm font-semibold text-foreground">
        Nobody matches what you asked for
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        This list is currently showing only:
      </p>
      <ul className="mt-2 list-inside list-disc space-y-0.5 text-sm text-foreground">
        {filters.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onClear}
        className="mt-3 min-h-11 sm:min-h-9"
      >
        Clear all filters
      </Button>
    </div>
  );
}

/**
 * THE EMPTY ORG. A real employer with zero people is not "no results" — it is a
 * first-hire door (SPEC-EMPLOYEES §2.2 route 10). Anyone who cannot create gets
 * the same sentence without a control they cannot use.
 */
function FirstHireDoor({
  canCreate,
  org,
}: {
  canCreate: boolean;
  org: string | null;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
      <Users className="h-5 w-5 text-muted-foreground" aria-hidden />
      <h2 className="mt-2 text-sm font-semibold text-foreground">
        Nobody has been added yet
      </h2>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">
        {canCreate
          ? "Add the first person and everything else in HR — the org chart, timesheets, time off, documents — starts working from that record."
          : "Whoever runs HR here adds people. Your own record is always yours."}
      </p>
      {canCreate ? (
        <Button asChild size="sm" className="mt-3 min-h-11 sm:min-h-9">
          <Link href={hrPeopleNewHref({ org })}>
            <UserPlus className="mr-2 h-4 w-4" aria-hidden />
            Add the first person
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Bulk actions. EXPORT IS AUDITED (SPEC-EMPLOYEES §2.2) and there is no
 * `hr_directory_export` door, so an unaudited download is deliberately not
 * shipped — the promise is registered instead. Copy / Copy for AI on the table
 * still carry the directory-tier columns already on screen.
 */
function BulkActions({ count }: { count: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary" className="shrink-0">
        {count} selected
      </Badge>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-h-11 sm:min-h-8"
        onClick={() => void announceComingSoon("hr.people.assign-training")}
      >
        <GraduationCap className="mr-2 h-4 w-4" aria-hidden />
        Assign training
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-h-11 sm:min-h-8"
        onClick={() => void announceComingSoon("hr.people.send-acknowledgment")}
      >
        Send acknowledgment
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-h-11 sm:min-h-8"
        onClick={() => void announceComingSoon("hr.people.directory-export")}
      >
        <Download className="mr-2 h-4 w-4" aria-hidden />
        Export
      </Button>
    </div>
  );
}

/**
 * The card grid pages over the SAME full result set as the table — same query,
 * same total, same offsets. A card view that quietly showed only the first page
 * would be the "showing first 100" defect wearing a nicer layout.
 */
function CardPager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (lastPage <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
      <span className="text-xs text-muted-foreground">
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 sm:min-h-8"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </Button>
        <span className="text-xs text-muted-foreground">
          Page {page} of {lastPage}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 sm:min-h-8"
          disabled={page >= lastPage}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

