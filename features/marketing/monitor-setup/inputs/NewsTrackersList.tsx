"use client";

// Every news monitor the person administers, one row each: what its relevance
// check receives (topics, brief, competitors, brand description, facts), what
// it cost in 30 days, and pause / resume / archive. Reads and writes go through
// the two seo.news_tracker_* doors (./data.ts).

import { useState } from "react";
import Link from "next/link";
import {
  Archive,
  CheckCircle2,
  CircleAlert,
  CircleDot,
  CirclePause,
  FlaskConical,
  Minus,
  Pause,
  Play,
  XCircle,
} from "lucide-react";
import { Button, SegmentedControl } from "@ai-matrx/design-system/controls";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { formatRelativeTime } from "@ai-matrx/kit/format";

import { adminCostColumns } from "@/components/cost/adminCostColumns";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { toast } from "@/lib/toast";
import {
  setTrackerState,
  useInvalidateTrackerInputs,
  useTrackerInputsList,
  type NewsTrackerInputs,
  type TrackerAction,
  type TrackerReadiness,
  type TrackerStatus,
} from "./data";

export const newsTrackerHref = (trackerId: string) =>
  `/marketing/monitoring/${trackerId}`;

const STATUS_ICON: Record<
  TrackerStatus,
  { icon: typeof CircleDot; className: string; label: string }
> = {
  active: { icon: CircleDot, className: "text-success", label: "Active" },
  paused: { icon: CirclePause, className: "text-warning", label: "Paused" },
  archived: {
    icon: Archive,
    className: "text-muted-foreground",
    label: "Archived",
  },
};

const READINESS: Record<
  TrackerReadiness,
  { icon: typeof CheckCircle2; className: string; label: string }
> = {
  missing: {
    icon: XCircle,
    className: "text-destructive",
    label: "Missing inputs",
  },
  thin: { icon: CircleAlert, className: "text-warning", label: "Thin inputs" },
  ready: { icon: CheckCircle2, className: "text-success", label: "Ready" },
};

