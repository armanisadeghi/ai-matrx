// CX dashboard › User requests — canonical MatrxDataTable over cx_user_request rows.
// Timeframe/status stay server-side via CxFiltersBar (URL params → server refetch);
// every fetched column still sorts + filters locally in the table.

"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Wrench } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { CxFiltersBar } from "@/features/cx-dashboard/components/CxFiltersBar";
import {
  formatDate,
  formatCost,
  formatTokens,
  formatDuration,
  statusBadgeVariant,
  computeDuration,
} from "@/features/cx-dashboard/utils/format";
import {
  exportToCSV,
  exportToJSON,
} from "@/features/cx-dashboard/utils/export";
import type {
  CxUserRequest,
  CxPaginatedResponse,
} from "@/features/cx-dashboard/types/cxDashboardTypes";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_CX_DASHBOARD_SURFACE_NAME,
  createAdminCxDashboardScope,
} from "@/features/surfaces/manifests/admin-cx-dashboard.manifest";

type Props = {
  result: CxPaginatedResponse<CxUserRequest>;
};

const detailHref = (id: string) =>
  `/administration/chat/cx-dashboard/requests/${id}`;

const requestDuration = (r: CxUserRequest) =>
  computeDuration(r.created_at, r.completed_at, r.total_duration_ms);

