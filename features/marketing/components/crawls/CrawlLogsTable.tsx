"use client";

import { ListTree } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { CrawlSubnav } from "@/features/marketing/components/crawls/CrawlSubnav";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import { useCrawl, useCrawlEvents } from "@/features/marketing/data/hooks";
import type { CrawlEvent } from "@/features/marketing/types";
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";
import {
  formatCompactDate,
  LoadingSurface,
  QueryError,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";

const LEVEL_OPTIONS = [
  { value: "debug", label: "Debug" },
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "error", label: "Error" },
];

export function CrawlLogsTable({ crawlId }: { crawlId: string }) {
  const { site } = useMarketingSite();
  const table = useMarketingTableState({
    defaultSort: { id: "sequence", direction: "asc" },
    defaultPageSize: 50,
  });
  const crawl = useCrawl(site.id, crawlId);
  const events = useCrawlEvents(site.id, crawlId, table.queryState);
  const columns: MatrxColumnDef<CrawlEvent>[] = [
    {
      id: "sequence",
      accessorKey: "sequence",
      header: "Seq",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="font-mono text-[11px] tabular-nums">
          {row.sequence}
        </span>
      ),
    },
    {
      id: "occurred_at",
      accessorKey: "occurred_at",
      header: "Time",
      filter: false,
      cell: (row) => (
        <span className="whitespace-nowrap text-xs">
          {formatCompactDate(row.occurred_at)}
        </span>
      ),
    },
    {
      id: "level",
      accessorKey: "level",
      header: "Level",
      filter: "select",
      filterOptions: LEVEL_OPTIONS,
      cell: (row) => <StatusBadge value={row.level} />,
    },
    {
      id: "phase",
      accessorKey: "phase",
      header: "Phase",
      filter: "text",
      cell: (row) => (
        <span className="text-xs capitalize">
          {row.phase?.replaceAll("_", " ") || "—"}
        </span>
      ),
    },
    {
      id: "event_type",
      accessorKey: "event_type",
      header: "Event",
      filter: "text",
      cell: (row) => (
        <span className="font-mono text-[11px]">{row.event_type}</span>
      ),
    },
    {
      id: "message",
      accessorKey: "message",
      header: "Message",
      filter: false,
      sortable: false,
      cellKind: "text",
      cell: (row) => (
        <span className="block min-w-64 max-w-3xl truncate text-xs">
          {row.message || "—"}
        </span>
      ),
    },
  ];
  if (crawl.isLoading) return <LoadingSurface label="Loading crawl…" />;
  if (crawl.isError || !crawl.data)
    return (
      <QueryError
        error={crawl.error ?? new Error("Crawl not found")}
        onRetry={() => void crawl.refetch()}
      />
    );
  return (
    <main className="flex h-full min-h-0 flex-col gap-3 overflow-hidden bg-textured p-3 sm:p-4">
      <CrawlSubnav crawl={crawl.data} />
      <div className="min-h-0 flex-1">
        {events.isError ? (
          <QueryError
            error={events.error}
            onRetry={() => void events.refetch()}
          />
        ) : (
          <MatrxDataTable<CrawlEvent>
            data={events.data?.rows ?? []}
            columns={columns}
            getRowId={(row) => row.id}
            isLoading={events.isLoading}
            isFetching={events.isFetching}
            query={{
              mode: "controlled",
              state: table.state,
              totalItems: events.data?.total ?? 0,
              onStateChange: table.onStateChange,
            }}
            toolbar={{
              searchPlaceholder: "Search event type, phase, level, or message…",
            }}
            copy={{
              label: "Crawl event",
              listLabel: "All crawl events",
              location: webLocation(`Crawl event log — session ${crawlId}`),
              rowKind: "web-crawl-event",
              listKind: "web-crawl-events",
              rowDescription:
                "One durable event from this crawl session's ordered history.",
              listDescription:
                "The currently loaded durable crawl-event rows for this session (respecting search, filters, sort, and pagination).",
              humanRow: (row) =>
                humanLines([
                  ["Seq", row.sequence],
                  ["Time", formatCompactDate(row.occurred_at)],
                  ["Level", row.level],
                  ["Phase", row.phase],
                  ["Event", row.event_type],
                  ["Message", row.message],
                ]),
              rowAttributes: (row) => ({
                event_id: row.id,
                session_id: crawlId,
                site_id: site.id,
                level: row.level,
              }),
              listAttributes: () => ({
                session_id: crawlId,
                site_id: site.id,
                total_matching: events.data?.total ?? 0,
              }),
            }}
            detail={{
              title: (row) => `${row.sequence} · ${row.event_type}`,
              description: (row) => row.message ?? undefined,
            }}
            emptyState={{
              icon: <ListTree className="h-8 w-8 text-muted-foreground" />,
              title: "No durable crawl events",
              description:
                "Live stream messages are transient; only crawler-persisted events belong in this history.",
            }}
          />
        )}
      </div>
    </main>
  );
}
