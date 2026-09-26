"use client";

/**
 * TOOL RE-FETCH REPORT — how often an agent asks for something it was already
 * given, and how much of that bought nothing.
 *
 * A raw "repeats" total is not a finding: a tool that legitimately polls a
 * changing resource repeats constantly and is working correctly. The measure
 * that means something is SAME-DATA repeats — the stored output hash matched,
 * so the second call returned exactly what the first one did. That is the
 * default sort, and it is what the chars column prices.
 *
 * 🚨 THREE STATES, NEVER TWO. `same_data` is Same / New / Unknown, and
 * `after_trim` is Yes / No / n/a. Unknown is not "no" and is never folded into
 * one — per-iteration trim audits only exist from 2026-09-08 on, so an older
 * repeat genuinely cannot answer that question and says so.
 *
 * THE DOOR LAW (common-docs/policies/no-dead-ends.md): every repeat names its
 * conversation and lets you open it. Where the registry has no route, the id is
 * copyable — never an inert string, never a button that 404s.
 */

import React, { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Copy,
  Repeat2,
} from "lucide-react";

import { formatDurationSeconds } from "@ai-matrx/kit/format";
import AppLink from "@/components/navigation/AppLink";
import { csvExportItem, jsonExportItem } from "@/components/agent-copy/export";
import { AssistStrip } from "@/features/assists/components/AssistStrip";
import { ADMIN_REPORTING_SURFACE_NAME } from "@/features/surfaces/manifests/admin-reporting.manifest";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  MatrxDataTable,
  useTableUrlState,
} from "@ai-matrx/design-system/data-table";
import type {
  MatrxColumnDef,
  MatrxDataTableQueryState,
} from "@ai-matrx/design-system/data-table/types";

import {
  DETAIL_PAGE_SIZE,
  REFETCH_WINDOWS,
  RefetchTimeoutError,
  TRIM_AUDIT_EPOCH,
  getToolRefetchDetail,
  getToolRefetchSummary,
  type RefetchWindow,
  type ToolRefetchDetailRow,
  type ToolRefetchSummaryRow,
} from "./service";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

/* ── formatters that refuse to invent a number ─────────────────────────────── */

const EM_DASH = "—";

function fmtCount(n: number | null | undefined): string {
  if (n === null || n === undefined) return EM_DASH;
  return n.toLocaleString();
}

function fmtPct(r: number | null | undefined): string {
  if (r === null || r === undefined || !Number.isFinite(r)) return EM_DASH;
  return `${(r * 100).toFixed(1)}%`;
}

function fmtGapCalls(n: number | null | undefined): string {
  if (n === null || n === undefined) return EM_DASH;
  return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1);
}

/** mm:ss, with an h prefix once it stops fitting. */
function fmtDuration(secs: number | null | undefined): string {
  return formatDurationSeconds(secs, { style: "clock", fallback: EM_DASH });
}