export function RequestsContent({ result }: Props) {
  const router = useRouter();

  const exportData = useMemo(
    () =>
      result.data.map((r) => ({
        id: r.id,
        conversation_id: r.conversation_id,
        conversation_title: r.conversation_title,
        status: r.status,
        finish_reason: r.finish_reason,
        iterations: r.iterations,
        total_tool_calls: r.total_tool_calls,
        total_input_tokens: r.total_input_tokens,
        total_output_tokens: r.total_output_tokens,
        total_cached_tokens: r.total_cached_tokens,
        total_tokens: r.total_tokens,
        total_cost: r.total_cost,
        total_duration_ms: r.computed_duration_ms,
        error: r.error,
        model: r.model_name,
        provider: r.provider,
        created_at: r.created_at,
        completed_at: r.completed_at,
      })),
    [result.data],
  );

  const columns = useMemo((): MatrxColumnDef<CxUserRequest>[] => {
    return [
      {
        id: "request",
        header: "Request",
        accessorFn: (r) => r.conversation_title ?? "",
        href: (r) => detailHref(r.id),
        width: 260,
        cell: (r) => (
          <div className="min-w-0">
            <p className="max-w-[250px] truncate">
              {r.conversation_title || (
                <span className="italic text-muted-foreground">Untitled</span>
              )}
            </p>
            {r.model_name && (
              <p className="text-[10px] text-muted-foreground">{r.model_name}</p>
            )}
          </div>
        ),
      },
      {
        id: "status",
        accessorKey: "status",
        header: "Status",
        filter: "select",
        align: "center",
        width: 110,
        cell: (r) => (
          <span className="inline-flex items-center gap-1">
            <Badge
              variant={statusBadgeVariant(r.status)}
              className="text-[10px]"
            >
              {r.status}
            </Badge>
            {r.error && <AlertTriangle className="h-3 w-3 text-red-500" />}
          </span>
        ),
      },
      {
        id: "finish_reason",
        header: "Finish",
        accessorFn: (r) => r.finish_reason ?? "",
        filter: "select",
        align: "center",
        width: 100,
        cell: (r) =>
          r.finish_reason ? (
            <span
              className={
                r.finish_reason === "stop"
                  ? "text-xs text-muted-foreground"
                  : "text-xs text-amber-500"
              }
            >
              {r.finish_reason}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "iterations",
        accessorKey: "iterations",
        header: "Iter",
        align: "center",
        width: 70,
      },
      {
        id: "total_tool_calls",
        accessorKey: "total_tool_calls",
        header: "Tools",
        align: "center",
        width: 80,
        cell: (r) =>
          r.total_tool_calls > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Wrench className="h-3 w-3 text-muted-foreground" />
              {r.total_tool_calls}
            </span>
          ) : (
            <span className="text-muted-foreground">0</span>
          ),
      },
      {
        id: "total_tokens",
        accessorKey: "total_tokens",
        header: "Tokens",
        align: "right",
        width: 120,
        cell: (r) => (
          <div className="text-right font-mono">
            <div>{formatTokens(r.total_tokens)}</div>
            <div className="text-[10px] text-muted-foreground">
              {formatTokens(r.total_input_tokens)} in /{" "}
              {formatTokens(r.total_output_tokens)} out
            </div>
          </div>
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
        id: "duration",
        header: "Duration",
        accessorFn: requestDuration,
        align: "right",
        width: 100,
        cell: (r) => (
          <span className="text-muted-foreground">
            {formatDuration(requestDuration(r))}
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
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_CX_DASHBOARD_SURFACE_NAME}
      getScope={() =>
        createAdminCxDashboardScope({
          dashboard_section: "requests",
          request_list_results: result.data.map((r) => ({
            id: r.id,
            conversation_id: r.conversation_id,
            conversation_title: r.conversation_title,
            status: r.status,
            finish_reason: r.finish_reason,
            iterations: r.iterations,
            total_tool_calls: r.total_tool_calls,
            total_tokens: r.total_tokens,
            total_cost: r.total_cost,
            model_name: r.model_name,
            created_at: r.created_at,
          })),
          request_list_total: result.total,
        })
      }
      isEditable={false}
    >
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold">
        User Requests
        <span className="ml-2 font-normal text-muted-foreground">
          {result.total} total
        </span>
      </h2>

      <div className="min-h-0 flex-1">
        <MatrxDataTable
          data={result.data}
          columns={columns}
          getRowId={(r) => r.id}
          pageSize={0}
          emptyState={{ title: "No requests match" }}
          toolbar={{
            search: true,
            searchPlaceholder: "Filter fetched page…",
            facets: [
              {
                type: "custom",
                id: "server-filters",
                render: () => (
                  <CxFiltersBar
                    showSearch={false}
                    showStatusFilter
                    statusOptions={["completed", "pending", "error"]}
                    onRefresh={() => router.refresh()}
                    onExportCSV={() => exportToCSV(exportData, "user-requests")}
                    onExportJSON={() =>
                      exportToJSON(exportData, "user-requests")
                    }
                  />
                ),
              },
            ],
          }}
          copy={{
            label: "CX user request",
            listLabel: "CX user requests (this view)",
            location: "/administration/chat/cx-dashboard/requests",
            rowKind: "cx-user-request",
            listKind: "cx-user-requests",
            humanRow: (r) =>
              [
                `Request: ${r.id}`,
                `Conversation: ${r.conversation_title ?? "Untitled"} (${r.conversation_id ?? "—"})`,
                `Status: ${r.status}${r.finish_reason ? ` (${r.finish_reason})` : ""}`,
                `Iterations: ${r.iterations} · Tool calls: ${r.total_tool_calls}`,
                `Tokens: ${formatTokens(r.total_tokens)} (${formatTokens(r.total_input_tokens)} in / ${formatTokens(r.total_output_tokens)} out)`,
                `Cost: ${formatCost(Number(r.total_cost))}`,
                `Duration: ${formatDuration(requestDuration(r))}`,
                `Created: ${r.created_at}`,
                ...(r.error ? [`Error: ${r.error}`] : []),
              ].join("\n"),
            rowAttributes: (r) => ({ id: r.id, status: r.status }),
          }}
          detail={{
            title: (r) => r.conversation_title ?? "Untitled request",
          }}
        />
      </div>

      {/* Server-side pagination over the full result set (table shows one fetched page) */}
      {result.total_pages > 1 && (
        <div className="flex shrink-0 items-center justify-between text-xs text-muted-foreground">
          <span>
            Page {result.page} of {result.total_pages}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={result.page <= 1}
              onClick={() => {
                const params = new URLSearchParams(window.location.search);
                params.set("page", String(result.page - 1));
                router.push(`?${params.toString()}`);
              }}
            >
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={result.page >= result.total_pages}
              onClick={() => {
                const params = new URLSearchParams(window.location.search);
                params.set("page", String(result.page + 1));
                router.push(`?${params.toString()}`);
              }}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
    </SurfaceRuntimeProvider>
  );
}
