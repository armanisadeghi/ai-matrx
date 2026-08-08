// CX dashboard › Errors — canonical MatrxDataTable views over problem requests
// and tool-call errors. The old page rendered pending + max-tokens tables but
// never listed the error bucket itself; the merged Issue column fixes that.

"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Ban, Hourglass, Wrench } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { CxFiltersBar } from "@/features/cx-dashboard/components/CxFiltersBar";
import { CxEmptyState } from "@/features/cx-dashboard/components/CxEmptyState";
import { CxJsonViewer } from "@/features/cx-dashboard/components/CxJsonViewer";
import {
  formatDate,
  formatCost,
  formatTokens,
  formatDuration,
} from "@/features/cx-dashboard/utils/format";
import { exportToJSON } from "@/features/cx-dashboard/utils/export";
import type {
  CxUserRequest,
  CxToolCall,
} from "@/features/cx-dashboard/types/cxDashboardTypes";

type ErrorsData = {
  error_requests: CxUserRequest[];
  error_tool_calls: CxToolCall[];
};

type RequestIssue = "error" | "pending" | "max_tokens" | "other";

function requestIssue(r: CxUserRequest): RequestIssue {
  if (r.error || r.status === "error") return "error";
  if (r.status === "pending") return "pending";
  if (r.finish_reason === "max_tokens") return "max_tokens";
  return "other";
}

const ISSUE_LABELS: Record<RequestIssue, string> = {
  error: "Error",
  pending: "Pending (Python bug)",
  max_tokens: "Max tokens hit",
  other: "Other",
};

