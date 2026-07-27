"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CameraOff, Columns2 } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SnapshotCompare } from "@/features/marketing/components/pages/SnapshotCompare";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import { useSnapshots } from "@/features/marketing/data/hooks";
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";
import type { PageSnapshot } from "@/features/marketing/types";
import {
  formatCompactDate,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";

export function SnapshotsTable({ pageId }: { pageId: string }) {
  const router = useRouter();
  const { site, sitePath } = useMarketingSite();
  const table = useMarketingTableState({
    defaultSort: { id: "captured_at", direction: "desc" },
  });
  const snapshots = useSnapshots(site.id, pageId, table.queryState);
  // Compare mode — pick any two snapshots; a third pick replaces the oldest
  // selection. The diff panel renders above the table on demand.
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const toggleCompare = (snapshotId: string) => {
    setCompareIds((current) => {
      if (current.includes(snapshotId)) {
        return current.filter((id) => id !== snapshotId);
      }
      return current.length >= 2
        ? [...current.slice(1), snapshotId]
        : [...current, snapshotId];
    });
  };
  const [compareFirst, compareSecond] = compareIds;
  const columns: MatrxColumnDef<PageSnapshot>[] = [
    {
      id: "compare",
      header: "Compare",
      filter: false,
      sortable: false,
      cell: (row) => (
        <span
          className="flex items-center justify-center"
          onClick={(event) => event.stopPropagation()}
        >
          <Checkbox
            checked={compareIds.includes(row.id)}
            onCheckedChange={() => toggleCompare(row.id)}
            aria-label="Select snapshot for comparison"
          />
        </span>
      ),
    },
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
      fk: { href: (id) => `${sitePath}/crawls/${id}` },
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
    <main className="flex h-full flex-col gap-3 overflow-hidden bg-textured p-3 sm:p-4">
      {showCompare && compareFirst && compareSecond ? (
        <div className="max-h-[55%] shrink-0 overflow-y-auto">
          <SnapshotCompare
            pageId={pageId}
            firstId={compareFirst}
            secondId={compareSecond}
            onClose={() => setShowCompare(false)}
          />
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
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
          actions: (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              disabled={compareIds.length !== 2}
              onClick={() => setShowCompare(true)}
              title={
                compareIds.length === 2
                  ? "Compare the two selected snapshots"
                  : "Select two snapshots to compare"
              }
            >
              <Columns2 className="h-3.5 w-3.5" />
              Compare ({compareIds.length}/2)
            </Button>
          ),
        }}
        copy={{
          label: "Snapshot",
          listLabel: "All snapshots",
          location: webLocation("Page snapshot history"),
          rowKind: "web-snapshot",
          listKind: "web-snapshots-list",
          rowDescription:
            "One immutable content snapshot of this canonical page.",
          listDescription:
            "The currently loaded snapshot rows for this page (respecting search, filters, sort, and pagination).",
          humanRow: (row) =>
            humanLines([
              ["Snapshot", row.id],
              ["Captured", formatCompactDate(row.captured_at)],
              ["Final URL", row.final_url],
              ["HTTP", row.http_status],
              ["Words", row.word_count],
              ["Content hash", row.content_hash],
              ["Crawl session", row.session_id],
            ]),
          rowAttributes: (row) => ({
            snapshot_id: row.id,
            page_id: pageId,
            site_id: site.id,
          }),
          listAttributes: () => ({
            page_id: pageId,
            site_id: site.id,
            total_matching: snapshots.data?.total ?? 0,
          }),
        }}
        detail={{ enabled: false }}
        onRowOpen={(row) =>
          router.push(
            `${sitePath}/pages/${pageId}/snapshots/${row.id}`,
          )
        }
        emptyState={{
          icon: <CameraOff className="h-8 w-8 text-muted-foreground" />,
          title: "No snapshots",
          description:
            "The page identity is stable even when no crawl has captured content for it yet.",
        }}
      />
      </div>
    </main>
  );
}
