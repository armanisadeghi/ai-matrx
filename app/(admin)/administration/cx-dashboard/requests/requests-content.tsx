"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CxFiltersBar } from "@/features/cx-dashboard/components/CxFiltersBar";
import { CxEmptyState } from "@/features/cx-dashboard/components/CxEmptyState";
import {
  formatDate,
  formatCost,
  formatTokens,
  formatDuration,
  statusBadgeVariant,
  truncateId,
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
import { ChevronRight, AlertTriangle, Wrench } from "lucide-react";

type Props = {
  result: CxPaginatedResponse<CxUserRequest>;
};

export function RequestsContent({ result }: Props) {
  const router = useRouter();

  const exportData = result.data.map((r) => ({
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
  }));

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          User Requests
          <span className="text-muted-foreground ml-2 font-normal">
            {result.total} total
          </span>
        </h2>
      </div>

      <CxFiltersBar
        showSearch={false}
        showStatusFilter
        statusOptions={["completed", "pending", "error"]}
        onRefresh={() => router.refresh()}
        onExportCSV={() => exportToCSV(exportData, "user-requests")}
        onExportJSON={() => exportToJSON(exportData, "user-requests")}
      />

      {result.data.length === 0 ? (
        <CxEmptyState />
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/30 border-b border-border text-muted-foreground">
                <th className="text-left py-2 px-3 font-medium">Request</th>
                <th className="text-center py-2 px-3 font-medium">Status</th>
                <th className="text-center py-2 px-3 font-medium">Iter</th>
                <th className="text-center py-2 px-3 font-medium">Tools</th>
                <th className="text-right py-2 px-3 font-medium">Tokens</th>
                <th className="text-right py-2 px-3 font-medium">Cost</th>
                <th className="text-right py-2 px-3 font-medium">Duration</th>
                <th className="text-right py-2 px-3 font-medium">Created</th>
                <th className="w-6"></th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((req) => {
                const dur = computeDuration(
                  req.created_at,
                  req.completed_at,
                  req.total_duration_ms,
                );
                return (
                  <tr
                    key={req.id}
                    className="border-b border-border/50 hover:bg-muted/20 cursor-pointer transition-colors"
                    onClick={() =>
                      router.push(
                        `/administration/cx-dashboard/requests/${req.id}`,
                      )
                    }
                  >
                    <td className="py-2 px-3">
                      <div className="min-w-0">
                        <p className="truncate max-w-[250px]">
                          {req.conversation_title || (
                            <span className="text-muted-foreground italic">
                              Untitled
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span className="font-mono">
                            {truncateId(req.id)}
                          </span>
                          {req.model_name && <span>· {req.model_name}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="text-center py-2 px-3">
                      <Badge
                        variant={statusBadgeVariant(req.status)}
                        className="text-[10px]"
                      >
                        {req.status}
                      </Badge>
                      {req.finish_reason && req.finish_reason !== "stop" && (
                        <div className="text-[10px] text-amber-500 mt-0.5">
                          {req.finish_reason}
                        </div>
                      )}
                    </td>
                    <td className="text-center py-2 px-3">{req.iterations}</td>
                    <td className="text-center py-2 px-3">
                      {req.total_tool_calls > 0 ? (
                        <span className="flex items-center justify-center gap-1">
                          <Wrench className="w-3 h-3 text-muted-foreground" />
                          {req.total_tool_calls}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="text-right py-2 px-3 font-mono">
                      <div>{formatTokens(req.total_tokens)}</div>
                      <div className="text-muted-foreground text-[10px]">
                        {formatTokens(req.total_input_tokens)} in /{" "}
                        {formatTokens(req.total_output_tokens)} out
                      </div>
                    </td>
                    <td className="text-right py-2 px-3 font-mono">
                      {formatCost(Number(req.total_cost))}
                    </td>
                    <td className="text-right py-2 px-3 text-muted-foreground">
                      {formatDuration(dur)}
                    </td>
                    <td className="text-right py-2 px-3 text-muted-foreground whitespace-nowrap">
                      {formatDate(req.created_at)}
                    </td>
                    <td className="px-1">
                      {req.error && (
                        <AlertTriangle className="w-3 h-3 text-red-500" />
                      )}
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {result.total_pages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
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
  );
}
