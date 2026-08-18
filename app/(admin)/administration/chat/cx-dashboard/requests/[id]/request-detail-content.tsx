"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { CxJsonViewer } from "@/features/cx-dashboard/components/CxJsonViewer";
import { CxEmptyState } from "@/features/cx-dashboard/components/CxEmptyState";
import { CxCostVerificationModal } from "@/features/cx-dashboard/components/CxCostVerificationModal";
import {
  formatDateFull,
  formatCost,
  formatTokens,
  formatDuration,
  statusBadgeVariant,
  truncateId,
  computeDuration,
} from "@/features/cx-dashboard/utils/format";
import { originClassLabel } from "@/features/agents/redux/conversation-history/source-registry";
import { exportToJSON } from "@/features/cx-dashboard/utils/export";
import type {
  CxUserRequest,
  CxRequest,
  CxToolCall,
  CxCostVerification,
} from "@/features/cx-dashboard/types/cxDashboardTypes";
import {
  ArrowLeft,
  ExternalLink,
  Download,
  Zap,
  Wrench,
  DollarSign,
  Clock,
  Hash,
  AlertTriangle,
  CheckCircle,
  Info,
} from "lucide-react";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_CX_DASHBOARD_SURFACE_NAME,
  createAdminCxDashboardScope,
} from "@/features/surfaces/manifests/admin-cx-dashboard.manifest";

type Detail = {
  user_request: CxUserRequest;
  requests: CxRequest[];
  tool_calls: CxToolCall[];
  cost_verification: CxCostVerification;
};

const apiRequestColumns: MatrxColumnDef<CxRequest>[] = [
  {
    id: "iteration",
    accessorKey: "iteration",
    header: "Iter",
    width: 60,
    cell: (r) => <span className="font-mono text-xs">{r.iteration}</span>,
  },
  {
    id: "model",
    header: "Model",
    accessorFn: (r) => r.model_name ?? "",
    width: 160,
    cell: (r) => (
      <span className="block max-w-[150px] truncate text-xs">
        {r.model_name || "—"}
      </span>
    ),
  },
  {
    id: "input_tokens",
    accessorKey: "input_tokens",
    header: "Input",
    align: "right",
    width: 90,
    cell: (r) => (
      <span className="font-mono">{formatTokens(r.input_tokens)}</span>
    ),
  },
  {
    id: "output_tokens",
    accessorKey: "output_tokens",
    header: "Output",
    align: "right",
    width: 90,
    cell: (r) => (
      <span className="font-mono">{formatTokens(r.output_tokens)}</span>
    ),
  },
  {
    id: "cached_tokens",
    accessorKey: "cached_tokens",
    header: "Cached",
    align: "right",
    width: 90,
    cell: (r) => (
      <span className="font-mono">{formatTokens(r.cached_tokens)}</span>
    ),
  },
  {
    id: "cost",
    header: "Cost",
    accessorFn: (r) => Number(r.cost ?? 0),
    align: "right",
    width: 90,
    cell: (r) => (
      <span className="font-mono">{formatCost(Number(r.cost))}</span>
    ),
  },
  {
    id: "api_duration_ms",
    accessorKey: "api_duration_ms",
    header: "Duration",
    align: "right",
    width: 90,
    cell: (r) => (
      <span className="text-muted-foreground">
        {formatDuration(r.api_duration_ms)}
      </span>
    ),
  },
  {
    id: "finish_reason",
    header: "Finish",
    accessorFn: (r) => r.finish_reason ?? "",
    filter: "select",
    width: 110,
    cell: (r) =>
      r.finish_reason ? (
        <Badge
          variant={r.finish_reason === "stop" ? "outline" : "secondary"}
          className="text-[10px]"
        >
          {r.finish_reason}
        </Badge>
      ) : (
        <span className="text-[10px] italic text-muted-foreground">
          intermediate
        </span>
      ),
  },
];

