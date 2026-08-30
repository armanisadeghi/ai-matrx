// features/hr/people/relations/components/RelationsCaseList.tsx
//
// ROUTE 15 — the employee-relations case list (SPEC-EMPLOYEES §2.2).
//
// 🚨 NO-ACCESS HERE IS THE STRONGEST INSTANCE OF THE SENSITIVITY RULE. The nav
// item and the ROUTE are ABSENT. Not a permission wall, not an empty list, not
// a "request access" door. Managers, employees and org owner/admins get
// nothing — `restricted` has no org lane. The nav side is `resolveHrNav`; this
// file owns the page side, and it renders `HrNoAccess`, which never leaks that
// a record exists.
//
// 🚨 EXPORT IS ABSENT ON THIS ROUTE IN V1. An aggregated relations export is a
// stage-two item, and a CSV of complaints is exactly the artifact that should
// not exist by accident. Do not add `copy`, do not add `selection` with a bulk
// export, do not "just" enable the table's export affordance. The table's own
// copy controls are switched off below for the same reason.
//
// 🚨 THE TOTAL CHANGES WITH THE VIEWER AND THAT IS CORRECT.
// `hr.incident_excluded()` runs per row on the server, after every allow lane,
// and overrides `incident.read`, `hr_owner` AND break-glass. An excluded row is
// not in the rows and its count is not in the total. NEVER cache this list
// under a viewer-independent key to "stabilise" the number — that cache is the
// leak the veto exists to prevent.

"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Gavel, Lock, MessageSquareQuote, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import MatrxDataTable from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { hrRelationsCaseHref } from "@/features/hr/routes";
import { HrPageState } from "@/features/hr/shared/HrStates";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import { useHrPersona } from "@/features/hr/shared/useHrPersona";

import { useHrRelationsCases } from "../hooks/useRelationsCases";
import type { HrRelationsFilter } from "../service";
import {
  HR_INCIDENT_STATES,
  HR_INCIDENT_STATE_LABELS,
  HR_INCIDENT_STATE_TOKEN,
  type HrRelationsCase,
} from "../types";
import { NewCorrectiveActionDialog } from "./NewCorrectiveActionDialog";
import { NewIncidentDialog } from "./NewIncidentDialog";
import { formatHrDay as formatDay } from "@/features/hr/people/shared/HrStatusChip";