function IconWithTip({
  icon: Icon,
  className,
  tip,
  label,
}: {
  icon: typeof CircleDot;
  className: string;
  tip: string;
  label?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1.5">
          <Icon className={`h-4 w-4 shrink-0 ${className}`} aria-label={tip} />
          {label ? <span className="truncate">{label}</span> : null}
        </span>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

function statusTip(row: NewsTrackerInputs): string {
  if (row.status === "paused" && row.costPausedAt)
    return "Scheduled runs paused by the monthly cost limit";
  return STATUS_ICON[row.status].label;
}

const count = (value: number) =>
  value === 0 ? <span className="text-destructive">0</span> : value;

function buildColumns(): MatrxColumnDef<NewsTrackerInputs>[] {
  return [
    {
      id: "name",
      header: "Monitor",
      accessorKey: "name",
      filter: "text",
      width: 280,
      href: (row) => newsTrackerHref(row.id),
      cell: (row) => (
        <Link
          href={newsTrackerHref(row.id)}
          className="truncate font-medium hover:underline"
        >
          {row.name}
        </Link>
      ),
    },
    {
      id: "test",
      header: "Test",
      accessorFn: (row) => (row.isDisposable ? "Test" : "Real"),
      filter: "select",
      width: 64,
      align: "center",
      cell: (row) =>
        row.isDisposable ? (
          <IconWithTip
            icon={FlaskConical}
            className="text-info"
            tip="Test monitor"
          />
        ) : null,
    },
    {
      id: "readiness",
      header: "Inputs",
      accessorFn: (row) => READINESS[row.readiness].label,
      sortValue: (row) => ({ missing: 0, thin: 1, ready: 2 })[row.readiness],
      filter: "select",
      width: 72,
      align: "center",
      cell: (row) => (
        <IconWithTip
          icon={READINESS[row.readiness].icon}
          className={READINESS[row.readiness].className}
          tip={
            row.gaps.length
              ? row.gaps.join(" · ")
              : "Everything the relevance check reads is filled in"
          }
        />
      ),
    },
    {
      id: "brand",
      header: "Brand",
      accessorFn: (row) => row.brandName ?? "",
      filter: "select",
      width: 170,
      href: (row) =>
        row.brandId ? marketingRoutes.brand(row.brandId) : undefined,
      cell: (row) =>
        row.brandId ? (
          <Link
            href={marketingRoutes.brand(row.brandId)}
            className="truncate hover:underline"
          >
            {row.brandName}
          </Link>
        ) : (
          <span className="text-destructive">No brand</span>
        ),
    },
    {
      id: "organization",
      header: "Organization",
      accessorKey: "organizationName",
      filter: "select",
      width: 150,
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (row) => STATUS_ICON[row.status].label,
      filter: "select",
      width: 110,
      cell: (row) => (
        <IconWithTip
          icon={STATUS_ICON[row.status].icon}
          className={STATUS_ICON[row.status].className}
          tip={statusTip(row)}
          label={STATUS_ICON[row.status].label}
        />
      ),
    },
    {
      id: "topics",
      header: "Topics",
      accessorFn: (row) => row.topics.length,
      filter: "number",
      align: "right",
      width: 72,
      cell: (row) => count(row.topics.length),
    },
    {
      id: "brief",
      header: "Brief",
      accessorFn: (row) => (row.briefIsEmpty ? "No" : "Yes"),
      filter: "select",
      align: "center",
      width: 64,
      cell: (row) =>
        row.briefIsEmpty ? (
          <IconWithTip
            icon={XCircle}
            className="text-destructive"
            tip="No brief"
          />
        ) : (
          <IconWithTip
            icon={CheckCircle2}
            className="text-success"
            tip="Brief written"
          />
        ),
    },
    {
      id: "competitors",
      header: "Competitors",
      accessorFn: (row) => row.competitors.length,
      filter: "number",
      align: "right",
      width: 100,
      cell: (row) => count(row.competitors.length),
    },
    {
      id: "description",
      header: "Description",
      accessorFn: (row) => row.brandDescription.length,
      filter: "number",
      align: "right",
      width: 100,
      cell: (row) =>
        row.brandDescription.length === 0 ? (
          <span className="text-destructive">Missing</span>
        ) : (
          `${row.brandDescription.length} chars`
        ),
    },
    {
      id: "facts",
      header: "Facts",
      accessorFn: (row) => row.facts.length,
      filter: "number",
      align: "right",
      width: 64,
      cell: (row) => count(row.facts.length),
    },
    {
      id: "runs",
      header: "Runs 30d",
      accessorKey: "runs30d",
      filter: "number",
      align: "right",
      width: 84,
      defaultSortDirection: "desc",
    },
    ...adminCostColumns<NewsTrackerInputs>({
      id: "cost30d",
      label: "AI cost 30d",
      value: (row) => row.cost30dUsd,
      sortable: true,
    }),
    {
      id: "lastRun",
      header: "Last run",
      accessorFn: (row) => row.lastRunAt ?? "",
      filter: "date",
      width: 110,
      defaultSortDirection: "desc",
      cell: (row) =>
        row.lastRunAt ? (
          formatRelativeTime(row.lastRunAt)
        ) : (
          <Minus className="h-4 w-4 text-muted-foreground" aria-label="Never" />
        ),
    },
  ];
}

const ACTION_WORDS: Record<TrackerAction, { done: string; failed: string }> = {
  pause: { done: "Paused", failed: "Could not pause" },
  resume: { done: "Resumed", failed: "Could not resume" },
  archive: { done: "Archived", failed: "Could not archive" },
};

export function NewsTrackersList() {
  const [view, setView] = useState<"live" | "archived">("live");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const query = useTrackerInputsList(view === "archived");
  const invalidate = useInvalidateTrackerInputs();
  const rows = (query.data ?? []).filter((row) =>
    view === "archived" ? row.status === "archived" : row.status !== "archived",
  );

  async function run(ids: string[], action: TrackerAction, key: string) {
    setBusyId(key);
    try {
      await setTrackerState(ids, action);
      setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
      await invalidate();
      toast.success(
        `${ACTION_WORDS[action].done} ${ids.length === 1 ? "1 monitor" : `${ids.length} monitors`}`,
      );
    } catch (error) {
      toast.error(ACTION_WORDS[action].failed, {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusyId(null);
    }
  }

  async function archive(targets: NewsTrackerInputs[], key: string) {
    const scheduled = targets.filter((row) => row.status === "active").length;
    const ok = await confirm({
      title:
        targets.length === 1
          ? `Archive “${targets[0].name}”?`
          : `Archive ${targets.length} monitors?`,
      description:
        scheduled > 0
          ? `Their scheduled runs stop now (${scheduled} still running on a schedule). Past stories stay; archived monitors move to the Archived view.`
          : "No more runs. Past stories stay; archived monitors move to the Archived view.",
      confirmLabel: "Archive",
      variant: "destructive",
    });
    if (ok)
      await run(
        targets.map((row) => row.id),
        "archive",
        key,
      );
  }

  const testIds = rows.filter((row) => row.isDisposable).map((row) => row.id);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <MatrxDataTable<NewsTrackerInputs>
        tableId="marketing.news-trackers"
        data={rows}
        columns={buildColumns()}
        getRowId={(row) => row.id}
        searchText={(row) =>
          `${row.name} ${row.brandName ?? ""} ${row.organizationName}`
        }
        defaultSort={{ id: "cost30d", direction: "desc" }}
        isLoading={query.isLoading}
        isFetching={query.isFetching}
        read={{
          status: query.isError
            ? "error"
            : query.isLoading
              ? "loading"
              : "ready",
          error: query.error,
          onRetry: () => void query.refetch(),
          what: "news monitors",
        }}
        frameHeight="fill"
        cellLines="one"
        getRowHref={(row) => newsTrackerHref(row.id)}
        toolbar={{
          title: "News monitors",
          titleCount: { value: rows.length, label: "monitors" },
          search: true,
          searchPlaceholder: "Search monitors, brands…",
          leading: (
            <div className="flex items-center gap-2">
              <SegmentedControl<"live" | "archived">
                aria-label="Which monitors"
                value={view}
                onValueChange={(next) => {
                  setSelectedIds([]);
                  setView(next);
                }}
                data={[
                  { value: "live", label: "Live" },
                  { value: "archived", label: "Archived" },
                ]}
              />
              {view === "live" && testIds.length > 0 ? (
                <Button
                  variant="quiet"
                  icon={<FlaskConical className="h-4 w-4" />}
                  onClick={() => setSelectedIds(testIds)}
                >
                  {`Select ${testIds.length} test monitors`}
                </Button>
              ) : null}
            </div>
          ),
        }}
        emptyState={{
          title:
            view === "archived" ? "No archived monitors" : "No news monitors",
          description:
            view === "archived"
              ? undefined
              : "Set one up from a brand's Monitoring page.",
          action:
            view === "archived" ? undefined : (
              <Button asChild variant="outline">
                <Link href={marketingRoutes.brands()}>Open brands</Link>
              </Button>
            ),
        }}
        selection={
          view === "archived"
            ? false
            : {
                selectedIds,
                onSelectedIdsChange: setSelectedIds,
                actions: (selected) => (
                  <Button
                    variant="danger"
                    icon={<Archive className="h-4 w-4" />}
                    disabled={busyId === "bulk"}
                    onClick={() => void archive(selected, "bulk")}
                  >
                    {`Archive ${selected.length}`}
                  </Button>
                ),
              }
        }
        rowActions={(row) =>
          row.status === "archived"
            ? []
            : [
                row.status === "paused"
                  ? {
                      id: "resume",
                      icon: Play,
                      label: "Resume",
                      tooltip: row.costPausedAt
                        ? "Resume scheduled runs; clears this month's cost pause"
                        : "Resume scheduled runs",
                      loading: busyId === `resume:${row.id}`,
                      onClick: () =>
                        void run([row.id], "resume", `resume:${row.id}`),
                    }
                  : {
                      id: "pause",
                      icon: Pause,
                      label: "Pause",
                      tooltip: "Stop scheduled runs until resumed",
                      loading: busyId === `pause:${row.id}`,
                      onClick: () =>
                        void run([row.id], "pause", `pause:${row.id}`),
                    },
                {
                  id: "archive",
                  icon: Archive,
                  label: "Archive",
                  tooltip: "Archive: stops runs and hides the monitor",
                  tone: "destructive",
                  loading: busyId === `archive:${row.id}`,
                  onClick: () => void archive([row], `archive:${row.id}`),
                },
              ]
        }
      />
    </div>
  );
}