function fmtWhen(iso: string | null): string {
  if (!iso) return EM_DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return EM_DASH;
  return d.toLocaleString(undefined, {
    year: "2-digit",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ── badges ────────────────────────────────────────────────────────────────── */

function SameDataBadge({ value }: { value: boolean | null }) {
  if (value === true)
    return (
      <Badge
        variant="outline"
        title="The stored output hash matched the first call's — this re-fetch returned identical data and bought nothing."
        className="whitespace-nowrap border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200"
      >
        Same
      </Badge>
    );
  if (value === false)
    return (
      <Badge
        variant="outline"
        title="The output hash differed — the underlying data actually changed, so this was a legitimate refresh."
        className="whitespace-nowrap border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
      >
        New
      </Badge>
    );
  return (
    <Badge
      variant="outline"
      title="The output was not stored for one of these calls, so whether the data changed cannot be known. This is not 'new' and not 'same'."
      className="whitespace-nowrap text-muted-foreground"
    >
      Unknown
    </Badge>
  );
}

function TrimBadge({ value }: { value: boolean | null }) {
  if (value === true)
    return (
      <Badge
        variant="outline"
        title="The first result had already been cleared from the model's context by the trimmer before the repeat — the agent could no longer see it."
        className="whitespace-nowrap border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
      >
        Yes
      </Badge>
    );
  if (value === false)
    return (
      <Badge
        variant="outline"
        title="The first result was still in the model's context when the repeat happened — the agent re-asked for something it could still see."
        className="whitespace-nowrap"
      >
        No
      </Badge>
    );
  return (
    <Badge
      variant="outline"
      title={`No per-iteration context-trim audit was recorded for this repeat, so whether the first result was still visible cannot be known. Audit coverage widens from ${TRIM_AUDIT_EPOCH} on and is partial before it. This is not "No".`}
      className="whitespace-nowrap text-muted-foreground"
    >
      n/a
    </Badge>
  );
}

/* ── sorting ───────────────────────────────────────────────────────────────── */

type SortKey =
  | "toolName"
  | "totalCalls"
  | "repeats"
  | "repeatRate"
  | "sameDataRepeats"
  | "sameDataRate"
  | "newDataRepeats"
  | "unknownDataRepeats"
  | "afterTrimRepeats"
  | "medianGapCalls"
  | "medianGapSecs"
  | "charsRefetchedSameData"
  | "conversations";

interface ColumnSpec {
  key: SortKey;
  label: string;
  align: "left" | "right";
  title: string;
}

const COLUMNS: ColumnSpec[] = [
  { key: "toolName", label: "Tool", align: "left", title: "The tool whose calls were repeated." },
  { key: "totalCalls", label: "Calls", align: "right", title: "Total calls to this tool in the window (the denominator for both rates)." },
  { key: "repeats", label: "Repeats", align: "right", title: "Calls whose name + arguments matched an earlier call in the same conversation." },
  { key: "repeatRate", label: "Repeat %", align: "right", title: "Repeats ÷ total calls." },
  { key: "sameDataRepeats", label: "Same-data", align: "right", title: "Repeats whose stored output hash matched — the re-fetch bought nothing." },
  { key: "sameDataRate", label: "Same-data %", align: "right", title: "Same-data repeats ÷ total calls. The number worth acting on." },
  { key: "newDataRepeats", label: "New-data", align: "right", title: "Repeats whose output actually changed — a legitimate refresh." },
  { key: "unknownDataRepeats", label: "Unknown", align: "right", title: "Repeats where the output was not stored, so nothing can be said either way." },
  { key: "afterTrimRepeats", label: "After trim", align: "right", title: "Repeats where the first result had already been trimmed out of the model's context." },
  { key: "medianGapCalls", label: "Gap (calls)", align: "right", title: "Median number of tool calls between the first call and the repeat." },
  { key: "medianGapSecs", label: "Gap (mm:ss)", align: "right", title: "Median wall-clock time between the first call and the repeat." },
  { key: "charsRefetchedSameData", label: "Chars re-fetched", align: "right", title: "Characters of output re-delivered by same-data repeats — the context this cost." },
  { key: "conversations", label: "Convos", align: "right", title: "Distinct conversations in which this tool was repeated." },
];

const TOOL_REFETCH_AI_LOCATION = "AI Matrx Admin — Tool re-fetch report";

function rowsToHumanText(rows: ToolRefetchSummaryRow[], win: RefetchWindow): string {
  const header = `Tool re-fetch report (${win}) — ${rows.length} tools`;
  const lines = rows.map(
    (r) =>
      `${r.toolName}: ${r.repeats} repeats of ${r.totalCalls ?? "?"} calls (${r.sameDataRepeats} same-data, ${r.newDataRepeats} new-data, ${r.unknownDataRepeats} unknown, ${r.afterTrimRepeats} after trim) across ${r.conversations} conversations`,
  );
  return [header, "", ...lines].join("\n");
}

type ToolRefetchCopyInput = {
  window: RefetchWindow;
  sortKey: string;
  sortAscending: boolean;
  truncated: boolean;
  truncationNote: string | null | undefined;
};

/**
 * List callbacks are consumed by the shared table's one toolbar Alchemy. They
 * retain the report's established whole-view payloads while row copy stays on
 * the canonical per-tool contract.
 */
export function toolRefetchCopyConfig(input: ToolRefetchCopyInput) {
  const { window: win, sortKey, sortAscending, truncated, truncationNote } = input;
  return {
    label: "Tool",
    listLabel: "Tool re-fetch report",
    location: TOOL_REFETCH_AI_LOCATION,
    rowKind: "tool-refetch-report-row",
    listKind: "tool-refetch-report",
    humanRow: (row: ToolRefetchSummaryRow) => rowsToHumanText([row], win),
    agentRow: (row: ToolRefetchSummaryRow) => row,
    listHuman: (visible: ToolRefetchSummaryRow[], _all: ToolRefetchSummaryRow[]) => rowsToHumanText(visible, win),
    listJson: (visible: ToolRefetchSummaryRow[], _all: ToolRefetchSummaryRow[]) => visible,
    listAgent: (visible: ToolRefetchSummaryRow[], _all: ToolRefetchSummaryRow[]) => ({
      kind: "tool-refetch-report",
      location: TOOL_REFETCH_AI_LOCATION,
      description: `Tool re-fetch report for the ${win} window: ${visible.length} visible tools, sorted by ${sortKey} ${sortAscending ? "ascending" : "descending"}.`,
      data: visible,
      summary: rowsToHumanText(visible, win),
      attributes: {
        window: win,
        tool_count: visible.length,
        truncated,
        sort: `${sortKey}:${sortAscending ? "asc" : "desc"}`,
      },
      context: {
        truncation_note: truncationNote ?? undefined,
        trim_audit_epoch: TRIM_AUDIT_EPOCH,
      },
    }),
    export: (visible: ToolRefetchSummaryRow[], _all: ToolRefetchSummaryRow[]) => ({
      items: [
        jsonExportItem(() => visible),
        csvExportItem(
          () => visible as unknown as Array<Record<string, unknown>>,
          "CSV",
          COLUMNS.map((c) => ({ key: c.key, header: c.label })),
        ),
      ],
    }),
  };
}

/* ── drill-down ────────────────────────────────────────────────────────────── */

function ConversationCell({ id }: { id: string | null }) {
  const href = useMemo(() => {
    if (!id) return null;
    const info = tryGetEntityInfo("conversation");
    return info?.hrefFor ? info.hrefFor(id) : null;
  }, [id]);

  if (!id) return <span className="text-muted-foreground">{EM_DASH}</span>;

  const short = `${id.slice(0, 8)}…`;
  if (href) {
    return (
      <AppLink
        href={href}
        className="inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline"
        title={id}
      >
        {short}
        <ArrowUpRight className="h-3 w-3" />
      </AppLink>
    );
  }
  return (
    <button
      type="button"
      title={`Copy conversation id ${id}`}
      className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
      onClick={() => {
        void navigator.clipboard
          .writeText(id)
          .then(() => toast.success("Conversation id copied"))
          .catch(() => toast.error("Clipboard unavailable — the id is in the tooltip"));
      }}
    >
      {short}
      <Copy className="h-3 w-3" />
    </button>
  );
}

function ArgsBlock({ args }: { args: unknown }) {
  const [open, setOpen] = useState(false);
  const text = useMemo(() => {
    try {
      return JSON.stringify(args, null, 2) ?? "null";
    } catch {
      return String(args);
    }
  }, [args]);

  return (
    <div>
      <button
        type="button"
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {open ? "Hide arguments" : "Arguments"}
      </button>
      {open && (
        <pre className="mt-1 max-h-56 overflow-auto rounded border bg-muted/40 p-2 font-mono text-[11px] leading-snug">
          {text}
        </pre>
      )}
    </div>
  );
}

const DETAIL_COLUMNS: MatrxColumnDef<ToolRefetchDetailRow>[] = [
  {
    id: "repeatAt",
    accessorKey: "repeatAt",
    header: "When",
    filter: "date",
    width: 145,
    cell: (row) => <span className="whitespace-nowrap">{fmtWhen(row.repeatAt)}</span>,
  },
  {
    id: "repeatIteration",
    accessorKey: "repeatIteration",
    header: "Repeat iteration",
    filter: "number",
    width: 125,
    mobileHidden: true,
    cell: (row) => <span className="tabular-nums">{fmtCount(row.repeatIteration)}</span>,
  },
  {
    id: "conversationId",
    accessorKey: "conversationId",
    header: "Conversation",
    width: 145,
    cell: (row) => <ConversationCell id={row.conversationId} />,
  },
  {
    id: "sameData",
    accessorKey: "sameData",
    header: "Data",
    filter: "boolean",
    width: 105,
    cell: (row) => <SameDataBadge value={row.sameData} />,
  },
  {
    id: "trimmedBeforeRepeat",
    accessorKey: "trimmedBeforeRepeat",
    header: "After trim",
    filter: "boolean",
    width: 110,
    cell: (row) => <TrimBadge value={row.trimmedBeforeRepeat} />,
  },
  {
    id: "gapCalls",
    accessorKey: "gapCalls",
    header: "Gap (calls)",
    filter: "number",
    width: 105,
    cell: (row) => <span className="tabular-nums">{fmtCount(row.gapCalls)}</span>,
  },
  {
    id: "gapSecs",
    accessorKey: "gapSecs",
    header: "Gap (mm:ss)",
    filter: "number",
    width: 110,
    cell: (row) => <span className="tabular-nums">{fmtDuration(row.gapSecs)}</span>,
  },
  {
    id: "gapIterations",
    accessorKey: "gapIterations",
    header: "Gap (iterations)",
    filter: "number",
    width: 125,
    mobileHidden: true,
    cell: (row) => <span className="tabular-nums">{fmtCount(row.gapIterations)}</span>,
  },
  {
    id: "firstAt",
    accessorKey: "firstAt",
    header: "First call",
    filter: "date",
    width: 145,
    mobileHidden: true,
    cell: (row) => <span className="whitespace-nowrap">{fmtWhen(row.firstAt)}</span>,
  },
  {
    id: "firstIteration",
    accessorKey: "firstIteration",
    header: "First iteration",
    filter: "number",
    width: 120,
    mobileHidden: true,
    cell: (row) => <span className="tabular-nums">{fmtCount(row.firstIteration)}</span>,
  },
  {
    id: "firstOutputChars",
    accessorKey: "firstOutputChars",
    header: "First chars",
    filter: "number",
    width: 105,
    cell: (row) => <span className="tabular-nums">{fmtCount(row.firstOutputChars)}</span>,
  },
  {
    id: "repeatOutputChars",
    accessorKey: "repeatOutputChars",
    header: "Repeat chars",
    filter: "number",
    width: 115,
    mobileHidden: true,
    cell: (row) => <span className="tabular-nums">{fmtCount(row.repeatOutputChars)}</span>,
  },
  {
    id: "priorIdenticalCalls",
    accessorKey: "priorIdenticalCalls",
    header: "Prior identical",
    filter: "number",
    width: 120,
    cell: (row) => <span className="tabular-nums">{fmtCount(row.priorIdenticalCalls)}</span>,
  },
  {
    id: "args",
    accessorKey: "args",
    header: "Arguments",
    width: 130,
    cell: (row) => <ArgsBlock args={row.args} />,
  },
];

export function ToolDetail({
  toolName,
  window: win,
  expectedRepeats,
}: {
  toolName: string;
  window: RefetchWindow;
  expectedRepeats: number;
}) {
  const [pages, setPages] = useState(1);
  const [tableState, setTableState] = useState<MatrxDataTableQueryState>({
    page: 1,
    pageSize: DETAIL_PAGE_SIZE,
    search: "",
    anyOf: "",
    columnFilters: {},
    sort: { id: "repeatAt", direction: "desc" },
  });

  const detail = useQuery<ToolRefetchDetailRow[]>({
    queryKey: ["admin", "tool-refetch", "detail", toolName, win, pages],
    queryFn: () => getToolRefetchDetail(toolName, win, 0, pages * DETAIL_PAGE_SIZE),
    placeholderData: keepPreviousData,
    retry: (attempt, err) => !(err instanceof RefetchTimeoutError) && attempt < 1,
  });

  if (detail.isPending && !detail.data && !detail.isError) {
    return <div className="px-3 py-4 text-xs text-muted-foreground">Loading repeats for {toolName}…</div>;
  }
  if (detail.error && !detail.data) {
    return (
      <div className="flex items-center gap-2 px-3 py-4 text-xs text-rose-700 dark:text-rose-300">
        <AlertTriangle className="h-3.5 w-3.5" />
        {detail.error instanceof Error ? detail.error.message : "Failed to load the repeats for this tool."}
        <Button size="sm" variant="outline" onClick={() => void detail.refetch()}>
          Retry
        </Button>
        <ErrorAlchemyMenu error={detail.error.message} />
      </div>
    );
  }

  const rows = detail.data ?? [];
  if (rows.length === 0) {
    return (
      <div className="px-3 py-4 text-xs text-muted-foreground">
        No individual repeats are readable for {toolName} in this window.
      </div>
    );
  }

  return (
    <div className="px-3 py-3">
      <MatrxDataTable<ToolRefetchDetailRow>
        data={rows}
        columns={DETAIL_COLUMNS}
        getRowId={(row) => row.repeatToolCallId}
        pageSize={DETAIL_PAGE_SIZE}
        toolbar={{ search: true, searchPlaceholder: "Search loaded repeats…" }}
        coverage={{
          loaded: rows.length,
          total: expectedRepeats,
          answeredBy: "client",
          noun: "repeat",
        }}
        query={{
          mode: "controlled-append",
          state: tableState,
          onStateChange: setTableState,
          sourceProcessing: { search: "local", columnFilters: "local", sort: "local" },
          scroll: {
            mode: "suspended",
            reason: "Repeat detail reads an expensive derived view, so another source page loads only on request.",
          },
          pagination: {
            queryKey: `tool-refetch:${toolName}:${win}`,
            rows,
            loading: detail.isPending,
            isFetchingNextPage: detail.isFetching && pages > 1,
            error: detail.error instanceof Error ? detail.error : null,
            hasNextPage:
              (detail.isFetching || rows.length >= pages * DETAIL_PAGE_SIZE) && rows.length < expectedRepeats,
            loadNextPage: async () => {
              setPages((page) => page + 1);
            },
            refresh: () => {
              void detail.refetch();
            },
            retrySource: () => {
              void detail.refetch();
            },
            totalItems: expectedRepeats,
          },
        }}
      />
    </div>
  );
}

/* ── the console ───────────────────────────────────────────────────────────── */

export function ToolRefetchConsole() {
  const [win, setWin] = useState<RefetchWindow>("30d");
  // The package owns filtering, ranked search, hidden-column behavior, and
  // sorting. Its pre-pagination callback is therefore the only truthful source
  // for copy/export and the displayed-view totals below.
  const [visibleRows, setVisibleRows] = useState<ToolRefetchSummaryRow[]>([]);
  const table = useTableUrlState({
    tableId: "tool-refetch",
    defaultSort: { id: "sameDataRepeats", direction: "desc" },
    defaultPageSize: 50,
  });
  const report = useQuery({
    queryKey: ["admin", "tool-refetch", "summary", win],
    queryFn: () => getToolRefetchSummary(win),
    // A statement timeout is a verdict, not a blip. Retrying it silently is
    // what turned this page into a spinner that never resolved.
    retry: (attempt, err) => !(err instanceof RefetchTimeoutError) && attempt < 1,
  });

  const timedOut = report.error instanceof RefetchTimeoutError ? report.error : null;
  // Never "loading" once we know it failed — that is the dead state.
  const loading = report.isPending && !report.isError;
  const refreshing = report.isFetching;
  const error =
    report.error && !timedOut
      ? report.error instanceof Error
        ? report.error.message
        : "Failed to load the re-fetch report"
      : null;

  const rows = report.data?.rows ?? [];
  const columns = useMemo((): MatrxColumnDef<ToolRefetchSummaryRow>[] => [
    { id: "toolName", accessorKey: "toolName", header: "Tool", width: 240, cell: (row) => <span className="font-medium">{row.toolName}</span> },
    { id: "totalCalls", accessorKey: "totalCalls", header: "Calls", filter: "number", width: 90, cell: (row) => <span className="tabular-nums">{fmtCount(row.totalCalls)}</span> },
    { id: "repeats", accessorKey: "repeats", header: "Repeats", filter: "number", width: 90, cell: (row) => <span className="tabular-nums">{fmtCount(row.repeats)}</span> },
    { id: "repeatRate", accessorKey: "repeatRate", header: "Repeat %", filter: "number", width: 100, cell: (row) => <span className="tabular-nums">{fmtPct(row.repeatRate)}</span> },
    { id: "sameDataRepeats", accessorKey: "sameDataRepeats", header: "Same-data", filter: "number", width: 115, cell: (row) => <span className="font-semibold tabular-nums">{fmtCount(row.sameDataRepeats)}</span> },
    { id: "sameDataRate", accessorKey: "sameDataRate", header: "Same-data %", filter: "number", width: 125, cell: (row) => <span className={cn("tabular-nums", (row.sameDataRate ?? 0) >= 0.05 && "font-semibold text-rose-600 dark:text-rose-400")}>{fmtPct(row.sameDataRate)}</span> },
    { id: "newDataRepeats", accessorKey: "newDataRepeats", header: "New-data", filter: "number", width: 105, cell: (row) => <span className="tabular-nums text-muted-foreground">{fmtCount(row.newDataRepeats)}</span> },
    { id: "unknownDataRepeats", accessorKey: "unknownDataRepeats", header: "Unknown", filter: "number", width: 105, cell: (row) => <span className="tabular-nums text-muted-foreground">{fmtCount(row.unknownDataRepeats)}</span> },
    { id: "afterTrimRepeats", accessorKey: "afterTrimRepeats", header: "After trim", filter: "number", width: 105, cell: (row) => <span className="tabular-nums">{fmtCount(row.afterTrimRepeats)}</span> },
    { id: "medianGapCalls", accessorKey: "medianGapCalls", header: "Gap calls", filter: "number", width: 105, cell: (row) => <span className="tabular-nums">{fmtGapCalls(row.medianGapCalls)}</span> },
    { id: "medianGapSecs", accessorKey: "medianGapSecs", header: "Gap", filter: "number", width: 100, cell: (row) => <span className="tabular-nums">{fmtDuration(row.medianGapSecs)}</span> },
    { id: "charsRefetchedSameData", accessorKey: "charsRefetchedSameData", header: "Chars re-fetched", filter: "number", width: 135, cell: (row) => <span className="tabular-nums">{fmtCount(row.charsRefetchedSameData)}</span> },
    { id: "conversations", accessorKey: "conversations", header: "Convos", filter: "number", width: 90, cell: (row) => <span className="tabular-nums">{fmtCount(row.conversations)}</span> },
    { id: "lastRepeatAt", accessorKey: "lastRepeatAt", header: "Last repeat", width: 145, cell: (row) => <span className="whitespace-nowrap text-xs text-muted-foreground">{fmtWhen(row.lastRepeatAt)}</span> },
  ], []);
  const sortKey = table.state.sort?.id ?? "unsorted";
  const sortAsc = table.state.sort?.direction === "asc";
  const copyConfig = toolRefetchCopyConfig(
    {
      window: win,
      sortKey,
      sortAscending: sortAsc,
      truncated: report.data?.truncated ?? false,
      truncationNote: report.data?.truncationNote,
    },
  );

  const visibleTotals = useMemo(() => {
    return {
      repeats: visibleRows.reduce((n, r) => n + r.repeats, 0),
      sameData: visibleRows.reduce((n, r) => n + r.sameDataRepeats, 0),
      chars: visibleRows.reduce((n, r) => n + r.charsRefetchedSameData, 0),
    };
  }, [visibleRows]);

  return (
    <div className="space-y-4 p-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <Repeat2 className="h-6 w-6" />
              Tool re-fetch report
            </h1>
            <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
              How often an agent asks a tool for something it was already given.{" "}
              <strong>A repeat</strong> is a tool call whose name and arguments are identical to an
              earlier call in the same conversation. <strong>Same-data</strong> means the stored
              output hash matched, so the second call returned exactly what the first one did and
              the re-fetch bought nothing; <strong>new-data</strong> means the output actually
              changed, which is a legitimate refresh, not waste; <strong>unknown</strong> means the
              output was not stored, so neither claim can be made.{" "}
              <strong>After trim</strong> means the first result had already been cleared from the
              model&apos;s context by the context trimmer before the repeat — the agent could no
              longer see the answer it had.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              After-trim is answerable only where a per-iteration context-trim audit was recorded
              for that conversation — coverage widens from {TRIM_AUDIT_EPOCH} on and is partial
              before it, so a repeat with no audit reads <em>n/a</em>, never <em>No</em>. Measured
              on this database, rows on both sides of that date still come back unaudited, so treat
              the after-trim column as a floor.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Window</span>
          {REFETCH_WINDOWS.map((w) => (
            <Button
              key={w.key}
              size="sm"
              variant={w.key === win ? "default" : "outline"}
              onClick={() => {
                setWin(w.key);
              }}
            >
              {w.label}
            </Button>
          ))}
          {!loading && !error && !timedOut && (
            <span className="ml-2 text-xs text-muted-foreground">
              {fmtCount(visibleTotals.repeats)} repeats ·{" "}
              {fmtCount(visibleTotals.sameData)} same-data · {fmtCount(visibleTotals.chars)} chars re-fetched
              {win === "all" ? " (all-time rollup view)" : " (recomputed for this window)"}
            </span>
          )}
        </div>

        <AssistStrip surfaceName={ADMIN_REPORTING_SURFACE_NAME} />
      </header>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
          <AlertTriangle className="h-4 w-4" />
          <span className="flex-1">{error}</span>
          <Button size="sm" variant="outline" onClick={() => void report.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {/*
        NOTHING FAILS SILENTLY: the read hit a real server limit. Name the
        cause, name the fix, and hand over the window that does answer — never
        a spinner, and never an empty table pretending there is no data.
      */}
      {timedOut && (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">This window could not be answered — the query timed out.</div>
              <p className="mt-1 leading-snug">{timedOut.message}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pl-6">
            <Button size="sm" variant="outline" onClick={() => setWin("90d")}>
              Show 90 days instead
            </Button>
            <Button size="sm" variant="outline" onClick={() => void report.refetch()} disabled={refreshing}>
              Try again anyway
            </Button>
          </div>
        </div>
      )}

      {report.data?.truncationNote && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {report.data.truncationNote}
        </div>
      )}

      <MatrxDataTable
        query={{ mode: "controlled-local", state: table.state, onStateChange: table.onStateChange }}
        data={rows}
        columns={columns}
        getRowId={(row) => row.toolName}
        isLoading={loading}
        isFetching={refreshing}
        pageSize={50}
        emptyState={{ title: error || timedOut ? "The report could not be read" : "No repeated tool calls in this window" }}
        toolbar={{
          search: true,
          searchPlaceholder: "Search tools…",
          refresh: {
            onRefresh: () => void report.refetch(),
            label: "Refresh tool re-fetch report",
          },
        }}
        copy={copyConfig}
        onViewChange={setVisibleRows}
        detail={{ title: (row) => row.toolName, description: (row) => `${fmtCount(row.repeats)} repeats in the ${win} window`, render: (row) => <ToolDetail toolName={row.toolName} window={win} expectedRepeats={row.repeats} /> }}
      />

      <p className="text-xs text-muted-foreground">
        Sources: <code>chat.vw_tool_refetch_summary</code> (all-time rollup) and{" "}
        <code>chat.vw_tool_refetch</code> (one row per repeat). The summary view carries no date
        column, so a 7 / 30 / 90-day view is recomputed from the per-repeat rows, with total calls
        counted from <code>chat.tool_call</code> over the same window (types local / agent /
        external, undeleted). &ldquo;All time&rdquo; reads the summary view directly.
      </p>
    </div>
  );
}
