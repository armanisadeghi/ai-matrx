"use client";

/**
 * The runs list — census #39, one component for both doors.
 *
 * `/workflows/runs` lists every run the caller can see; `/workflows/[id]/runs`
 * lists one workflow's history. Same rows, same columns minus the workflow
 * name (which the page title already carries), so there is ONE implementation
 * and no chance of the two drifting.
 *
 * On the canonical `MatrxDataTable`: it owns sorting, filtering, paging, the
 * toolbar, copy controls and the empty state over a bounded page this surface
 * has already fetched. The list is live through the shared announce channel
 * (`useRunsList`) — a status changes in place, a new run arrives on its own.
 *
 * THE DOOR LAW: the Started cell is the run's real link (keyboard-reachable,
 * cmd-clickable), the whole row opens it as a mouse convenience, and the
 * Workflow cell is an `EntityRef` so the workflow behind a run is one click
 * away too.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import MatrxDataTable from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { formatElapsed } from "@/components/official-candidate/elapsed-time/ElapsedTime";
import { relativeTime } from "@/lib/entity-list/columns";
import { ExternalLink, ListX, Workflow } from "lucide-react";

import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import {
  CONTEXT_MENU_ENTITY_KEY,
  type ContextMenuExtraItem,
} from "@/features/context-menu-v3/types";

import { RunStatusChip, runStatusLabel } from "../../run-status";
import { runDurationMs, runHref, type RunListRow } from "../runs";
import { useRunsList } from "../useRunsList";
import { useWorkflowFacts } from "../useWorkflowFacts";

/** A row plus the workflow facts resolved for it. */
interface RunRowView extends RunListRow {
  workflowName: string | null;
  /**
   * What this run's workflow DECLARES it produces. Not the run's own result:
   * `GET /runs` never returns `result` (it is derived by `GET /runs/{id}`), so
   * a column fed from the list row could only ever render "—". See
   * `service.ts` § WorkflowFacts.
   */
  declaredKind: string | null;
}

const STATUS_FILTER_OPTIONS = [
  "running",
  "completed",
  "failed",
  "errored",
  "interrupted",
  "awaiting_input",
  "paused",
  "cancelled",
  "pending",
].map((value) => ({ value, label: runStatusLabel(value) }));

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

