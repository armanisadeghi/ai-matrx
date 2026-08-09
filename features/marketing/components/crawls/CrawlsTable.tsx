"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Play, Radio, RefreshCw, ScanSearch, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
import { jsonExportItem, rowsToCsv } from "@/components/agent-copy/export";
import { AgentCopyGroomerLauncher } from "@/components/agent-copy/AgentCopyGroomerLauncher";
import {
  groomerPresetVariants,
  type AgentCopyGroomerConfig,
  type AgentCopyGroomerSection,
} from "@/components/agent-copy/groomer-types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingCrawlsScope } from "@/features/surfaces/manifests/marketing-crawls.manifest";
import { useMarketingSiteSurfaceBase } from "@/features/marketing/lib/scopes/site-surface-base";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import {
  useCrawls,
  useDeleteCrawlSession,
} from "@/features/marketing/data/hooks";
import { cancelCrawl } from "@/features/marketing/crawler/direct-client";
import { extractErrorMessage } from "@/utils/errors";
import type { CrawlSession } from "@/features/marketing/types";
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";
import {
  formatCompactDate,
  formatDuration,
  jsonNumber,
  QueryError,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";

const STATUS_OPTIONS = [
  { value: "queued", label: "Queued" },
  { value: "running", label: "Running" },
  { value: "complete", label: "Complete" },
  { value: "partial", label: "Partial" },
  { value: "failed", label: "Failed" },
];

const TRIGGER_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "scheduled", label: "Scheduled" },
];

const ACTIVE_STATUSES = new Set(["queued", "running"]);

