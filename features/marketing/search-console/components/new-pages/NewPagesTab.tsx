"use client";

/**
 * New Pages — the manual launch tracker for Arman's workflow: add a page
 * (and request indexing in GSC), wait for the FIRST impression (the
 * milestone victory), then track early performance that top-N lists bury.
 * Tracking state = `web.page.launch_tracking` (team-visible); the milestone
 * = `seo.gsc_perf_page_first_dates` (all-history winning-run MIN date).
 */

import { useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  CalendarCheck,
  MoreHorizontal,
  PanelTop,
  Plus,
  Rocket,
  StickyNote,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOpenGscDrilldownWindow } from "@/features/overlays/openers/gscDrilldownWindow";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";
import { formatCompactDate } from "@/features/marketing/components/shared/MarketingUi";
import { gscScopeAttributes } from "@/features/marketing/search-console/lib/copy-payloads";
import {
  getPageFirstDates,
  listTrackedPages,
  markIndexingRequested,
  setLaunchNotes,
  untrackPage,
  type TrackedPageRow,
} from "@/features/marketing/search-console/data-launch";
import {
  LAUNCH_STAGE_LABELS,
  launchLifecycle,
  type LaunchLifecycle,
} from "@/features/marketing/search-console/lib/launch-tracking";
import { AddTrackedPageDialog } from "@/features/marketing/search-console/components/new-pages/AddTrackedPageDialog";
import { LifecycleChip } from "@/features/marketing/search-console/components/new-pages/LifecycleChip";
import { formatCount } from "@/features/marketing/search-console/types";
import type {
  GscCompareMode,
  GscPageFirstDatesRow,
  GscRangeKey,
  GscResolvedPeriods,
} from "@/features/marketing/search-console/types";

interface LaunchRow extends TrackedPageRow {
  firstDates: GscPageFirstDatesRow | null;
  lifecycle: LaunchLifecycle;
}