export function RunsList({ definitionId }: { definitionId?: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { rows, loading, error } = useRunsList({ definitionId });
  const facts = useWorkflowFacts(rows.map((row) => row.definitionId));
  const [clickedRow, setClickedRow] = useState<RunRowView | null>(null);

  const view: RunRowView[] = rows.map((row) => {
    const fact = row.definitionId ? facts.get(row.definitionId) : undefined;
    return {
      ...row,
      workflowName: fact?.name ?? null,
      // The run's own declared kind when the wrapper ever carries one, else
      // the workflow's declaration — the only source a LIST row can have.
      declaredKind: row.deliverableKind ?? fact?.outputKind ?? null,
    };
  });

  const columns: MatrxColumnDef<RunRowView>[] = [
    // Dropped on a per-workflow list: every row would say the same name.
    ...(definitionId
      ? []
      : [
          {
            id: "workflow",
            accessorFn: (row: RunRowView) => row.workflowName ?? "",
            header: "Workflow",
            entityToken: (row: RunRowView) =>
              row.definitionId ? "workflow" : undefined,
            entityId: (row: RunRowView) => row.definitionId ?? undefined,
            cell: (row: RunRowView) =>
              row.workflowName ?? <Muted>Unnamed workflow</Muted>,
          } satisfies MatrxColumnDef<RunRowView>,
        ]),
    {
      id: "status",
      accessorKey: "status",
      header: "Status",
      filter: "select",
      filterOptions: STATUS_FILTER_OPTIONS,
      width: 150,
      cell: (row) => <RunStatusChip status={row.status} />,
    },
    {
      id: "started",
      accessorKey: "startedAt",
      header: "Started",
      width: 130,
      align: "right",
      // The run's door. A timestamp is what a person recognises a run by —
      // never the uuid — so the timestamp is what opens it.
      href: (row) => runHref(row),
      cell: (row) =>
        row.startedAt ? (
          <span className="tabular-nums" title={new Date(row.startedAt).toLocaleString()}>
            {relativeTime(row.startedAt)}
          </span>
        ) : (
          <Muted>—</Muted>
        ),
    },
    {
      id: "duration",
      accessorFn: (row) => runDurationMs(row) ?? -1,
      header: "Duration",
      width: 100,
      align: "right",
      cell: (row) => {
        const ms = runDurationMs(row);
        // A run still in flight has no duration yet, and a finished run with
        // no start instant cannot be measured. Neither gets a made-up number.
        return ms === null ? (
          <Muted>—</Muted>
        ) : (
          <span className="tabular-nums text-muted-foreground">{formatElapsed(ms)}</span>
        );
      },
    },
    {
      id: "delivers",
      accessorKey: "declaredKind",
      header: "Delivers",
      width: 160,
      mobileHidden: true,
      cell: (row) =>
        row.declaredKind ? (
          <span className="text-muted-foreground">{row.declaredKind}</span>
        ) : (
          <Muted>—</Muted>
        ),
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {error && (
        <p className="px-3 pb-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <NonEditableContextMenu
        sourceFeature="workflow_run"
        contentSource={{ type: "raw" }}
        contextData={{ content: "" }}
        resolveContextOnOpen={(target) => {
          const id = target
            ?.closest("[data-row-id]")
            ?.getAttribute("data-row-id");
          const row = (id && view.find((r) => r.runId === id)) || null;
          setClickedRow(row);
          if (!row) return null;
          return {
            [CONTEXT_MENU_ENTITY_KEY]: {
              type: "workflow_run",
              id: row.runId,
              title: row.workflowName
                ? `${row.workflowName} run`
                : "Workflow run",
            },
            content: [
              row.workflowName ?? "Unnamed workflow",
              `Status: ${runStatusLabel(row.status)}`,
              row.startedAt ? `Started: ${new Date(row.startedAt).toLocaleString()}` : null,
              row.declaredKind ? `Delivers: ${row.declaredKind}` : null,
            ]
              .filter(Boolean)
              .join("\n"),
          };
        }}
        extraSections={[
          {
            id: "workflow-run-row",
            label: "This run",
            anchor: "after-compare",
            items: [
              {
                kind: "link",
                id: "workflow-run-open",
                label: "Open run",
                icon: ExternalLink,
                href: clickedRow ? runHref(clickedRow) : "#",
                disabled: !clickedRow,
              },
              {
                kind: "link",
                id: "workflow-run-open-workflow",
                label: "Open workflow",
                icon: Workflow,
                href:
                  clickedRow?.definitionId
                    ? `/workflows/${clickedRow.definitionId}`
                    : "#",
                disabled: !clickedRow?.definitionId,
                description: !clickedRow?.definitionId
                  ? "This run has no linked workflow"
                  : undefined,
              },
            ] satisfies ContextMenuExtraItem[],
          },
        ]}
      >
        <div className="flex h-full min-h-0 flex-col">
          <MatrxDataTable<RunRowView>
            data={view}
            columns={columns}
            getRowId={(row) => row.runId}
            isLoading={loading}
            urlState={{ id: definitionId ? "workflow-runs" : "runs" }}
            onRowOpen={(row) => {
              startTransition(() => router.push(runHref(row)));
            }}
            emptyState={{
              icon: <ListX className="h-5 w-5" />,
              title: definitionId ? "This workflow hasn't run yet" : "No runs yet",
              description: "A run appears here the moment it starts.",
            }}
          />
        </div>
      </NonEditableContextMenu>
    </div>
  );
}
