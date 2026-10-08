"use client";

// features/mandates/run-history/RunsTable.tsx
//
// THE ONE RUNS TABLE on the canonical MatrxDataTable — mounted on the admin
// mandate record's Test tab (one mandate's runs) and the agent's Runs tab (one
// agent's runs across every mandate and direct use). Same read
// (`mandate.run_history`), same columns; the agent scope adds "Mandate".
//
// Sort, the status filter and paging are SOURCE-owned (the database answers
// them) and live in the URL through `useServerTable`, so Back and a shared
// link reopen the same view. Text is data and labels only: every cell is one
// line, the full value in its tooltip.

import { useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type {
  MatrxColumnDef,
  MatrxDataTableQueryState,
} from "@ai-matrx/design-system/data-table/types";
import { storedMandateKey } from "@ai-matrx/agents/mandates";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { NewTabLink } from "@/components/official/entity-ref/NewTabLink";
import { StatusToken } from "@/components/official/ConfigurationFields";
import { useServerTable, serverTableInitialState } from "@/features/admin/shared/server-table/useServerTable";
import { conversationHref } from "@/features/hindsight/subject-doors";
import { runHref } from "@/features/workflow-runtime/run-doors";
import { ADMIN_MANDATES_HOME } from "@/features/mandates/admin-routes";
import { mandateDisplayName } from "@/features/mandates/mandate-words";
import { outputPreviewLine } from "@/features/content-ir/surfaces/output-preview-line";
import {
  RUN_STATUSES,
  fetchRuns,
  type MandateRun,
  type RunHistoryView,
  type RunSort,
  type RunStatus,
} from "./service";
import {
  STATUS_WORDS,
  absoluteWhen,
  costWords,
  durationWords,
  ranByWords,
  rungTitle,
  rungWords,
} from "./format";

export type RunsScope = { mandateKey: string } | { agentId: string };

export interface RunsTableProps {
  scope: RunsScope;
  view: RunHistoryView;
  /** Which doors a conversation and a mandate open through. */
  audience: "admin" | "product";
  /** URL address of the table's state (`/^[a-z][a-z0-9-]*$/`). */
  urlId: string;
  /** Rows per page (default 25). */
  pageSize?: number;
  /** Hide paging — a fixed "newest N" strip. */
  hidePagination?: boolean;
  title?: string;
  /** Right-side toolbar actions. */
  actions?: ReactNode;
  /** Row click selects the run (the Runs tab); absent = rows only open doors. */
  onSelectRun?: (run: MandateRun) => void;
  /** The selected run's conversation id — its row is highlighted. */
  selectedConversationId?: string | null;
}

const SORT_BY_COLUMN: Record<string, RunSort> = {
  when: "started_at",
  duration: "duration",
  cost: "cost",
  status: "status",
  level: "level",
};

const STATUS_TONE: Record<RunStatus, "ok" | "caution" | "error" | "neutral"> = {
  succeeded: "ok",
  warned: "caution",
  failed: "error",
  stopped: "neutral",
  waiting: "neutral",
  running: "neutral",
};

function isRunStatus(value: string): value is RunStatus {
  return RUN_STATUSES.some((status) => status === value);
}

function statusFilter(state: MatrxDataTableQueryState): RunStatus | null {
  const filter = state.columnFilters.status;
  if (!filter || filter.kind !== "select") return null;
  const values = filter.values ?? (filter.value ? [filter.value] : []);
  // The read answers one status at a time; the column offers one choice.
  const first = values[0];
  return first && isRunStatus(first) ? first : null;
}

function whenWords(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "—";
  return new Date(then).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: new Date(then).getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function outputHrefOf(run: MandateRun, audience: "admin" | "product"): string | null {
  if (run.runKind === "workflow") return runHref(run.runId);
  return run.conversationId && run.hasTranscript ? conversationHref(run.conversationId, audience) : null;
}

export function RunsTable({
  scope,
  view,
  audience,
  urlId,
  pageSize = 25,
  hidePagination = false,
  title = "Runs",
  actions,
  onSelectRun,
  selectedConversationId = null,
}: RunsTableProps) {
  const { unit: costUnit, rate: costRate } = useCostDisplay();
  const scopeKey = "mandateKey" in scope ? `m:${scope.mandateKey}` : `a:${scope.agentId}`;
  const byAgent = "agentId" in scope;
  const router = useRouter();
  const [opening, startOpening] = useTransition();
  // A row opens its run (the conversation or workflow run) like every other
  // MatrxDataTable row — unless the page selects runs in place (the Runs tab).
  const openRun = (run: MandateRun) => {
    const href = outputHrefOf(run, audience);
    if (!href || opening) return;
    startOpening(() => router.push(href));
  };

  const table = useServerTable<MandateRun>(
    async (state) => {
      const page = await fetchRuns({
        scope: "mandateKey" in scope ? { mandateKey: storedMandateKey(scope.mandateKey) } : { agentId: scope.agentId },
        view,
        status: statusFilter(state),
        sort: (state.sort && SORT_BY_COLUMN[state.sort.id]) || "started_at",
        descending: state.sort ? state.sort.direction === "desc" : true,
        limit: state.pageSize,
        offset: (state.page - 1) * state.pageSize,
      });
      return { rows: page.rows, total: page.total };
    },
    serverTableInitialState({ id: "when", direction: "desc" }, pageSize),
    "runs",
    `${scopeKey}|${view}`,
    urlId,
  );

  const columns: MatrxColumnDef<MandateRun>[] = [
    {
      id: "when",
      header: "Date",
      sortable: true,
      defaultSortDirection: "desc",
      filter: false,
      accessorFn: (run) => run.startedAt,
      cell: (run) => (
        <span className="tabular-nums" title={absoluteWhen(run.startedAt)}>
          {whenWords(run.startedAt)}
        </span>
      ),
    },
    {
      id: "ran_by",
      header: "Ran by",
      sortable: false,
      filter: false,
      accessorFn: (run) => ranByWords(run, view),
      cell: (run) => <span title={ranByWords(run, view)}>{ranByWords(run, view)}</span>,
    },
    {
      id: "level",
      header: "Level",
      sortable: true,
      filter: false,
      accessorFn: (run) => rungWords(run.rung),
      cell: (run) => (
        <span className={run.rung ? undefined : "text-muted-foreground"} title={rungTitle(run.rung)}>
          {rungWords(run.rung)}
        </span>
      ),
    },
    ...(byAgent
      ? [
          {
            id: "mandate",
            header: "Mandate",
            sortable: false,
            filter: false,
            accessorFn: (run: MandateRun) => run.mandateKey ?? "",
            cell: (run: MandateRun) =>
              run.mandateKey ? (
                <Link
                  href={`${audience === "admin" ? ADMIN_MANDATES_HOME : "/mandates"}/${encodeURIComponent(run.mandateKey)}`}
                  className="text-primary hover:underline"
                  title={run.mandateKey}
                >
                  {mandateDisplayName(storedMandateKey(run.mandateKey), null)}
                </Link>
              ) : (
                <span className="text-muted-foreground" title="Used directly, not through a mandate">
                  Direct
                </span>
              ),
          } satisfies MatrxColumnDef<MandateRun>,
        ]
      : [
          {
            id: "holder",
            header: "Agent or workflow",
            sortable: false,
            filter: false,
            accessorFn: (run: MandateRun) => run.holderName ?? "",
            cell: (run: MandateRun) =>
              run.holderId ? (
                <EntityRef
                  token={run.holderType}
                  id={run.holderId}
                  name={run.holderName ?? (run.holderType === "workflow" ? "Workflow" : "Agent")}
                  className="min-w-0 max-w-full"
                />
              ) : (
                <span className="text-muted-foreground" title="Not recorded for this run">
                  —
                </span>
              ),
          } satisfies MatrxColumnDef<MandateRun>,
        ]),
    {
      id: "status",
      header: "Result",
      sortable: true,
      filter: "select",
      filterSingle: true,
      filterOptions: RUN_STATUSES.map((status) => ({ value: status, label: STATUS_WORDS[status] })),
      accessorFn: (run) => run.status,
      cell: (run) => (
        <span title={run.error ?? run.outputMissingKeys.join(", ") ?? undefined}>
          <StatusToken status={STATUS_TONE[run.status]} label={STATUS_WORDS[run.status]} />
        </span>
      ),
    },
    {
      id: "duration",
      header: "Duration",
      sortable: true,
      filter: false,
      accessorFn: (run) => run.durationMs,
      cell: (run) => <span className="tabular-nums">{durationWords(run.durationMs)}</span>,
    },
    {
      id: "cost",
      header: "Cost",
      sortable: true,
      filter: false,
      accessorFn: (run) => run.cost,
      cell: (run) =>
        // The points rate arrives a moment after the rows; "—" would claim the cost is unknown.
        run.cost != null && costUnit === "points" && costRate == null ? (
          <span className="tabular-nums text-muted-foreground" title="Loading the points rate">
            …
          </span>
        ) : (
          <span className="tabular-nums">{costWords(run.cost, costRate, costUnit)}</span>
        ),
    },
    {
      id: "output",
      header: "Output",
      sortable: false,
      filter: false,
      accessorFn: (run) => outputPreviewLine(run.outputPreview ?? run.error),
      cell: (run) => {
        // One readable line, never raw JSON: a kind reads as "Agent definition: Its name".
        const text = outputPreviewLine(run.outputPreview ?? run.error);
        return text ? (
          <span className={run.outputPreview ? undefined : "text-destructive"} title={text}>
            {text}
          </span>
        ) : (
          <span className="text-muted-foreground" title="No output kept for this run">
            —
          </span>
        );
      },
    },
    {
      id: "open",
      header: "Open",
      label: "Open",
      sortable: false,
      filter: false,
      resizable: false,
      minWidth: 96,
      cell: (run) => {
        const href = outputHrefOf(run, audience);
        const what = run.runKind === "workflow" ? "workflow run" : "conversation";
        return href ? (
          <span className="inline-flex items-center gap-0.5">
            <Link href={href} className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline" title={`Open this ${what}`}>
              Open
              <ArrowUpRight className="h-3 w-3" />
            </Link>
            <NewTabLink href={href} label={`this ${what}`} />
          </span>
        ) : (
          <span className="text-muted-foreground" title="No transcript kept for this run">
            —
          </span>
        );
      },
    },
  ];

  return (
    <MatrxDataTable<MandateRun>
      {...table.tableProps}
      columns={columns}
      getRowId={(run) => `${run.runKind}:${run.runId}`}
      tableId={urlId}
      toolbar={{ title, search: false, actions }}
      viewTabs={false}
      pageSize={pageSize}
      hidePagination={hidePagination}
      cellLines="one"
      getRowHref={(run) => outputHrefOf(run, audience) ?? undefined}
      {...(onSelectRun
        ? {
            onRowOpen: onSelectRun,
            // Selecting a run opens the page's split — never the table's raw-field window.
            detail: { enabled: false },
            window: { enabled: false },
            rowClassName: (run: MandateRun) =>
              selectedConversationId && run.conversationId === selectedConversationId ? "bg-primary/10" : undefined,
          }
        : {
            // The row IS the door to its run — no raw-field detail window on the way.
            onRowOpen: openRun,
            detail: { enabled: false },
            window: { enabled: false },
          })}
    />
  );
}