export function NewPagesTab({
  siteId,
  siteName,
  organizationId,
  periods,
  panelRange,
}: {
  siteId: string;
  siteName: string | null;
  organizationId: string | null;
  periods: GscResolvedPeriods;
  panelRange: {
    range: GscRangeKey;
    customFrom: string | null;
    customTo: string | null;
    compare: GscCompareMode;
  };
}) {
  const queryClient = useQueryClient();
  const openDrilldown = useOpenGscDrilldownWindow();
  const [addOpen, setAddOpen] = useState(false);
  const [notesTarget, setNotesTarget] = useState<TrackedPageRow | null>(null);

  const tracked = useQuery({
    queryKey: ["marketing", "gsc", "launch-pages", siteId],
    queryFn: ({ signal }) => listTrackedPages(siteId, signal),
    staleTime: 60 * 1000,
  });

  const trackedIds = (tracked.data ?? []).map((p) => p.id);
  const firstDates = useQuery({
    queryKey: [
      "marketing",
      "gsc",
      "launch-first-dates",
      siteId,
      [...trackedIds].sort().join(","),
    ],
    queryFn: ({ signal }) => getPageFirstDates(siteId, trackedIds, signal),
    enabled: trackedIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["marketing", "gsc", "launch-pages"],
    });

  const markRequested = useMutation({
    mutationFn: (page: TrackedPageRow) => markIndexingRequested(page),
    onSuccess: () => {
      toast.success("Marked as requested — now we wait for the first impression.");
      void invalidate();
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not update the page.",
      ),
  });
  const saveNotes = useMutation({
    mutationFn: (args: { page: TrackedPageRow; notes: string }) =>
      setLaunchNotes(args.page, args.notes),
    onSuccess: () => void invalidate(),
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not save notes.",
      ),
  });
  const untrack = useMutation({
    mutationFn: (pageId: string) => untrackPage(pageId),
    onSuccess: () => {
      toast.success("Removed from the tracker.");
      void invalidate();
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not untrack the page.",
      ),
  });

  const firstByPage = new Map(
    (firstDates.data ?? []).map((row) => [row.page_id, row]),
  );
  const rows: LaunchRow[] = (tracked.data ?? []).map((page) => {
    const fd = firstByPage.get(page.id) ?? null;
    return {
      ...page,
      firstDates: fd,
      lifecycle: launchLifecycle(
        page.tracking,
        fd?.first_impression_date ?? null,
      ),
    };
  });

  const openQueriesPanel = (row: LaunchRow) => {
    openDrilldown({
      siteId,
      siteName,
      dimension: "query",
      filters: { page_eq: row.id },
      range: panelRange.range,
      customFrom: panelRange.customFrom,
      customTo: panelRange.customTo,
      compare: panelRange.compare,
      title: `Queries for ${row.url}`,
    });
  };

  const columns: MatrxColumnDef<LaunchRow>[] = [
    {
      id: "url",
      accessorKey: "url",
      header: "Page",
      filter: false,
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <span
            className="max-w-[22rem] truncate text-xs font-medium text-foreground sm:max-w-[30rem]"
            title={row.url}
          >
            {row.path ?? row.url}
          </span>
          {row.tracking.notes ? (
            <span
              className="max-w-[22rem] truncate text-[11px] text-muted-foreground sm:max-w-[30rem]"
              title={row.tracking.notes}
            >
              {row.tracking.notes}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: "stage",
      header: "Stage",
      filter: "select",
      filterOptions: Object.entries(LAUNCH_STAGE_LABELS).map(([value, v]) => ({
        value,
        label: v.label,
      })),
      accessorFn: (row) => row.lifecycle.stage,
      cell: (row) => <LifecycleChip stage={row.lifecycle.stage} />,
    },
    {
      id: "added",
      header: "Added",
      align: "right",
      filter: false,
      accessorFn: (row) => row.tracking.added_at,
      cell: (row) => (
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatCompactDate(row.tracking.added_at)}
        </span>
      ),
    },
    {
      id: "requested",
      header: "Indexing requested",
      align: "right",
      filter: false,
      accessorFn: (row) => row.tracking.indexing_requested_at ?? "",
      cell: (row) =>
        row.tracking.indexing_requested_at ? (
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatCompactDate(row.tracking.indexing_requested_at)}
          </span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[11px]"
            disabled={markRequested.isPending}
            onClick={(e) => {
              e.stopPropagation();
              markRequested.mutate(row);
            }}
          >
            Mark requested
          </Button>
        ),
    },
    {
      id: "first_impression",
      header: "First impression",
      align: "right",
      filter: false,
      accessorFn: (row) => row.lifecycle.firstImpressionDate ?? "",
      cell: (row) =>
        row.lifecycle.firstImpressionDate ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums text-success">
            <Rocket className="h-3 w-3" />
            {formatCompactDate(row.lifecycle.firstImpressionDate)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "days_live",
      header: "Live for",
      align: "right",
      filter: false,
      accessorFn: (row) => row.lifecycle.daysLive ?? -1,
      cell: (row) => (
        <span className="text-xs tabular-nums">
          {row.lifecycle.daysLive !== null
            ? `${row.lifecycle.daysLive}d`
            : `${row.lifecycle.daysTracked}d tracked`}
        </span>
      ),
    },
    {
      id: "lifetime_clicks",
      header: "Lifetime clicks",
      align: "right",
      filter: false,
      accessorFn: (row) => row.firstDates?.lifetime_clicks ?? 0,
      cell: (row) => (
        <span className="text-xs font-semibold tabular-nums">
          {formatCount(row.firstDates?.lifetime_clicks ?? 0)}
        </span>
      ),
    },
    {
      id: "lifetime_impressions",
      header: "Lifetime impr.",
      align: "right",
      filter: false,
      accessorFn: (row) => row.firstDates?.lifetime_impressions ?? 0,
      cell: (row) => (
        <span className="text-xs tabular-nums">
          {formatCount(row.firstDates?.lifetime_impressions ?? 0)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      sortable: false,
      filter: false,
      width: 40,
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              aria-label={`Actions for ${row.url}`}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onSelect={() => openQueriesPanel(row)}>
              <PanelTop className="mr-2 h-3.5 w-3.5" />
              Queries for this page — floating panel
            </DropdownMenuItem>
            {!row.tracking.indexing_requested_at ? (
              <DropdownMenuItem onSelect={() => markRequested.mutate(row)}>
                <CalendarCheck className="mr-2 h-3.5 w-3.5" />
                Mark indexing requested
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={() => setNotesTarget(row)}>
              <StickyNote className="mr-2 h-3.5 w-3.5" />
              Edit notes
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => {
                void (async () => {
                  const ok = await confirm({
                    title: "Stop tracking this page?",
                    description:
                      "Only the tracker entry is removed — the page and its data stay.",
                    variant: "destructive",
                    confirmLabel: "Untrack",
                  });
                  if (ok) untrack.mutate(row.id);
                })();
              }}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Untrack
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const error = tracked.isError
    ? tracked.error
    : firstDates.isError
      ? firstDates.error
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          Add a page when you publish it, request indexing in GSC, and watch
          for the first impression — early numbers live here where top-N
          lists can&apos;t bury them.
        </p>
        <Button
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="h-3 w-3" />
          Add page
        </Button>
      </div>

      {error ? (
        <div className="flex flex-1 items-center justify-center rounded-md border border-destructive/40 bg-destructive/5 p-4">
          <p className="max-w-lg text-center text-xs text-destructive">
            {error instanceof Error ? error.message : String(error)}
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <MatrxDataTable<LaunchRow>
            data={rows}
            columns={columns}
            getRowId={(row) => row.id}
            isLoading={tracked.isLoading}
            isFetching={tracked.isFetching || firstDates.isFetching}
            toolbar={{ searchPlaceholder: "Search tracked pages…" }}
            copy={{
              label: "Tracked page",
              listLabel: "New Pages launch tracker",
              location: webLocation("Search Console — New Pages"),
              rowKind: "web-gsc-launch-page",
              listKind: "web-gsc-launch-tracker",
              rowDescription:
                "One manually tracked new page with its launch lifecycle and lifetime search totals.",
              listDescription:
                "Every page in the site's launch tracker (manual adds; first-impression milestone from GSC history).",
              humanRow: (row) =>
                humanLines([
                  ["Page", row.url],
                  ["Stage", LAUNCH_STAGE_LABELS[row.lifecycle.stage].label],
                  ["Added", formatCompactDate(row.tracking.added_at)],
                  [
                    "Indexing requested",
                    row.tracking.indexing_requested_at
                      ? formatCompactDate(row.tracking.indexing_requested_at)
                      : "not yet",
                  ],
                  [
                    "First impression",
                    row.lifecycle.firstImpressionDate
                      ? formatCompactDate(row.lifecycle.firstImpressionDate)
                      : "not yet",
                  ],
                  [
                    "Lifetime clicks",
                    formatCount(row.firstDates?.lifetime_clicks ?? 0),
                  ],
                  [
                    "Lifetime impressions",
                    formatCount(row.firstDates?.lifetime_impressions ?? 0),
                  ],
                  ["Notes", row.tracking.notes],
                ]),
              rowAttributes: (row) => ({
                ...gscScopeAttributes(siteId, siteName, periods, {}),
                page_id: row.id,
                url: row.url,
                stage: row.lifecycle.stage,
              }),
              listAttributes: (visible) => ({
                ...gscScopeAttributes(siteId, siteName, periods, {}),
                visible_rows: visible.length,
                tracked_pages: rows.length,
              }),
            }}
            detail={{ enabled: false }}
            window={{ enabled: false }}
            onRowOpen={openQueriesPanel}
            pageSize={50}
            emptyState={{
              icon: <Rocket className="h-8 w-8 text-muted-foreground" />,
              title: "No tracked pages yet",
              description:
                "Add a page right after publishing it. The first GSC impression is the milestone — this tab celebrates it and keeps the early numbers visible.",
            }}
            className="flex-1"
          />
        </div>
      )}

      <AddTrackedPageDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        siteId={siteId}
        organizationId={organizationId}
        onAdded={() => void invalidate()}
      />
      {notesTarget ? (
        <TextInputDialog
          open
          onOpenChange={(open) => {
            if (!open) setNotesTarget(null);
          }}
          title="Launch notes"
          description={notesTarget.url}
          defaultValue={notesTarget.tracking.notes ?? ""}
          multiline
          confirmLabel="Save"
          onConfirm={(value) => {
            saveNotes.mutate({ page: notesTarget, notes: value });
            setNotesTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}
