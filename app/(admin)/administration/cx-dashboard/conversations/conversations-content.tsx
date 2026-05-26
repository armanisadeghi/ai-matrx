"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { CxFiltersBar } from "@/features/cx-dashboard/components/CxFiltersBar";
import { CxEmptyState } from "@/features/cx-dashboard/components/CxEmptyState";
import {
  formatDate,
  formatRelativeTime,
  statusBadgeVariant,
  truncateId,
} from "@/features/cx-dashboard/utils/format";
import {
  exportToCSV,
  exportToJSON,
} from "@/features/cx-dashboard/utils/export";
import type {
  CxConversation,
  CxPaginatedResponse,
} from "@/features/cx-dashboard/types/cxDashboardTypes";
import { ChevronRight, GitBranch, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  result: CxPaginatedResponse<CxConversation>;
};

export function ConversationsContent({ result }: Props) {
  const router = useRouter();

  const exportData = result.data.map((c) => ({
    id: c.id,
    title: c.title,
    status: c.status,
    message_count: c.message_count,
    model: c.model_name,
    provider: c.provider,
    parent_id: c.parent_conversation_id,
    created_at: c.created_at,
    updated_at: c.updated_at,
  }));

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Conversations
          <span className="text-muted-foreground ml-2 font-normal">
            {result.total} total
          </span>
        </h2>
      </div>

      <CxFiltersBar
        showSearch
        showStatusFilter
        statusOptions={["active", "archived"]}
        onRefresh={() => router.refresh()}
        onExportCSV={() => exportToCSV(exportData, "conversations")}
        onExportJSON={() => exportToJSON(exportData, "conversations")}
      />

      {result.data.length === 0 ? (
        <CxEmptyState />
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/30 border-b border-border text-muted-foreground">
                <th className="text-left py-2 px-3 font-medium">
                  Conversation
                </th>
                <th className="text-left py-2 px-3 font-medium">Model</th>
                <th className="text-center py-2 px-3 font-medium">Msgs</th>
                <th className="text-center py-2 px-3 font-medium">Status</th>
                <th className="text-left py-2 px-3 font-medium">Parent</th>
                <th className="text-right py-2 px-3 font-medium">Created</th>
                <th className="text-right py-2 px-3 font-medium w-8"></th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((conv) => (
                <tr
                  key={conv.id}
                  className="border-b border-border/50 hover:bg-muted/20 cursor-pointer transition-colors"
                  onClick={() =>
                    router.push(
                      `/administration/cx-dashboard/conversations/${conv.id}`,
                    )
                  }
                >
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      {conv.parent_conversation_id && (
                        <GitBranch className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium truncate max-w-[300px]">
                          {conv.title || (
                            <span className="text-muted-foreground italic">
                              Untitled
                            </span>
                          )}
                        </p>
                        <p className="text-muted-foreground font-mono">
                          {truncateId(conv.id)}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2 px-3">
                    {conv.model_name ? (
                      <div>
                        <p className="truncate max-w-[140px]">
                          {conv.model_name}
                        </p>
                        <p className="text-muted-foreground">{conv.provider}</p>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="text-center py-2 px-3">
                    <div className="flex items-center justify-center gap-1">
                      <MessageSquare className="w-3 h-3 text-muted-foreground" />
                      {conv.message_count}
                    </div>
                  </td>
                  <td className="text-center py-2 px-3">
                    <Badge
                      variant={statusBadgeVariant(conv.status)}
                      className="text-[10px]"
                    >
                      {conv.status}
                    </Badge>
                  </td>
                  <td className="py-2 px-3 font-mono text-muted-foreground">
                    {conv.parent_conversation_id
                      ? truncateId(conv.parent_conversation_id)
                      : "-"}
                  </td>
                  <td className="text-right py-2 px-3 text-muted-foreground whitespace-nowrap">
                    {formatRelativeTime(conv.created_at)}
                  </td>
                  <td className="text-right py-2 px-1">
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
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