export function RequestDetailContent({ detail }: { detail: Detail }) {
  const router = useRouter();
  const { user_request: ur, requests, tool_calls, cost_verification } = detail;
  const dur = computeDuration(
    ur.created_at,
    ur.completed_at,
    ur.total_duration_ms,
  );

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_CX_DASHBOARD_SURFACE_NAME}
      getScope={() =>
        createAdminCxDashboardScope({
          dashboard_section: "request_detail",
          current_request_id: ur.id,
          current_user_request: {
            id: ur.id,
            conversation_id: ur.conversation_id,
            conversation_title: ur.conversation_title,
            status: ur.status,
            finish_reason: ur.finish_reason,
            iterations: ur.iterations,
            total_tool_calls: ur.total_tool_calls,
            total_input_tokens: ur.total_input_tokens,
            total_output_tokens: ur.total_output_tokens,
            total_cached_tokens: ur.total_cached_tokens,
            total_tokens: ur.total_tokens,
            total_cost: ur.total_cost,
            total_duration_ms: ur.total_duration_ms,
            api_duration_ms: ur.api_duration_ms,
            error: ur.error,
            model_name: ur.model_name,
            provider: ur.provider,
            created_at: ur.created_at,
            completed_at: ur.completed_at,
          },
          current_request_api_iterations: requests.map((r) => ({
            iteration: r.iteration,
            model_name: r.model_name,
            input_tokens: r.input_tokens,
            output_tokens: r.output_tokens,
            cached_tokens: r.cached_tokens,
            cost: r.cost,
            api_duration_ms: r.api_duration_ms,
            finish_reason: r.finish_reason,
          })),
          current_request_tool_calls: tool_calls.map((t) => ({
            tool_name: t.tool_name,
            tool_type: t.tool_type,
            status: t.status,
            is_error: t.is_error,
            error_type: t.error_type,
            error_message: t.error_message,
            arguments: t.arguments,
            output: t.output,
            cost_usd: t.cost_usd,
            duration_ms: t.duration_ms,
          })),
          current_request_cost_verification: cost_verification,
        })
      }
      isEditable={false}
    >
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 mt-0.5"
            onClick={() => router.back()}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold">User Request Detail</h2>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
              <span className="font-mono">{truncateId(ur.id, 16)}</span>
              <Badge
                variant={statusBadgeVariant(ur.status)}
                className="text-[10px]"
              >
                {ur.status}
              </Badge>
              {ur.finish_reason && (
                <Badge
                  variant={
                    ur.finish_reason === "stop" ? "outline" : "secondary"
                  }
                  className="text-[10px]"
                >
                  {ur.finish_reason}
                </Badge>
              )}
              {ur.origin_class && (
                <Badge
                  variant="outline"
                  className="text-[10px]"
                  title="Server-derived provenance (who initiated this request)"
                >
                  {originClassLabel(ur.origin_class)}
                </Badge>
              )}
              <span>{formatDateFull(ur.created_at)}</span>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() =>
              exportToJSON(
                [detail.user_request, ...detail.requests],
                "request-detail",
              )
            }
          >
            <Download className="w-3 h-3 mr-1" />
            Export
          </Button>
        </div>

        {/* Conversation link */}
        <Link
          href={`/administration/chat/cx-dashboard/conversations/${ur.conversation_id}`}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground p-2 rounded border border-border/50 bg-muted/20 transition-colors"
        >
          <span>Conversation:</span>
          <span className="font-medium text-foreground">
            {ur.conversation_title || "Untitled"}
          </span>
          <span className="font-mono">
            {truncateId(ur.conversation_id, 12)}
          </span>
          <ExternalLink className="w-3 h-3 ml-auto" />
        </Link>

        {/* KPI summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          <div className="flex flex-col gap-0.5 p-2 rounded border border-border bg-card">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <DollarSign className="w-3 h-3" />
              Cost
            </span>
            <CxCostVerificationModal verification={cost_verification}>
              <span className="text-sm font-semibold font-mono cursor-pointer hover:text-primary flex items-center gap-1">
                {formatCost(Number(ur.total_cost))}
                {cost_verification.has_discrepancy ? (
                  <AlertTriangle className="w-3 h-3 text-amber-500" />
                ) : (
                  <CheckCircle className="w-3 h-3 text-emerald-500" />
                )}
              </span>
            </CxCostVerificationModal>
          </div>
          <div className="flex flex-col gap-0.5 p-2 rounded border border-border bg-card">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Hash className="w-3 h-3" />
              Tokens
            </span>
            <span className="text-sm font-semibold font-mono">
              {formatTokens(ur.total_tokens)}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {formatTokens(ur.total_input_tokens)} in /{" "}
              {formatTokens(ur.total_output_tokens)} out
            </span>
          </div>
          <div className="flex flex-col gap-0.5 p-2 rounded border border-border bg-card">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Duration
            </span>
            <span className="text-sm font-semibold">{formatDuration(dur)}</span>
            {ur.api_duration_ms && (
              <span className="text-[10px] text-muted-foreground">
                API: {formatDuration(ur.api_duration_ms)}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-0.5 p-2 rounded border border-border bg-card">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Zap className="w-3 h-3" />
              Iterations
            </span>
            <span className="text-sm font-semibold">{ur.iterations}</span>
          </div>
          <div className="flex flex-col gap-0.5 p-2 rounded border border-border bg-card">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Wrench className="w-3 h-3" />
              Tool Calls
            </span>
            <span className="text-sm font-semibold">{ur.total_tool_calls}</span>
          </div>
          <div className="flex flex-col gap-0.5 p-2 rounded border border-border bg-card">
            <span className="text-[10px] text-muted-foreground">Model</span>
            <span className="text-xs font-medium truncate">
              {ur.model_name || "-"}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {ur.provider || "-"}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 p-2 rounded border border-border bg-card">
            <span className="text-[10px] text-muted-foreground">
              Cached Tokens
            </span>
            <span className="text-sm font-semibold font-mono">
              {formatTokens(ur.total_cached_tokens)}
            </span>
          </div>
        </div>

        {/* Error display */}
        {ur.error && (
          <div className="flex items-start gap-2 p-3 rounded border border-red-500/30 bg-red-500/5">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-red-500">Error</p>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap mt-1">
                {ur.error}
              </pre>
            </div>
          </div>
        )}

        {/* API Requests (iterations) */}
        <div className="border border-border rounded-md bg-card">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <Zap className="w-3.5 h-3.5 text-muted-foreground" />
            <h3 className="text-xs font-medium text-muted-foreground">
              API Requests ({requests.length} iterations)
            </h3>
          </div>
          {requests.length === 0 ? (
            <CxEmptyState title="No API requests found" />
          ) : (
            <div className="p-2">
              <MatrxDataTable
                urlState={{ id: "cx-request-tools" }}
                data={requests}
                columns={apiRequestColumns}
                getRowId={(r) => r.id}
                pageSize={25}
                emptyState={{ title: "No API requests found" }}
                toolbar={{
                  search: true,
                  searchPlaceholder: "Search iterations…",
                }}
                copy={{
                  label: "API request",
                  listLabel: "API requests (this view)",
                  location: "/administration/chat/cx-dashboard/requests",
                  rowKind: "cx-api-request",
                  listKind: "cx-api-requests",
                  humanRow: (r) =>
                    [
                      `Iteration: ${r.iteration}`,
                      `Model: ${r.model_name ?? "—"}`,
                      `Tokens: ${formatTokens(r.input_tokens)} in / ${formatTokens(r.output_tokens)} out / ${formatTokens(r.cached_tokens)} cached`,
                      `Cost: ${formatCost(Number(r.cost))}`,
                      `Duration: ${formatDuration(r.api_duration_ms)}`,
                      `Finish: ${r.finish_reason ?? "intermediate"}`,
                    ].join("\n"),
                  rowAttributes: (r) => ({ id: r.id, iteration: r.iteration }),
                }}
                detail={{ title: (r) => `Iteration ${r.iteration}` }}
              />
            </div>
          )}
        </div>

        {/* Tool Calls */}
        {tool_calls.length > 0 && (
          <div className="border border-border rounded-md bg-card">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <Wrench className="w-3.5 h-3.5 text-muted-foreground" />
              <h3 className="text-xs font-medium text-muted-foreground">
                Tool Calls ({tool_calls.length})
              </h3>
            </div>
            <div className="divide-y divide-border/50">
              {tool_calls.map((tc) => (
                <div key={tc.id} className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs font-medium">
                      {tc.tool_name}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {tc.tool_type}
                    </Badge>
                    <Badge
                      variant={statusBadgeVariant(tc.status)}
                      className="text-[10px]"
                    >
                      {tc.status}
                    </Badge>
                    {tc.is_error && (
                      <Badge variant="destructive" className="text-[10px]">
                        Error
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      iter {tc.iteration} · {formatDuration(tc.duration_ms)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] text-muted-foreground mb-1">
                    {tc.input_tokens ? (
                      <span>{formatTokens(tc.input_tokens)} in</span>
                    ) : null}
                    {tc.output_tokens ? (
                      <span>{formatTokens(tc.output_tokens)} out</span>
                    ) : null}
                    {Number(tc.cost_usd) > 0 && (
                      <span className="font-mono">
                        {formatCost(Number(tc.cost_usd))}
                      </span>
                    )}
                    {tc.retry_count ? (
                      <span>retries: {tc.retry_count}</span>
                    ) : null}
                  </div>
                  {tc.error_message && (
                    <div className="flex items-start gap-1.5 p-2 rounded bg-red-500/5 border border-red-500/20 mt-1">
                      <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0 mt-0.5" />
                      <div className="text-xs">
                        {tc.error_type && (
                          <span className="font-medium text-red-500">
                            {tc.error_type}:{" "}
                          </span>
                        )}
                        <span className="text-muted-foreground">
                          {tc.error_message}
                        </span>
                      </div>
                    </div>
                  )}
                  <CxJsonViewer
                    data={{
                      arguments: tc.arguments,
                      output: tc.output?.slice(0, 500),
                      metadata: tc.metadata,
                    }}
                    label="Tool Call Details"
                    maxHeight="120px"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Debug JSON */}
        <CxJsonViewer data={ur} label="User Request Raw Data" />
        <CxJsonViewer
          data={cost_verification}
          label="Cost Verification Details"
          defaultCollapsed={false}
        />
      </div>
    </SurfaceRuntimeProvider>
  );
}