export function CrawlsTable() {
  const router = useRouter();
  const { site, sitePath, crawlActivity } = useMarketingSite();
  const { getBaseValues } = useMarketingSiteSurfaceBase();
  const table = useMarketingTableState({
    defaultSort: { id: "started_at", direction: "desc" },
  });
  const crawls = useCrawls(site.id, table.queryState);
  const deleteMutation = useDeleteCrawlSession(site.id);
  const [deleting, setDeleting] = useState<CrawlSession | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const activeCrawl = crawlActivity.activeCrawl;

  // Live elapsed time for running rows — a frozen duration on a running
  // crawl reads as a hung crawler.
  const hasActiveRow =
    Boolean(activeCrawl) ||
    (crawls.data?.rows ?? []).some((row) => ACTIVE_STATUSES.has(row.status));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!hasActiveRow) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [hasActiveRow]);

  const requestCancel = async (row: CrawlSession) => {
    setCancelingId(row.id);
    try {
      await cancelCrawl(row.id);
      toast.info("Cancellation requested", {
        description: "The crawl finishes as partial once the worker stops.",
      });
      crawlActivity.refresh();
      void crawls.refetch();
    } catch (error) {
      toast.error("Could not cancel crawl", {
        description: extractErrorMessage(error),
      });
    } finally {
      setCancelingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      // Never hide active work: cancel-to-terminal before the soft delete,
      // otherwise the detached worker keeps writing into an invisible session.
      if (ACTIVE_STATUSES.has(deleting.status)) {
        try {
          await cancelCrawl(deleting.id);
        } catch (cancelError) {
          toast.error("Could not cancel the running crawl — not deleting", {
            description: extractErrorMessage(cancelError),
          });
          // The session may have finished or been deleted elsewhere —
          // refresh so the row reflects reality instead of lingering.
          void crawls.refetch();
          crawlActivity.refresh();
          return;
        }
      }
      await deleteMutation.mutateAsync(deleting.id);
      toast.success("Crawl session deleted");
      setDeleting(null);
      crawlActivity.refresh();
    } catch (error) {
      toast.error("Could not delete crawl session", {
        description: extractErrorMessage(error),
      });
    }
  };

  const columns: MatrxColumnDef<CrawlSession>[] = [
    {
      id: "started_at",
      accessorKey: "started_at",
      header: "Started",
      filter: false,
      // THE DOOR LAW: this cell IS the session's identity (its timestamp and
      // its id), so it is the real anchor — keyboard, screen reader,
      // cmd/middle-click. Same destination as `onRowOpen`, which stays a mouse
      // convenience.
      href: (row) => `${sitePath}/crawls/${row.id}`,
      cell: (row) => (
        <div className="whitespace-nowrap">
          <p className="text-xs font-medium">
            {formatCompactDate(row.started_at ?? row.created_at)}
          </p>
          <p className="font-mono text-[10px] text-muted-foreground">
            {row.id.slice(0, 12)}
          </p>
        </div>
      ),
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Status",
      filter: "select",
      filterOptions: STATUS_OPTIONS,
      cell: (row) => <StatusBadge value={row.status} />,
    },
    {
      id: "trigger",
      accessorKey: "trigger",
      header: "Trigger",
      filter: "select",
      filterOptions: TRIGGER_OPTIONS,
      cell: (row) => <span className="text-xs capitalize">{row.trigger}</span>,
    },
    {
      id: "duration",
      header: "Duration",
      filter: false,
      sortable: false,
      cell: (row) => (
        <span className="text-xs tabular-nums">
          {ACTIVE_STATUSES.has(row.status)
            ? formatDuration(row.started_at, new Date(now).toISOString())
            : formatDuration(row.started_at, row.finished_at)}
        </span>
      ),
    },
    {
      id: "pages",
      header: "Captured",
      filter: false,
      sortable: false,
      align: "right",
      cell: (row) => (
        <span className="text-xs tabular-nums">
          {jsonNumber(row.stats, ["pages_fetched"]).toLocaleString()}
        </span>
      ),
    },
    {
      id: "discovered",
      header: "Discovered",
      filter: false,
      sortable: false,
      align: "right",
      cell: (row) => (
        <span className="text-xs tabular-nums">
          {jsonNumber(row.stats, ["pages_discovered"]).toLocaleString()}
        </span>
      ),
    },
    {
      id: "finished_at",
      accessorKey: "finished_at",
      header: "Finished",
      filter: false,
      cell: (row) => (
        <span className="whitespace-nowrap text-xs">
          {formatCompactDate(row.finished_at)}
        </span>
      ),
    },
    {
      id: "error",
      accessorKey: "error",
      header: "Error",
      filter: false,
      sortable: false,
      cellKind: "text",
      cell: (row) => (
        <span className="block max-w-56 truncate text-xs text-destructive">
          {row.error || "—"}
        </span>
      ),
    },
  ];

  if (crawls.isError)
    return (
      <QueryError error={crawls.error} onRetry={() => void crawls.refetch()} />
    );

  const rows = crawls.data?.rows ?? [];
  const pageLocation = webLocation(`Crawls — ${site.root_url}`);
  const pageHuman = () =>
    humanLines([
      ["Site", site.root_url],
      ["Loaded crawl sessions", rows.length],
      ["Total recorded", crawls.data?.total ?? 0],
      ["Search", table.state.search || undefined],
    ]);
  const groomerSections = (): AgentCopyGroomerSection[] => [
    {
      id: "sessions",
      title: "Crawl sessions",
      description: `${rows.length} loaded of ${crawls.data?.total ?? 0} recorded (current table page + filters).`,
      levelLabels: {
        full: `Loaded ${rows.length} (raw)`,
        compact: "Top 25 (key fields)",
        brief: "Counts only",
      },
      build: (level) =>
        level === "full"
          ? { query: table.state, rows }
          : level === "compact"
            ? {
                query: table.state,
                rows: rows.slice(0, 25).map((row) => ({
                  id: row.id,
                  status: row.status,
                  trigger: row.trigger,
                  started_at: row.started_at,
                  finished_at: row.finished_at,
                  error: row.error,
                })),
              }
            : {
                total_recorded: crawls.data?.total ?? 0,
                loaded_rows: rows.length,
              },
    },
  ];
  const groomerConfig = (): AgentCopyGroomerConfig => ({
    label: `Crawl sessions — ${site.root_url}`,
    kind: "marketing-crawls-page",
    location: pageLocation,
    description: `Crawl sessions recorded for ${site.root_url}.`,
    attributes: { site_id: site.id, domain: site.root_url },
    summary: pageHuman(),
    sections: groomerSections(),
  });
  const pageFullData = (): Record<string, unknown> => {
    const full: Record<string, unknown> = {};
    for (const section of groomerSections()) {
      const value = section.build("full");
      if (value !== null && value !== undefined) full[section.id] = value;
    }
    return full;
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing-crawls"
      getScope={() => {
        return createMarketingCrawlsScope({
          ...getBaseValues(),
          recent_sessions:
            rows.length > 0
              ? rows.slice(0, 20).map((row) => ({
                  id: row.id,
                  status: row.status,
                  trigger: row.trigger,
                  started_at: row.started_at,
                  finished_at: row.finished_at,
                  pages_discovered: jsonNumber(row.stats, [
                    "pages_discovered",
                  ]),
                  pages_fetched: jsonNumber(row.stats, ["pages_fetched"]),
                  error: row.error,
                }))
              : undefined,
          sessions_total: crawls.data?.total,
          sessions_query: { ...table.state },
        });
      }}
    >
    <main className="flex h-full min-h-0 flex-col gap-2 overflow-hidden bg-textured p-3 sm:p-4">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-base font-semibold text-foreground">
          Crawl sessions
          <span className="text-xs font-normal tabular-nums text-muted-foreground">
            {(crawls.data?.total ?? 0).toLocaleString()}
          </span>
        </h1>
        <div className="flex items-center gap-1.5">
          <CopyButtons
            size="icon"
            label={`Crawls page (${site.root_url})`}
            human={pageHuman}
            json={pageFullData}
            agent={() => ({
              kind: "marketing-crawls-page",
              location: pageLocation,
              description: `Crawl sessions recorded for ${site.root_url}.`,
              data: pageFullData(),
              summary: pageHuman(),
              attributes: { site_id: site.id, domain: site.root_url },
            })}
            aiVariants={groomerPresetVariants(groomerConfig)}
          />
          <ExportMenu
            label={`crawls-${site.root_url}`}
            items={[
              jsonExportItem(() => rows, "JSON (loaded rows, raw)"),
              {
                id: "csv",
                label: "CSV (loaded rows)",
                build: () => ({
                  content: rowsToCsv(
                    rows as unknown as Array<Record<string, unknown>>,
                  ),
                  extension: "csv",
                  mime: "text/csv",
                }),
              },
            ]}
          />
          <AgentCopyGroomerLauncher config={groomerConfig} />
        </div>
      </header>
      <MatrxDataTable<CrawlSession>
        className="min-h-0 flex-1"
        data={crawls.data?.rows ?? []}
        columns={columns}
        getRowId={(row) => row.id}
        isLoading={crawls.isLoading}
        isFetching={crawls.isFetching}
        query={{
          mode: "controlled",
          state: table.state,
          totalItems: crawls.data?.total ?? 0,
          onStateChange: table.onStateChange,
        }}
        toolbar={{
          searchPlaceholder: "Search status, trigger, or error…",
          actions: (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => void crawls.refetch()}
                disabled={crawls.isFetching}
              >
                <RefreshCw
                  className={
                    crawls.isFetching
                      ? "h-3.5 w-3.5 animate-spin"
                      : "h-3.5 w-3.5"
                  }
                />
                Refresh
              </Button>
              {activeCrawl ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 border-primary/40 text-primary"
                  onClick={() => router.push(`${sitePath}/crawls/new`)}
                >
                  <Radio className="h-3.5 w-3.5 animate-pulse" /> Open live
                  crawl
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => router.push(`${sitePath}/crawls/new`)}
                >
                  <Play className="h-3.5 w-3.5" /> Start crawl
                </Button>
              )}
            </div>
          ),
        }}
        copy={{
          label: "Crawl session",
          listLabel: "All crawl sessions",
          location: webLocation(`Crawls — ${site.root_url}`),
          showToolbar: false,
          rowKind: "web-crawl-session",
          listKind: "web-crawl-sessions-list",
          rowDescription: "One frozen crawl session for this site.",
          listDescription:
            "The currently loaded crawl session rows (respecting search, filters, sort, and pagination).",
          humanRow: (row) =>
            humanLines([
              ["Session", row.id],
              ["Status", row.status],
              ["Trigger", row.trigger],
              ["Started", formatCompactDate(row.started_at ?? row.created_at)],
              ["Finished", formatCompactDate(row.finished_at)],
              ["Duration", formatDuration(row.started_at, row.finished_at)],
              ["Discovered", jsonNumber(row.stats, ["pages_discovered"])],
              ["Captured", jsonNumber(row.stats, ["pages_fetched"])],
              ["Error", row.error],
            ]),
          rowAttributes: (row) => ({
            session_id: row.id,
            site_id: site.id,
            status: row.status,
          }),
          listAttributes: () => ({
            site_id: site.id,
            total_matching: crawls.data?.total ?? 0,
          }),
        }}
        detail={{ enabled: false }}
        onRowOpen={(row) =>
          router.push(`${sitePath}/crawls/${row.id}`)
        }
        rowActions={(row) => (
          <div className="flex items-center gap-0.5">
            {ACTIVE_STATUSES.has(row.status) ? (
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                title="Cancel crawl"
                disabled={cancelingId === row.id}
                onClick={(event) => {
                  event.stopPropagation();
                  void requestCancel(row);
                }}
              >
                <Ban className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title="Delete crawl session"
              onClick={(event) => {
                event.stopPropagation();
                setDeleting(row);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        emptyState={{
          icon: <ScanSearch className="h-8 w-8 text-muted-foreground" />,
          title: "No crawl sessions",
          description:
            "Crawl commands are sent directly to the scraper; durable sessions will appear here from Supabase.",
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={
          deleting && ACTIVE_STATUSES.has(deleting.status)
            ? "Cancel and delete crawl session?"
            : "Delete crawl session?"
        }
        description={
          deleting && ACTIVE_STATUSES.has(deleting.status)
            ? "This crawl is still active. It will be canceled first, then the session moves to trash — deleting without canceling would leave the worker writing into an invisible session."
            : "The session moves to trash with its URL ledger and event log attached. Snapshots it captured stay with their pages."
        }
        variant="destructive"
        confirmLabel="Delete session"
        busy={deleteMutation.isPending}
        onConfirm={() => void confirmDelete()}
      />
    </main>
    </SurfaceRuntimeProvider>
  );
}
