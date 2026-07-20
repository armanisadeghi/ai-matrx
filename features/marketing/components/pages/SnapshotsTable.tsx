"use client";

import { useRouter } from "next/navigation";
import { CameraOff } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import { useSnapshots } from "@/features/marketing/data/hooks";
import type { PageSnapshot } from "@/features/marketing/types";
import {
  formatCompactDate,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";

export function SnapshotsTable({ pageId }: { pageId: string }) {
  const router = useRouter();
  const { site } = useMarketingSite();
  const table = useMarketingTableState({
    defaultSort: { id: "captured_at", direction: "desc" },
  });
  const snapshots = useSnapshots(site.id, pageId, table.queryState);
  const columns: MatrxColumnDef<PageSnapshot>[] = [
    {
      id: "captured_at",
      accessorKey: "captured_at",
      header: "Captured",
      filter: false,
      cell: (row) => (
        <span className="whitespace-nowrap text-xs">
          {formatCompactDate(row.captured_at)}
        </span>
      ),
    },
    {
      id: "final_url",
      accessorKey: "final_url",
      header: "Final URL",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <span className="block min-w-72 max-w-2xl truncate font-mono text-xs">
          {row.final_url || "—"}
        </span>
      ),
    },
    {
      id: "http_status",
      accessorKey: "http_status",
      header: "HTTP",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="font-mono text-xs tabular-nums">
          {row.http_status ?? "—"}
        </span>
      ),
    },
    {
      id: "word_count",
      accessorKey: "word_count",
      header: "Words",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="text-xs tabular-nums">
          {row.word_count?.toLocaleString() ?? "—"}
        </span>
      ),
    },
    {
      id: "content_hash",
      accessorKey: "content_hash",
      header: "Content hash",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <span className="block max-w-48 truncate font-mono text-[11px] text-muted-foreground">
          {row.content_hash || "—"}
        </span>
      ),
    },
    {
      id: "session_id",
      accessorKey: "session_id",
      header: "Crawl",
      filter: false,
      sortable: false,
      cellKind: "uuid",
      fk: { href: (id) => `/marketing/sites/${site.id}/crawls/${id}` },
    },
  ];
  if (snapshots.isError)
    return (
      <QueryError
        error={snapshots.error}
        onRetry={() => void snapshots.refetch()}
      />
    );
  return (
    <main className="h-full overflow-hidden bg-textured p-3 sm:p-4">
      <MatrxDataTable<PageSnapshot>
        data={snapshots.data?.rows ?? []}
        columns={columns}
        getRowId={(row) => row.id}
        isLoading={snapshots.isLoading}
        isFetching={snapshots.isFetching}
        query={{
          mode: "controlled",
          state: table.state,
          totalItems: snapshots.data?.total ?? 0,
          onStateChange: table.onStateChange,
        }}
        toolbar={{
          searchPlaceholder: "Search final URL or content hash…",
        }}
        detail={{ enabled: false }}
        onRowOpen={(row) =>
          router.push(
            `/marketing/sites/${site.id}/pages/${pageId}/snapshots/${row.id}`,
          )
        }
        emptyState={{
          icon: <CameraOff className="h-8 w-8 text-muted-foreground" />,
          title: "No snapshots",
          description:
            "The page identity is stable even when no crawl has captured content for it yet.",
        }}
      />
    </main>
  );
}
