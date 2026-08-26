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
  HR_CORRECTIVE_ACTION_STATES,
  HR_INCIDENT_STATES,
  type HrRelationsCase,
} from "../types";
import { NewCorrectiveActionDialog } from "./NewCorrectiveActionDialog";
import { NewIncidentDialog } from "./NewIncidentDialog";

function formatDay(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

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
          <Link
            href={hrRelationsCaseHref(row.id, orgRef, row.caseKind)}
            className="truncate text-sm font-medium text-foreground underline-offset-2 hover:underline"
          >
            {row.kindLabel}
          </Link>
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
          // hr_admin holds corrective actions but NOT incidents (SPEC-ACCESS
          // §3.2). Saying so beats a list that silently shows half the truth.
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            You hold one of the two relations records here, so this list shows
            that one. Nothing is hidden inside what you can see.
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
                  })),
              },
              {
                id: "state",
                type: "button-group",
                label: "State",
                value: filter.state ?? "all",
                options: [
                  { value: "all", label: "All" },
                  ...HR_INCIDENT_STATES.map((s) => ({ value: s, label: s })),
                  ...HR_CORRECTIVE_ACTION_STATES.map((s) => ({
                    value: s,
                    label: s,
                  })),
                ],
                onChange: (value) =>
                  setFilter((f) => ({
                    ...f,
                    state: value === "all" ? null : value,
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
