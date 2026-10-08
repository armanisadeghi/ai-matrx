// Scheduling admin › All tasks — canonical MatrxDataTable over scheduler.sch_task
// rows.
//
// THE DOOR LAW: these are SCHEDULED tasks, and their record route is
// `/schedules/<id>` (features/scheduling). They are NOT workspace `task` rows —
// the `task` entity token's `/tasks/<id>` would open a different record
// entirely, so every door here is wired explicitly.
//
// SCOPE CAVEAT: `scheduler.sch_task` / `sch_run` carry only the canonical
// std_select/std_update/std_delete policies — there is NO admin clause live
// (the old `migrations/sch_admin_rls.sql` targeted these tables back when they
// lived in the `public` schema, and was superseded by the RLS
// canonicalization). So this console shows the VIEWER'S OWN schedules, not the
// fleet. See FOUND_DEFECTS D140.
//
// The schema name above is deliberately spelled out in prose rather than as a
// qualified table reference: `pnpm check:dead-relations` scans comments too, so
// writing the pre-reorg name inline made this file report a dead relation on
// every run even though every query here goes through
// `.schema("scheduler").from(...)`. A guard that cries wolf gets ignored.

"use client";

import { useMemo } from "react";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import { MatrxUuidCell } from "@ai-matrx/design-system/data-table/uuid-cell";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import {
  fetchTasksAdminPage,
  type AdminTaskRow,
} from "@/lib/services/scheduling-admin-service";
import {
  serverTableInitialState,
  useServerTable,
} from "@/features/admin/shared/server-table/useServerTable";
import {
  humanizeRelative,
  humanizeTrigger,
} from "@/features/scheduling/utils/triggerHumanize";
import { adminScheduleHref } from "@/features/scheduling/constants/routes";
import { DuplicateScheduleBanner } from "@/features/scheduling/components/list/DuplicateScheduleBanner";
import { useDuplicateSchedules } from "@/features/scheduling/hooks/useDuplicateSchedules";
import { useAdminSchedulingScopeSlice } from "@/features/scheduling/lib/admin-scheduling-scope";
import { useScheduledTaskMenuSection } from "@/features/scheduling/components/shared/scheduling-menu-sections";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

function triggerText(r: AdminTaskRow): string {
  return r.trigger
    ? humanizeTrigger(
        r.trigger.type,
        r.trigger.config as Record<string, unknown>,
      )
    : "—";
}

const INITIAL_STATE = serverTableInitialState({ id: "updated_at", direction: "desc" });

