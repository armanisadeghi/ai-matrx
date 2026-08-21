// CX dashboard › Conversations — canonical MatrxDataTable over cx_conversation rows.
// Timeframe/status/search stay server-side via CxFiltersBar (URL params → server
// refetch); every fetched column still sorts + filters locally in the table.

"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GitBranch, MessageSquare } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { CxFiltersBar } from "@/features/cx-dashboard/components/CxFiltersBar";
import {
  formatRelativeTime,
  statusBadgeVariant,
} from "@/features/cx-dashboard/utils/format";
import {
  exportToCSV,
  exportToJSON,
} from "@/features/cx-dashboard/utils/export";
import type {
  CxConversation,
  CxPaginatedResponse,
} from "@/features/cx-dashboard/types/cxDashboardTypes";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_CX_DASHBOARD_SURFACE_NAME,
  createAdminCxDashboardScope,
} from "@/features/surfaces/manifests/admin-cx-dashboard.manifest";

type Props = {
  result: CxPaginatedResponse<CxConversation>;
};

const detailHref = (id: string) =>
  `/administration/chat/cx-dashboard/conversations/${id}`;

export function ConversationsContent({ result }: Props) {
  const router = useRouter();

  const exportData = useMemo(
    () =>
      result.data.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        message_count: c.message_count,
        model: c.model_name,
        provider: c.provider,
        parent_id: c.parent_conversation_id,
        created_at: c.created_at,
        updated_at: c.updated_at,
      })),
    [result.data],
  );

  const columns = useMemo((): MatrxColumnDef<CxConversation>[] => {
    return [
      {
        id: "title",
        header: "Conversation",
        accessorFn: (r) => r.title ?? "",
        href: (r) => detailHref(r.id),
        width: 300,
        cell: (r) => (
          <span className="flex items-center gap-2">
            {r.parent_conversation_id && (
              <GitBranch className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
            )}
            <span className="truncate font-medium">
              {r.title || (
                <span className="italic text-muted-foreground">Untitled</span>
              )}
            </span>
          </span>
        ),
      },
      {
        id: "model",
        header: "Model",
        accessorFn: (r) => r.model_name ?? "",
        width: 160,
        cell: (r) =>
          r.model_name ? (
            <div className="min-w-0">
              <p className="max-w-[140px] truncate text-xs">{r.model_name}</p>
              <p className="text-[10px] text-muted-foreground">{r.provider}</p>
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "message_count",
        accessorKey: "message_count",
        header: "Msgs",
        align: "center",
        width: 80,
        cell: (r) => (
          <span className="inline-flex items-center gap-1 text-xs">
            <MessageSquare className="h-3 w-3 text-muted-foreground" />
            {r.message_count}
          </span>
        ),
      },
      {
        id: "status",
        accessorKey: "status",
        header: "Status",
        filter: "select",
        align: "center",
        width: 100,
        cell: (r) => (
          <Badge variant={statusBadgeVariant(r.status)} className="text-[10px]">
            {r.status}
          </Badge>
        ),
      },
      {
        id: "parent_conversation_id",
        accessorKey: "parent_conversation_id",
        header: "Parent",
        cellKind: "fk",
        width: 110,
        fk: { href: (id) => detailHref(id) },
      },
      {
        id: "created_at",
        accessorKey: "created_at",
        header: "Created",
        width: 120,
        cell: (r) => (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {formatRelativeTime(r.created_at)}
          </span>
        ),
      },
      {
        id: "id",
        accessorKey: "id",
        header: "ID",
        cellKind: "uuid",
        width: 110,
      },
    ];
  }, []);

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_CX_DASHBOARD_SURFACE_NAME}
      getScope={() =>
        createAdminCxDashboardScope({
          dashboard_section: "conversations",
          conversation_list_results: result.data.map((c) => ({
            id: c.id,
            title: c.title,
            status: c.status,
            message_count: c.message_count,
            model_name: c.model_name,
            provider: c.provider,
            parent_conversation_id: c.parent_conversation_id,
            created_at: c.created_at,
          })),
          conversation_list_total: result.total,
        })
      }
      isEditable={false}
    >
      <div className="flex h-full min-h-0 flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold">
          Conversations
          <span className="ml-2 font-normal text-muted-foreground">
            {result.total} total
          </span>
        </h2>

        <div className="min-h-0 flex-1">
          <MatrxDataTable
            urlState={{ id: "cx-conversations" }}
            data={result.data}
            columns={columns}
            getRowId={(r) => r.id}
            pageSize={0}
            emptyState={{ title: "No conversations match" }}
            toolbar={{
              search: true,
              searchPlaceholder: "Filter fetched page…",
              facets: [
                {
                  type: "custom",
                  id: "server-filters",
                  render: () => (
                    <CxFiltersBar
                      showSearch
                      showStatusFilter
                      statusOptions={["active", "archived"]}
                      onRefresh={() => router.refresh()}
                      onExportCSV={() =>
                        exportToCSV(exportData, "conversations")
                      }
                      onExportJSON={() =>
                        exportToJSON(exportData, "conversations")
                      }
                    />
                  ),
                },
              ],
            }}
            copy={{
              label: "CX conversation",
              listLabel: "CX conversations (this view)",
              location: "/administration/chat/cx-dashboard/conversations",
              rowKind: "cx-conversation",
              listKind: "cx-conversations",
              humanRow: (r) =>
                [
                  `Title: ${r.title ?? "Untitled"}`,
                  `Status: ${r.status}`,
                  `Messages: ${r.message_count}`,
                  `Model: ${r.model_name ?? "—"} (${r.provider ?? "—"})`,
                  `Parent: ${r.parent_conversation_id ?? "—"}`,
                  `Created: ${r.created_at}`,
                ].join("\n"),
              rowAttributes: (r) => ({ id: r.id, status: r.status }),
            }}
            detail={{
              title: (r) => r.title ?? "Untitled conversation",
              description: (r) => r.description ?? undefined,
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