export function ErrorsContent({ errors }: { errors: ErrorsData }) {
  const router = useRouter();

  const pendingCount = errors.error_requests.filter(
    (r) => r.status === "pending",
  ).length;
  const maxTokensCount = errors.error_requests.filter(
    (r) => r.finish_reason === "max_tokens",
  ).length;
  const errorCount = errors.error_requests.filter(
    (r) => r.error || r.status === "error",
  ).length;

  const allIssues =
    errors.error_requests.length + errors.error_tool_calls.length;

  const requestColumns = useMemo((): MatrxColumnDef<CxUserRequest>[] => {
    return [
      {
        id: "issue",
        header: "Issue",
        accessorFn: (r) => ISSUE_LABELS[requestIssue(r)],
        filter: "select",
        width: 150,
        cell: (r) => {
          const issue = requestIssue(r);
          return (
            <Badge
              variant={issue === "error" ? "destructive" : "outline"}
              className="text-[10px]"
            >
              {ISSUE_LABELS[issue]}
            </Badge>
          );
        },
      },
      {
        id: "conversation_title",
        header: "Conversation",
        accessorFn: (r) => r.conversation_title ?? "",
        href: (r) => `/administration/chat/cx-dashboard/requests/${r.id}`,
        width: 240,
        cell: (r) => (
          <span className="block max-w-[220px] truncate">
            {r.conversation_title || (
              <span className="italic text-muted-foreground">Untitled</span>
            )}
          </span>
        ),
      },
      {
        id: "status",
        accessorKey: "status",
        header: "Status",
        filter: "select",
        width: 100,
        cell: (r) => <span className="text-xs">{r.status}</span>,
      },
      {
        id: "error",
        header: "Error",
        accessorFn: (r) => r.error ?? "",
        width: 240,
        cell: (r) =>
          r.error ? (
            <span className="block max-w-[220px] truncate text-xs text-red-500">
              {r.error}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "total_output_tokens",
        accessorKey: "total_output_tokens",
        header: "Out tokens",
        align: "right",
        width: 100,
        cell: (r) => (
          <span className="font-mono">{formatTokens(r.total_output_tokens)}</span>
        ),
      },
      {
        id: "total_cost",
        header: "Cost",
        accessorFn: (r) => Number(r.total_cost ?? 0),
        align: "right",
        width: 90,
        cell: (r) => (
          <span className="font-mono">{formatCost(Number(r.total_cost))}</span>
        ),
      },
      {
        id: "created_at",
        accessorKey: "created_at",
        header: "Created",
        width: 140,
        cell: (r) => (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {formatDate(r.created_at)}
          </span>
        ),
      },
      { id: "id", accessorKey: "id", header: "ID", cellKind: "uuid", width: 110 },
    ];
  }, []);

  const toolCallColumns = useMemo((): MatrxColumnDef<CxToolCall>[] => {
    return [
      {
        id: "tool_name",
        accessorKey: "tool_name",
        header: "Tool",
        width: 180,
        cell: (r) => <span className="font-mono text-xs">{r.tool_name}</span>,
      },
      {
        id: "tool_type",
        accessorKey: "tool_type",
        header: "Type",
        filter: "select",
        width: 110,
        cell: (r) => (
          <Badge variant="outline" className="text-[10px]">
            {r.tool_type}
          </Badge>
        ),
      },
      {
        id: "error_type",
        header: "Error type",
        accessorFn: (r) => r.error_type ?? "",
        filter: "select",
        width: 140,
        cell: (r) =>
          r.error_type ? (
            <Badge variant="destructive" className="text-[10px]">
              {r.error_type}
            </Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "error_message",
        header: "Message",
        accessorFn: (r) => r.error_message ?? "",
        width: 320,
        cell: (r) => (
          <span className="block max-w-[300px] truncate text-xs text-muted-foreground">
            {r.error_message ?? "—"}
          </span>
        ),
      },
      {
        id: "duration_ms",
        accessorKey: "duration_ms",
        header: "Duration",
        align: "right",
        width: 90,
        cell: (r) => (
          <span className="text-muted-foreground">
            {formatDuration(r.duration_ms)}
          </span>
        ),
      },
      {
        id: "created_at",
        accessorKey: "created_at",
        header: "Created",
        width: 140,
        cell: (r) => (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {formatDate(r.created_at)}
          </span>
        ),
      },
      {
        id: "conversation_id",
        accessorKey: "conversation_id",
        header: "Conversation",
        cellKind: "fk",
        width: 110,
        fk: {
          href: (id) =>
            `/administration/chat/cx-dashboard/conversations/${id}`,
        },
      },
      { id: "id", accessorKey: "id", header: "ID", cellKind: "uuid", width: 110 },
    ];
  }, []);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Errors & Issues
          <span className="ml-2 font-normal text-muted-foreground">
            {allIssues} total issues found
          </span>
        </h2>
      </div>

      <CxFiltersBar
        showSearch={false}
        showStatusFilter={false}
        onRefresh={() => router.refresh()}
        onExportJSON={() =>
          exportToJSON(
            [...errors.error_requests, ...errors.error_tool_calls],
            "errors",
          )
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
          <Hourglass className="h-4 w-4 text-amber-500" />
          <div>
            <p className="text-xs text-muted-foreground">Pending (Python Bug)</p>
            <p className="text-lg font-semibold">{pendingCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-orange-500/30 bg-orange-500/5 p-3">
          <Ban className="h-4 w-4 text-orange-500" />
          <div>
            <p className="text-xs text-muted-foreground">Max Tokens Hit</p>
            <p className="text-lg font-semibold">{maxTokensCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/5 p-3">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <div>
            <p className="text-xs text-muted-foreground">Errors</p>
            <p className="text-lg font-semibold">{errorCount}</p>
          </div>
        </div>
      </div>

      {/* Problem requests */}
      {errors.error_requests.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5" />
            Problem Requests ({errors.error_requests.length})
          </h3>
          <MatrxDataTable
            data={errors.error_requests}
            columns={requestColumns}
            getRowId={(r) => r.id}
            pageSize={25}
            emptyState={{ title: "No problem requests" }}
            toolbar={{ search: true, searchPlaceholder: "Search requests…" }}
            copy={{
              label: "Problem request",
              listLabel: "Problem requests (this view)",
              location: "/administration/chat/cx-dashboard/errors",
              rowKind: "cx-problem-request",
              listKind: "cx-problem-requests",
              humanRow: (r) =>
                [
                  `Request: ${r.id}`,
                  `Issue: ${ISSUE_LABELS[requestIssue(r)]}`,
                  `Conversation: ${r.conversation_title ?? "Untitled"}`,
                  `Status: ${r.status}${r.finish_reason ? ` (${r.finish_reason})` : ""}`,
                  `Cost: ${formatCost(Number(r.total_cost))}`,
                  `Created: ${r.created_at}`,
                  ...(r.error ? [`Error: ${r.error}`] : []),
                ].join("\n"),
              rowAttributes: (r) => ({
                id: r.id,
                issue: requestIssue(r),
                status: r.status,
              }),
            }}
            detail={{
              title: (r) => r.conversation_title ?? "Untitled request",
              render: (r) => (
                <div className="space-y-3 p-1">
                  {r.error && (
                    <div className="rounded border border-red-500/30 bg-red-500/5 p-2">
                      <p className="text-xs font-medium text-red-500">Error</p>
                      <pre className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                        {r.error}
                      </pre>
                    </div>
                  )}
                  <CxJsonViewer
                    data={r}
                    label="Full Request Data"
                    defaultCollapsed={false}
                  />
                </div>
              ),
            }}
          />
        </section>
      )}

      {/* Tool call errors */}
      {errors.error_tool_calls.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-xs font-medium text-red-500">
            <Wrench className="h-3.5 w-3.5" />
            Tool Call Errors ({errors.error_tool_calls.length})
          </h3>
          <MatrxDataTable
            data={errors.error_tool_calls}
            columns={toolCallColumns}
            getRowId={(r) => r.id}
            pageSize={25}
            emptyState={{ title: "No tool call errors" }}
            toolbar={{ search: true, searchPlaceholder: "Search tool calls…" }}
            copy={{
              label: "Tool call error",
              listLabel: "Tool call errors (this view)",
              location: "/administration/chat/cx-dashboard/errors",
              rowKind: "cx-tool-call-error",
              listKind: "cx-tool-call-errors",
              humanRow: (r) =>
                [
                  `Tool: ${r.tool_name} (${r.tool_type})`,
                  `Error: ${r.error_type ?? "—"} — ${r.error_message ?? "—"}`,
                  `Duration: ${formatDuration(r.duration_ms)}`,
                  `Conversation: ${r.conversation_id}`,
                  `Created: ${r.created_at}`,
                ].join("\n"),
              rowAttributes: (r) => ({
                id: r.id,
                tool: r.tool_name,
                error_type: r.error_type,
              }),
            }}
            detail={{
              title: (r) => r.tool_name,
              description: (r) => r.error_type ?? undefined,
              render: (r) => (
                <div className="space-y-3 p-1">
                  {r.error_message && (
                    <div className="rounded border border-red-500/30 bg-red-500/5 p-2">
                      <p className="text-xs font-medium text-red-500">
                        {r.error_type ?? "Error"}
                      </p>
                      <pre className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                        {r.error_message}
                      </pre>
                    </div>
                  )}
                  <CxJsonViewer
                    data={r}
                    label="Full Tool Call Data"
                    defaultCollapsed={false}
                  />
                </div>
              ),
            }}
          />
        </section>
      )}

      {/* All clear */}
      {allIssues === 0 && (
        <CxEmptyState
          title="No errors found"
          description="All requests completed successfully."
        />
      )}

      {/* Raw error data */}
      <CxJsonViewer data={errors} label="Raw Error Data (Debug)" />
    </div>
  );
}