export default function AdminTasksPage() {
  // Search, column filters, sort and paging are answered by the database over EVERY scheduled
  // task (fetchTasksAdminPage) — the table holds one page and says the server's total.
  const { rows, setRows, total, loading, reload, tableProps } = useServerTable<AdminTaskRow>(
    fetchTasksAdminPage,
    INITIAL_STATE,
    "scheduled tasks",
    "",
    "scheduling-tasks",
  );
  const fetching = loading;
  const {
    groups: duplicateGroups,
    error: duplicateError,
    refetch: refetchDuplicates,
  } = useDuplicateSchedules(total);

  // The server's total, not the page length. The toolbar's search box and column filters are
  // source-owned now, but the surface still does not claim their text: no `task_search` value.
  useAdminSchedulingScopeSlice("tasks", () => ({
    task_row_count: total,
  }));

  // ONE right-click menu for the whole pane — the row is resolved from the
  // DOM at open (`data-row-id`), same as every other MatrxDataTable menu.
  const rowMenu = useScheduledTaskMenuSection<AdminTaskRow>({
    rows: () => rows,
    content: (r) =>
      [
        `Title: ${r.title}`,
        `Owner: ${r.user_email ?? r.user_id}`,
        `Trigger: ${triggerText(r)}`,
        `State: ${r.enabled ? "enabled" : "paused"}`,
      ].join("\n"),
    onDisabled: (r) =>
      setRows((prev) => prev.map((row) => (row.id === r.id ? { ...row, enabled: false } : row))),
  });

  const columns = useMemo((): MatrxColumnDef<AdminTaskRow>[] => {
    return [
      {
        id: "title",
        accessorKey: "title",
        header: "Title",
        filter: "text",
        width: 260,
        cell: (r) => (
          <div className="min-w-0">
            <EntityRef
              token="scheduled_task"
              id={r.id}
              name={r.title}
              href={adminScheduleHref(r.id)}
              className="font-medium"
            />
            {r.description && (
              <div className="text-xs text-muted-foreground line-clamp-1">
                {r.description}
              </div>
            )}
          </div>
        ),
      },
      {
        id: "agent",
        header: "Agent",
        // The row already carries the agent it runs — rendering it without a
        // door would be knowing the answer and withholding it.
        accessorFn: (r) => r.agent?.agent_id ?? "",
        // The row holds only the agent's id (no name to match in the query), so there is nothing
        // meaningful to filter or sort by.
        filter: false,
        sortable: false,
        cellKind: "uuid",
        fk: { token: "agent", label: "Agent" },
        width: 130,
      },
      {
        id: "owner",
        header: "Owner",
        accessorFn: (r) => r.user_email ?? r.user_id,
        // Filter matches the person's name or email in the database; the email is resolved after
        // the page is read, so there is nothing to sort by.
        filter: "text",
        sortable: false,
        // No `user` entity token and no `/users/<id>` route exist — the id
        // stays copyable rather than pointing at a route that isn't there.
        cell: (r) => (
          <span className="flex min-w-0 items-center gap-1.5">
            {r.user_email ? (
              <span className="min-w-0 truncate text-xs" title={r.user_email}>
                {r.user_email}
              </span>
            ) : null}
            <MatrxUuidCell value={r.user_id} label="Owner user id" />
          </span>
        ),
        width: 240,
      },
      {
        id: "trigger",
        header: "Trigger",
        accessorFn: triggerText,
        // The trigger is a joined, humanized value (type + config) the query cannot filter or sort.
        filter: false,
        sortable: false,
        cell: (r) => <span className="text-xs">{triggerText(r)}</span>,
        width: 200,
      },
      {
        id: "next_due_at",
        accessorKey: "next_due_at",
        header: "Next",
        filter: "date",
        cell: (r) => (
          <span className="text-xs">{humanizeRelative(r.next_due_at)}</span>
        ),
        width: 120,
      },
      {
        id: "updated_at",
        accessorKey: "updated_at",
        header: "Updated",
        filter: "date",
        cell: (r) => (
          <span className="text-xs">{humanizeRelative(r.updated_at)}</span>
        ),
        width: 120,
      },
      {
        id: "state",
        header: "State",
        accessorFn: (r) => (r.enabled ? "Enabled" : "Paused"),
        filter: "select",
        filterOptions: [
          { value: "true", label: "Enabled" },
          { value: "false", label: "Paused" },
        ],
        width: 100,
        cell: (r) => (
          <Badge
            variant={r.enabled ? "secondary" : "outline"}
            className="text-[10px]"
          >
            {r.enabled ? "Enabled" : "Paused"}
          </Badge>
        ),
      },
      {
        id: "id",
        accessorKey: "id",
        header: "ID",
        // The toolbar search matches a pasted full id.
        filter: false,
        sortable: false,
        cellKind: "uuid",
        fk: { label: "Scheduled task", href: (id) => adminScheduleHref(id) },
        width: 110,
      },
    ];
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      {duplicateError && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Duplicate check unavailable</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>
              {duplicateError} Tasks remain available, but possible duplicate
              runs are not currently highlighted.
              <ErrorAlchemyMenu />
            </span>
            <Button
              icon={<RefreshCw />}
              variant="outline"
              onClick={() => refetchDuplicates()}
            > Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {/* Schedules that duplicate each other (THE SCHEDULER DUPLICATE GUARD).
          Above the table because duplication is a property of the SET — no
          single row can show that another row is doing its job too. Same
          component and same RLS-scoped endpoint as /schedules, so the two
          consoles can never disagree about what a duplicate is. */}
      <DuplicateScheduleBanner
        groups={duplicateGroups}
        onResolved={() => {
          reload();
          void refetchDuplicates();
        }}
      />
      <div className="min-h-0 flex-1" data-surface-value="task_row_count">
        <NonEditableContextMenu
          sourceFeature="scheduled"
          contentSource={{ type: "raw" }}
          getApplicationScope={rowMenu.getApplicationScope}
          resolveContextOnOpen={rowMenu.resolveContextOnOpen}
          extraSections={rowMenu.sections}
        >
        <MatrxDataTable
                    {...tableProps}
          columns={columns}
          getRowId={(r) => r.id}
          emptyState={{ title: "No tasks match" }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search title, description or owner…",
            actions: (
              <Button
                variant="outline"
                onClick={reload}
                disabled={fetching}
              >
                {fetching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            ),
          }}
          copy={{
            label: "Scheduled task",
            listLabel: "Scheduled tasks (this view)",
            location: "/administration/automation/scheduling/tasks",
            rowKind: "scheduled-task",
            listKind: "scheduled-tasks",
            humanRow: (r) =>
              [
                `Title: ${r.title}`,
                `Owner: ${r.user_email ?? r.user_id}`,
                `Trigger: ${triggerText(r)}`,
                `Next: ${humanizeRelative(r.next_due_at)}`,
                `State: ${r.enabled ? "enabled" : "paused"}`,
              ].join("\n"),
            rowAttributes: (r) => ({ id: r.id, enabled: r.enabled }),
          }}
          detail={{
            // The panel names the record, so the panel opens it too.
            title: (r) => (
              <EntityRef
                token="scheduled_task"
                id={r.id}
                name={r.title}
                href={adminScheduleHref(r.id)}
                alwaysShowActions
              />
            ),
            description: (r) => r.description ?? undefined,
          }}
        />
        </NonEditableContextMenu>
      </div>
    </div>
  );
}
