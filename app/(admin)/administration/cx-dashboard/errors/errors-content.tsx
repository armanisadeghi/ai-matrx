"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { CxFiltersBar } from "@/features/cx-dashboard/components/CxFiltersBar";
import { CxEmptyState } from "@/features/cx-dashboard/components/CxEmptyState";
import { CxJsonViewer } from "@/features/cx-dashboard/components/CxJsonViewer";
import {
  formatDate, formatCost, formatTokens, formatDuration,
  statusBadgeVariant, truncateId,
} from "@/features/cx-dashboard/utils/format";
import { exportToCSV, exportToJSON } from "@/features/cx-dashboard/utils/export";
import { AlertTriangle, ExternalLink, Ban, Hourglass, Wrench } from "lucide-react";

type ErrorsData = {
  error_requests: any[];
  error_tool_calls: any[];
};

export function ErrorsContent({ errors }: { errors: ErrorsData }) {
  const router = useRouter();

  const pendingRequests = errors.error_requests.filter((r) => r.status === "pending");
  const maxTokensRequests = errors.error_requests.filter((r) => r.finish_reason === "max_tokens");
  const errorRequests = errors.error_requests.filter((r) => r.error || r.status === "error");

  const allIssues = errors.error_requests.length + errors.error_tool_calls.length;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Errors & Issues
          <span className="text-muted-foreground ml-2 font-normal">{allIssues} total issues found</span>
        </h2>
      </div>

      <CxFiltersBar
        showSearch={false}
        showStatusFilter={false}
        onRefresh={() => router.refresh()}
        onExportJSON={() => exportToJSON(errors as any, "errors")}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="flex items-center gap-2 p-3 rounded-md border border-amber-500/30 bg-amber-500/5">
          <Hourglass className="w-4 h-4 text-amber-500" />
          <div>
            <p className="text-xs text-muted-foreground">Pending (Python Bug)</p>
            <p className="text-lg font-semibold">{pendingRequests.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 p-3 rounded-md border border-orange-500/30 bg-orange-500/5">
          <Ban className="w-4 h-4 text-orange-500" />
          <div>
            <p className="text-xs text-muted-foreground">Max Tokens Hit</p>
            <p className="text-lg font-semibold">{maxTokensRequests.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 p-3 rounded-md border border-red-500/30 bg-red-500/5">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <div>
            <p className="text-xs text-muted-foreground">Errors</p>
            <p className="text-lg font-semibold">{errorRequests.length}</p>
          </div>
        </div>
      </div>

      {/* Pending requests — known bug */}
      {pendingRequests.length > 0 && (
        <div className="border border-amber-500/30 rounded-md bg-card">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-500/20 bg-amber-500/5">
            <Hourglass className="w-3.5 h-3.5 text-amber-500" />
            <h3 className="text-xs font-medium text-amber-500">
              Pending Requests — Known Python Bug ({pendingRequests.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-1.5 px-3 font-medium">ID</th>
                  <th className="text-left py-1.5 px-3 font-medium">Conversation</th>
                  <th className="text-right py-1.5 px-3 font-medium">Tokens</th>
                  <th className="text-right py-1.5 px-3 font-medium">Cost</th>
                  <th className="text-right py-1.5 px-3 font-medium">Created</th>
                  <th className="w-6"></th>
                </tr>
              </thead>
              <tbody>
                {pendingRequests.map((r: any) => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="py-1.5 px-3 font-mono">
                      <Link href={`/administration/cx-dashboard/requests/${r.id}`} className="hover:text-primary">
                        {truncateId(r.id)}
                      </Link>
                    </td>
                    <td className="py-1.5 px-3 truncate max-w-[200px]">{r.conversation_title || "Untitled"}</td>
                    <td className="text-right py-1.5 px-3 font-mono">{formatTokens(r.total_tokens)}</td>
                    <td className="text-right py-1.5 px-3 font-mono">{formatCost(Number(r.total_cost))}</td>
                    <td className="text-right py-1.5 px-3 text-muted-foreground">{formatDate(r.created_at)}</td>
                    <td className="px-1">
                      <Link href={`/administration/cx-dashboard/requests/${r.id}`}>
                        <ExternalLink className="w-3 h-3 text-muted-foreground" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Max tokens requests */}
      {maxTokensRequests.length > 0 && (
        <div className="border border-orange-500/30 rounded-md bg-card">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-orange-500/20 bg-orange-500/5">
            <Ban className="w-3.5 h-3.5 text-orange-500" />
            <h3 className="text-xs font-medium text-orange-500">
              Max Tokens Hit ({maxTokensRequests.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-1.5 px-3 font-medium">ID</th>
                  <th className="text-left py-1.5 px-3 font-medium">Conversation</th>
                  <th className="text-right py-1.5 px-3 font-medium">Output Tokens</th>
                  <th className="text-right py-1.5 px-3 font-medium">Cost</th>
                  <th className="text-right py-1.5 px-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {maxTokensRequests.map((r: any) => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="py-1.5 px-3 font-mono">
                      <Link href={`/administration/cx-dashboard/requests/${r.id}`} className="hover:text-primary">
                        {truncateId(r.id)}
                      </Link>
                    </td>
                    <td className="py-1.5 px-3 truncate max-w-[200px]">{r.conversation_title || "Untitled"}</td>
                    <td className="text-right py-1.5 px-3 font-mono">{formatTokens(r.total_output_tokens)}</td>
                    <td className="text-right py-1.5 px-3 font-mono">{formatCost(Number(r.total_cost))}</td>
                    <td className="text-right py-1.5 px-3 text-muted-foreground">{formatDate(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tool call errors */}
      {errors.error_tool_calls.length > 0 && (
        <div className="border border-red-500/30 rounded-md bg-card">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-red-500/20 bg-red-500/5">
            <Wrench className="w-3.5 h-3.5 text-red-500" />
            <h3 className="text-xs font-medium text-red-500">
              Tool Call Errors ({errors.error_tool_calls.length})
            </h3>
          </div>
          <div className="divide-y divide-border/50">
            {errors.error_tool_calls.map((tc: any) => (
              <div key={tc.id} className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs font-medium">{tc.tool_name}</span>
                  <Badge variant="outline" className="text-[10px]">{tc.tool_type}</Badge>
                  {tc.error_type && <Badge variant="destructive" className="text-[10px]">{tc.error_type}</Badge>}
                  <span className="text-[10px] text-muted-foreground ml-auto">{formatDate(tc.created_at)}</span>
                </div>
                {tc.error_message && (
                  <pre className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{tc.error_message}</pre>
                )}
                <CxJsonViewer data={tc} label="Full Tool Call Data" maxHeight="120px" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All clear */}
      {allIssues === 0 && (
        <CxEmptyState title="No errors found" description="All requests completed successfully." />
      )}

      {/* Raw error data */}
      <CxJsonViewer data={errors} label="Raw Error Data (Debug)" />
    </div>
  );
}