export function RelationsCaseList() {
  const { orgRef } = useHrContext();
  const { can } = useHrPersona();
  const [filter, setFilter] = useState<HrRelationsFilter>({});
  const [newAction, setNewAction] = useState<"coaching" | "formal" | null>(null);
  const [newIncident, setNewIncident] = useState(false);

  const { list, isLoading, error, refresh } = useHrRelationsCases(filter);

  const canIssue = can("corrective_action.issue");
  const canReport = can("incident.read") || can("incident.investigate");

  const columns: MatrxColumnDef<HrRelationsCase>[] = [
    {
      id: "kind",
      accessorFn: (row) => row.kindLabel,
      header: "Kind",
      filter: "select",
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-2">
          {row.caseKind === "incident" ? (
            <MessageSquareQuote className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <Gavel className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          {/* A voided record STAYS ON THE LIST, struck through. Removing it
              from the queue would be the deletion the void exists instead of. */}
          <Link
            href={hrRelationsCaseHref(row.id, orgRef, row.caseKind)}
            className={`truncate text-sm font-medium underline-offset-2 hover:underline ${
              row.voided
                ? "text-muted-foreground line-through"
                : "text-foreground"
            }`}
            title={row.voided ? (row.voidReason ?? "Set aside") : undefined}
          >
            {row.kindLabel}
          </Link>
          {row.voided ? (
            <Badge variant="outline" className="shrink-0 text-xs">
              Set aside
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      id: "case_kind",
      accessorFn: (row) =>
        row.caseKind === "incident" ? "Incident" : "Corrective action",
      header: "Record",
      filter: "select",
      filterSingle: true,
    },
    {
      id: "state",
      accessorFn: (row) => row.stateLabel,
      header: "State",
      filter: "select",
      cell: (row) => (
        <Badge variant="outline" className="text-xs">
          {row.stateLabel}
        </Badge>
      ),
    },
    {
      id: "subject",
      accessorFn: (row) => row.subjectName ?? "",
      header: "Subject",
      filter: "auto",
      // Deliberately NOT an EntityRef door: opening the subject's profile from
      // a complaint list is a different, separately-audited read. The case is
      // the door; the person is reached from inside it.
      cell: (row) =>
        row.subjectName ? (
          <span className="truncate text-sm">{row.subjectName}</span>
        ) : null,
    },
    {
      id: "assignee",
      accessorFn: (row) => row.assigneeName ?? "",
      header: "Assigned to",
      filter: "auto",
    },
    {
      id: "occurred",
      accessorFn: (row) => row.occurredOn ?? "",
      header: "Date",
      filter: "auto",
      cell: (row) => (
        <span className="whitespace-nowrap text-sm tabular-nums">
          {formatDay(row.occurredOn)}
        </span>
      ),
    },
    {
      id: "osha",
      accessorFn: (row) =>
        row.oshaRecordable === null
          ? ""
          : row.oshaRecordable
            ? "Recordable"
            : "Not recordable",
      header: "OSHA",
      filter: "select",
      cell: (row) =>
        row.oshaRecordable ? (
          <Badge variant="secondary" className="gap-1 text-xs">
            <AlertTriangle className="h-3 w-3" />
            Recordable
          </Badge>
        ) : null,
    },
    {
      id: "hold",
      accessorFn: (row) => (row.underLegalHold ? "On hold" : ""),
      header: "Legal hold",
      filter: "select",
      cell: (row) =>
        row.underLegalHold ? (
          <Badge variant="outline" className="gap-1 text-xs">
            <Lock className="h-3 w-3" />
            On hold
          </Badge>
        ) : null,
    },
  ];

  return (
    <HrPageState
      loading={isLoading}
      error={error && error.kind === "failed" ? error : null}
      granted={error?.kind === "denied" ? false : undefined}
      operation="Employee relations"
      variant="table"
      onRetry={refresh}
      noAccessSentence="This part of HR isn't yours here."
    >
      <div className="flex h-full min-h-0 flex-col gap-3 p-4 sm:p-6">
        {list?.partial ? (
          // 🚨 THIS BANNER ONCE MADE A COMPLETENESS CLAIM OVER A DOOR THAT HAD
          // REFUSED. Verified on production v0.4.1474: the corrective-action side
          // was 400ing (wrong-tier token), the failure was swallowed into
          // log_client_error, `partial` went true, and the surface printed
          // "Nothing is hidden inside what you can see." above a list of two
          // incidents while two corrective actions for that same admin sat
          // unlisted. The sentence was FALSE and the reader had no way to know.
          //
          // Two things changed. The seam is fixed (see relations/service.ts), so
          // a partial list is now only ever a real access split — hr_admin holds
          // corrective actions but NOT incidents, SPEC-ACCESS §3.2. And the
          // banner NAMES WHICH SIDE it is showing instead of gesturing at "one of
          // the two", because a person cannot check a claim they cannot read.
          // It no longer promises anything about what it cannot see.
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            You hold{" "}
            {list.correctiveActionsGranted ? "corrective actions" : "incidents"}{" "}
            here, not{" "}
            {list.correctiveActionsGranted ? "incidents" : "corrective actions"},
            so that is what this list shows.
          </p>
        ) : null}

        <MatrxDataTable<HrRelationsCase>
          data={list?.cases ?? []}
          columns={columns}
          getRowId={(row) => `${row.caseKind}:${row.id}`}
          isLoading={isLoading}
          pageSize={25}
          onRowOpen={undefined}
          // No `copy`, no `selection`, no export. See the file header.
          toolbar={{
            search: true,
            searchPlaceholder: "Search cases",
            facets: [
              {
                id: "case_kind",
                type: "button-group",
                label: "Record",
                value: filter.caseKind ?? "all",
                options: [
                  { value: "all", label: "All" },
                  { value: "incident", label: "Incidents" },
                  { value: "corrective_action", label: "Corrective actions" },
                ],
                onChange: (value) =>
                  setFilter((f) => ({
                    ...f,
                    caseKind:
                      value === "all"
                        ? null
                        : (value as HrRelationsFilter["caseKind"]),
                    // The other half of the pairing above: a state has no
                    // meaning off the incident side, and leaving one set while
                    // the user moves to corrective actions (or back to All)
                    // sends it to the door that raises 42703 on it.
                    state: value === "incident" ? f.state : null,
                  })),
              },
              {
                id: "state",
                type: "button-group",
                // Named for what it actually filters. See the block below: a
                // state question only has an answer on the incident side.
                label: "Incident state",
                value: filter.state ?? "all",
                // 🚨 THIS CONTROL ASKED THE DOOR TWO QUESTIONS IT CANNOT ANSWER.
                // Both probed live against `hr_relations_list` on 2026-08-29:
                //
                //  1. EVERY CORRECTIVE-ACTION STATE RAISED. `hr._door_list`'s
                //     allowlist names `state` for `hr_corrective_action`, and
                //     that table HAS NO `state` COLUMN — the filter went
                //     straight into SQL and came back **42703 `column "state"
                //     does not exist`**, swallowed by the transport into a
                //     toast. Those choices are ABSENT until the door can serve
                //     them; a corrective action's state is DERIVED from
                //     `outcome` / `employee_acknowledgement_kind` /
                //     `employee_acknowledged_at` (see `correctiveActionState`)
                //     and only the server can filter on a derivation. Offering
                //     a button that 400s is worse than not offering it.
                //
                //  2. THE INCIDENT STATES WERE SPELLED THE UI's WAY, NOT THE
                //     COLUMN'S. `hr.incident.state` holds `intake` and
                //     `action_pending`; this sent `open` and `action-pending`.
                //     Filtering by **Open** — the first choice on the control —
                //     returned **0 of 9 real open incidents**, `granted: true`,
                //     rendered as "nothing here". `HR_INCIDENT_STATE_TOKEN` is
                //     the translation and it existed the whole time.
                //
                // And the labels are words now, not raw enum values: this list
                // used to print `action-pending` and `outcome-recorded` at a
                // person.
                options: [
                  { value: "all", label: "All" },
                  ...HR_INCIDENT_STATES.map((s) => ({
                    value: HR_INCIDENT_STATE_TOKEN[s],
                    label: HR_INCIDENT_STATE_LABELS[s],
                  })),
                ],
                // 🚨 A STATE ALSO PINS THE RECORD KIND, AND IT HAS TO.
                // `hr_relations_list` asks BOTH doors with the SAME filter, so
                // any `state` at all reaches the corrective-action side and
                // raises 42703 there — which is why this control could never
                // work while "All records" was selected, whatever it sent. It
                // is not magic and it is not hidden: the Record filter visibly
                // snaps to Incidents, and clearing the state clears nothing
                // else. The alternative is a control that always errors.
                onChange: (value) =>
                  setFilter((f) => ({
                    ...f,
                    state: value === "all" ? null : value,
                    caseKind: value === "all" ? f.caseKind : "incident",
                  })),
              },
              {
                id: "osha",
                type: "button-group",
                label: "OSHA",
                value:
                  filter.oshaRecordable === true
                    ? "yes"
                    : filter.oshaRecordable === false
                      ? "no"
                      : "all",
                options: [
                  { value: "all", label: "All" },
                  { value: "yes", label: "Recordable" },
                  { value: "no", label: "Not recordable" },
                ],
                onChange: (value) =>
                  setFilter((f) => ({
                    ...f,
                    oshaRecordable:
                      value === "all" ? null : value === "yes",
                  })),
              },
            ],
            actions: (
              <div className="flex flex-wrap items-center gap-2">
                {canIssue ? (
                  <>
                    {/* THE TWO DOORS, ONE RECORD (Arman, R-L1 §F). The warm
                        door comes FIRST and reads like what a manager
                        actually wants to do. */}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="min-h-11 sm:min-h-9"
                      onClick={() => setNewAction("coaching")}
                    >
                      <Plus className="mr-1.5 h-4 w-4" />
                      Log a coaching conversation
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="min-h-11 sm:min-h-9"
                      onClick={() => setNewAction("formal")}
                    >
                      Start a corrective action
                    </Button>
                  </>
                ) : null}
                {canReport ? (
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-11 sm:min-h-9"
                    onClick={() => setNewIncident(true)}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Report an incident
                  </Button>
                ) : null}
              </div>
            ),
          }}
          emptyState={{
            title: "No cases on file",
            description:
              "Corrective actions and incident reports for this employer appear here as they are recorded.",
          }}
        />
      </div>

      {newAction ? (
        <NewCorrectiveActionDialog
          door={newAction}
          onClose={() => setNewAction(null)}
          onCreated={() => {
            setNewAction(null);
            refresh();
          }}
        />
      ) : null}

      {newIncident ? (
        <NewIncidentDialog
          onClose={() => setNewIncident(false)}
          onCreated={() => {
            setNewIncident(false);
            refresh();
          }}
        />
      ) : null}
    </HrPageState>
  );
}
