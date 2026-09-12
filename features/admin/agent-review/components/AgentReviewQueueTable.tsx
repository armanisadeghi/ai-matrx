"use client";

import { useEffect, useMemo, useState } from "react";
import AppLink from "@/components/navigation/AppLink";
import { useRouter } from "next/navigation";
import { ArrowRight, ExternalLink, Link2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { nextQueryState } from "@ai-matrx/design-system/data-table/query-control";
import { useTableUrlState } from "@ai-matrx/design-system/data-table/url-state";
import { enumUrlCodec, useUrlState } from "@ai-matrx/kit/url-state";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import type { ContextMenuExtraItem } from "@/features/context-menu-v3/types";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { ADMIN_AGENT_REVIEW_SURFACE_NAME } from "@/features/surfaces/manifests/admin-agent-review.manifest";
import { buildAgentReviewScope } from "@/features/admin/agent-review/surface-scope";
import { AgentReviewWriteTargets } from "@/features/admin/agent-review/components/AgentReviewWriteTargets";
import {
  EMPTY_REVIEW_REGISTRY,
  type ReviewRegistry,
} from "@/features/admin/agent-review/registry";
import { loadAuthenticatedReviewData } from "@/features/admin/agent-review/review-data";
import {
  REVIEW_STATUSES,
  REVIEW_STATUS_LABELS,
  type ReviewQueueRow,
  type ReviewStatus,
} from "@/features/admin/agent-review/types";
import { reviewTargetPageDisplay } from "@/features/admin/agent-review/target-page";
import {
  REVIEW_LANE_UNLABELLED,
  reviewLaneLabel,
  reviewSearchText,
} from "@/features/admin/agent-review/row-text";
import { matchesTableSearch } from "@ai-matrx/design-system/data-table/filter-engine";
import { useShare } from "@/features/sharing/hooks/useShare";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  ReviewCount,
  reviewCountLabel,
} from "@/features/admin/agent-review/components/ReviewCount";

/** The row's own page — the link every agent owes Arman (see the
 *  `agent-review-queue` skill, THE DIRECT-LINK RULE). */
export function reviewItemPath(id: string): string {
  return `/administration/users/agent-review/${id}`;
}

const FLOW = [
  { statuses: ["submitted"], label: "1. Submitted" },
  { statuses: ["agent_review"], label: "2. Agent review" },
  {
    statuses: ["agent_changes_requested", "human_changes_requested"],
    label: "3. Changes",
  },
  { statuses: ["ready_for_human"], label: "4. Ready for you" },
  { statuses: ["approved"], label: "5. Approved" },
] satisfies Array<{ statuses: ReviewStatus[]; label: string }>;

function domainName(row: ReviewQueueRow, registry: ReviewRegistry): string {
  return registry.domainsById.get(row.domain_id)?.name ?? "Not assigned";
}

function featureName(row: ReviewQueueRow, registry: ReviewRegistry): string {
  if (!row.feature_id) return "Not assigned";
  return registry.featuresById.get(row.feature_id)?.name ?? "Not assigned";
}

/** The row as readable text — what Copy-as / Export / AI actions carry. */
function reviewRowContent(
  row: ReviewQueueRow,
  registry: ReviewRegistry,
): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return [
    row.title,
    // THE DIRECT-LINK RULE: anything copied out of this row carries the row's
    // own address, so nobody is ever told to "find it in the queue".
    `Review: ${origin}${reviewItemPath(row.id)}`,
    `Status: ${REVIEW_STATUS_LABELS[row.status as ReviewStatus] ?? row.status}`,
    `Filed by / lane: ${reviewLaneLabel(row)}`,
    `Domain: ${domainName(row, registry)}`,
    `Feature: ${featureName(row, registry)}`,
    `Repository: ${row.repo_slug}`,
    `Target page: ${reviewTargetPageDisplay(row.url).fullHref}`,
    `Last activity: ${new Date(row.updated_at).toLocaleString()}`,
  ].join("\n");
}

export default function AgentReviewQueueTable() {
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  const [view, setView] = useUrlState(
    "view",
    enumUrlCodec(["inbox", "all"] as const, "inbox"),
  );
  const [rows, setRows] = useState<ReviewQueueRow[]>([]);
  const [registry, setRegistry] = useState<ReviewRegistry>(
    EMPTY_REVIEW_REGISTRY,
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clickedRow, setClickedRow] = useState<ReviewQueueRow | null>(null);
  /** While searching, the list widens to every step by default; this pins it
   *  back to the step being browsed. Cleared with the search itself. */
  const [narrowToStep, setNarrowToStep] = useState(false);
  const { share, fallbackDialog } = useShare();
  const table = useTableUrlState({
    tableId: "agent-review",
    defaultSort: { id: "updated_at", direction: "desc" },
    defaultPageSize: 25,
  });

  async function refresh() {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await loadAuthenticatedReviewData(userId);
      if (!data) return;
      setRows(data.queue);
      setRegistry(data.registry);
      setLoadError(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Review queue failed to load";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!userId) return;
    let active = true;
    loadAuthenticatedReviewData(userId)
      .then((data) => {
        if (!active || !data) return;
        setRows(data.queue);
        setRegistry(data.registry);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (active) {
          const message =
            error instanceof Error
              ? error.message
              : "Review queue failed to load";
          setLoadError(message);
          toast.error(message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const columns = useMemo<MatrxColumnDef<ReviewQueueRow>[]>(
    () => [
      {
        id: "open",
        header: "Open",
        accessorFn: (row) => row.id,
        sortable: false,
        filter: false,
        width: 96,
        cell: (row) => {
          const target = reviewTargetPageDisplay(row.url);
          return (
            <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
              <AppLink
                data-matrx-cell-control
                href={target.href}
                target="_blank"
                rel="noreferrer"
                title="Open the review and launch its target page"
                aria-label={`Open review and launch target page: ${row.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  window.setTimeout(() => {
                    router.push(reviewItemPath(row.id));
                  }, 0);
                }}
              >
                Open <ArrowRight className="h-3.5 w-3.5" />
              </AppLink>
            </Button>
          );
        },
      },
      {
        id: "copy_link",
        header: "Link",
        accessorFn: (row) => row.id,
        sortable: false,
        filter: false,
        compact: true,
        align: "center",
        width: 56,
        cell: (row) => (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title="Copy this review's direct link"
            aria-label={`Copy the direct link to: ${row.title}`}
            onClick={(event) => {
              event.stopPropagation();
              const url = `${window.location.origin}${reviewItemPath(row.id)}`;
              void share({ title: row.title, url }).then((outcome) => {
                if (outcome === "copied") toast.success("Review link copied");
                // "shared" spoke for itself; "manual" opened the copy dialog.
              });
            }}
          >
            <Link2 className="h-3.5 w-3.5" />
          </Button>
        ),
      },
      {
        accessorKey: "title",
        header: "Review item",
        href: (row) => reviewItemPath(row.id),
        cellKind: "text",
        filter: "text",
        width: 420,
      },
      {
        accessorKey: "status",
        header: "Current step",
        filter: "select",
        filterOptions: REVIEW_STATUSES.map((status) => ({
          value: status,
          label: REVIEW_STATUS_LABELS[status],
        })),
        cell: (row) =>
          REVIEW_STATUS_LABELS[row.status as ReviewStatus] ?? row.status,
        width: 180,
      },
      {
        id: "agent_label",
        header: "Filed by / lane",
        accessorFn: (row) => reviewLaneLabel(row),
        filter: "select",
        cell: (row) => {
          const lane = reviewLaneLabel(row);
          return (
            <span
              className={cn(
                "truncate",
                lane === REVIEW_LANE_UNLABELLED && "text-muted-foreground",
              )}
            >
              {lane}
            </span>
          );
        },
        width: 180,
      },
      {
        id: "domain",
        header: "Domain",
        accessorFn: (row) => domainName(row, registry),
        filter: "select",
        cell: (row) => domainName(row, registry),
        width: 170,
      },
      {
        id: "feature",
        header: "Feature",
        accessorFn: (row) => featureName(row, registry),
        filter: "select",
        cell: (row) => featureName(row, registry),
        width: 200,
      },
      {
        accessorKey: "repo_slug",
        header: "Repository",
        filter: "select",
        width: 160,
      },
      {
        accessorKey: "url",
        header: "Target page",
        cellKind: "text",
        cell: (row) => {
          const target = reviewTargetPageDisplay(row.url);
          return (
            <AppLink
              href={target.href}
              title={target.fullHref}
              aria-label={`Open target page: ${target.fullHref}`}
              className="flex min-w-0 max-w-full items-center gap-1 text-primary hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              <span className="min-w-0 truncate">{target.label}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </AppLink>
          );
        },
        width: 260,
        mobileHidden: true,
      },
      {
        accessorKey: "created_at",
        header: "Filed",
        filter: "text",
        cell: (row) => new Date(row.created_at).toLocaleString(),
        width: 180,
        mobileHidden: true,
      },
      {
        accessorKey: "updated_at",
        header: "Last activity",
        filter: "text",
        cell: (row) => new Date(row.updated_at).toLocaleString(),
        width: 180,
        mobileHidden: true,
      },
    ],
    [registry, share],
  );

  const activeRows = rows.filter((row) => row.status !== "archived");
  const inboxRows = rows.filter((row) => row.status === "ready_for_human");
  /** What BROWSING shows: the human inbox, or all activity, narrowed further
   *  by whichever workflow step is selected. */
  const browseRows = view === "all" ? rows : inboxRows;

  const searchQuery = table.state.search.trim().toLowerCase();
  const searching = searchQuery.length > 0;
  const searchMode = table.state.searchMatchMode ?? "contains";
  const statusFilter = table.state.columnFilters.status;
  const stepStatuses =
    statusFilter?.kind === "select"
      ? (statusFilter.values ?? [statusFilter.value])
      : [];
  const stepLabel =
    stepStatuses.length > 0
      ? (FLOW.find(
          (step) =>
            step.statuses.length === stepStatuses.length &&
            step.statuses.every((status) => stepStatuses.includes(status)),
        )?.label.replace(/^\d+\.\s*/, "") ??
        stepStatuses
          .map((status) => REVIEW_STATUS_LABELS[status as ReviewStatus])
          .join(" / "))
      : view === "inbox"
        ? "Ready for you"
        : "All activity";

  /**
   * A search that runs INSIDE the open step hides instead of finding — typing
   * "print" on the inbox step returned zero while 30 print rows sat one step
   * back (Arman, 2026-09-07). So a search widens to every non-archived step by
   * default, and says so out loud.
   */
  const widened = searching && !narrowToStep;
  const visibleRows = widened ? activeRows : browseRows;

  const browseIds = new Set(
    browseRows
      .filter(
        (row) =>
          stepStatuses.length === 0 ||
          stepStatuses.some((status) => status === row.status),
      )
      .map((row) => row.id),
  );
  const matchingRows = searching
    ? activeRows.filter((row) =>
        matchesTableSearch(
          reviewSearchText(row, {
            domain: domainName(row, registry),
            feature: featureName(row, registry),
          }),
          searchQuery,
          searchMode,
        ),
      )
    : [];
  const matchesElsewhere = matchingRows.filter(
    (row) => !browseIds.has(row.id),
  ).length;

  /** The table only ever sees the status filter when it is actually applied —
   *  a widened search must not render a step chip it is ignoring. */
  const tableState = widened
    ? {
        ...table.state,
        columnFilters: { ...table.state.columnFilters, status: undefined },
      }
    : table.state;

  function handleTableState(next: typeof table.state) {
    if (!next.search.trim()) setNarrowToStep(false);
    if (!widened) {
      table.onStateChange(next);
      return;
    }
    // The step filter is hidden while widened, so the table cannot have
    // cleared it deliberately — carry it through untouched.
    table.onStateChange(
      statusFilter
        ? {
            ...next,
            columnFilters: { ...next.columnFilters, status: statusFilter },
          }
        : next,
    );
  }

  function setStatusFilter(statuses?: ReviewStatus[]) {
    table.onStateChange(
      nextQueryState(
        table.state,
        {
          columnFilters: {
            ...table.state.columnFilters,
            status: statuses
              ? {
                  kind: "select",
                  value: statuses[0],
                  values: statuses,
                }
              : undefined,
          },
        },
        { resetPage: true },
      ),
    );
  }

  function setQueueView(nextView: "inbox" | "all") {
    setView(nextView);
    setStatusFilter();
  }

  /** The surface's live scope, assembled at trigger time from what the list
   *  actually holds — never stale state captured at render. */
  function getSurfaceScope() {
    return buildAgentReviewScope({
      rows,
      registry,
      view,
      visibleRows,
      loadError,
    });
  }

  /** A row the write target just persisted replaces its copy in place, so
   *  every read twin reflects what the server actually stored. */
  function applySavedRow(saved: ReviewQueueRow) {
    setRows((current) =>
      current.map((row) => (row.id === saved.id ? saved : row)),
    );
  }

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_AGENT_REVIEW_SURFACE_NAME}
      getScope={getSurfaceScope}
      isEditable={false}
    >
      <div className="flex h-full min-h-0 flex-col gap-4 px-4 pb-1 pt-4">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:gap-4">
          <h1 className="text-xl font-semibold">Agent Review</h1>
          <div className="flex w-full items-center gap-2 overflow-x-auto pb-1 sm:w-auto sm:overflow-visible sm:pb-0">
            <Button
              size="sm"
              variant={view === "inbox" ? "default" : "outline"}
              onClick={() => setQueueView("inbox")}
            >
              Ready for you (
              <ReviewCount count={inboxRows.length} loading={loading} />)
            </Button>
            <Button
              size="sm"
              variant={view === "all" ? "default" : "outline"}
              onClick={() => setQueueView("all")}
            >
              All activity (
              <ReviewCount count={rows.length} loading={loading} />)
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!userId || loading}
              onClick={() => void refresh()}
            >
              <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
            </Button>
          </div>
        </div>

        <nav
          aria-label="Agent review workflow"
          className="flex items-stretch gap-2 overflow-x-auto pb-1"
        >
          {FLOW.map((step, index) => {
            const count = activeRows.filter((row) =>
              step.statuses.some((status) => status === row.status),
            ).length;
            const activeStatusFilter = table.state.columnFilters.status;
            const selectedStatuses =
              activeStatusFilter?.kind === "select"
                ? (activeStatusFilter.values ?? [activeStatusFilter.value])
                : [];
            const isActive =
              selectedStatuses.length === step.statuses.length &&
              step.statuses.every((status) =>
                selectedStatuses.includes(status),
              );
            return (
              <div key={step.label} className="contents">
                {index > 0 ? (
                  <ArrowRight className="mt-6 h-4 w-4 shrink-0 text-muted-foreground" />
                ) : null}
                <button
                  type="button"
                  aria-pressed={isActive}
                  aria-label={`Filter review items by ${step.label.replace(/^\d+\.\s*/, "")} (${reviewCountLabel(count, loading)})`}
                  onClick={() => {
                    setView("all");
                    setStatusFilter(step.statuses);
                  }}
                  className={cn(
                    "min-h-11 min-w-32 flex-1 rounded-md border bg-card px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:min-w-0",
                    isActive && "border-primary bg-accent",
                  )}
                >
                  <div className="text-sm font-medium">{step.label}</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">
                    <ReviewCount
                      count={count}
                      loading={loading}
                      skeletonClassName="h-7 w-12"
                    />
                  </div>
                </button>
              </div>
            );
          })}
        </nav>

        {searching ? (
          <div
            role="status"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-primary/30 bg-accent/50 px-3 py-2 text-sm"
          >
            {widened ? (
              <>
                <span>
                  Searching <strong>every step</strong> — {matchingRows.length}{" "}
                  {matchingRows.length === 1 ? "match" : "matches"},{" "}
                  {matchesElsewhere} outside {stepLabel}.
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={() => setNarrowToStep(true)}
                >
                  Narrow to {stepLabel}
                </Button>
              </>
            ) : (
              <>
                <span>
                  Searching <strong>{stepLabel}</strong> only —{" "}
                  {matchesElsewhere}{" "}
                  {matchesElsewhere === 1 ? "match is" : "matches are"} hidden
                  in other steps.
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={() => setNarrowToStep(false)}
                >
                  Search every step
                </Button>
              </>
            )}
          </div>
        ) : null}

        <div className="min-h-0 flex-1">
          {/* Write half of the surface — renders nothing, services the
            manifest's triage target through updateReviewQueueRow. */}
          <AgentReviewWriteTargets rows={rows} onRowUpdated={applySavedRow} />
          {/* No entity: agent.review_queue has no registered EntityTypeToken
            today — Copy/AI act on the raw content only.
            surfaceName is `matrx-admin/agent-review` (registered manifest,
            features/surfaces/manifests/admin-agent-review.manifest.ts) —
            this IS that surface's own table, and the provider above supplies
            the same live scope the menu passes as `getApplicationScope`. */}
          <NonEditableContextMenu
            sourceFeature="admin"
            surfaceName={ADMIN_AGENT_REVIEW_SURFACE_NAME}
            getApplicationScope={getSurfaceScope}
            contentSource={{ type: "raw" }}
            contextData={{ content: "" }}
            resolveContextOnOpen={(element) => {
              const id = element
                ?.closest("[data-row-id]")
                ?.getAttribute("data-row-id");
              const row = id ? visibleRows.find((r) => r.id === id) : undefined;
              setClickedRow(row ?? null);
              if (!row) return null;
              return { content: reviewRowContent(row, registry) };
            }}
            extraSections={[
              {
                id: "agent-review-row",
                label: "This review item",
                anchor: "after-compare",
                items: [
                  {
                    kind: "link",
                    id: "agent-review-open-item",
                    label: "Open review item",
                    icon: ArrowRight,
                    href: clickedRow ? reviewItemPath(clickedRow.id) : "#",
                    disabled: !clickedRow,
                  },
                  {
                    kind: "link",
                    id: "agent-review-open-target",
                    label: "Open the reviewed surface",
                    icon: ExternalLink,
                    href: clickedRow
                      ? reviewTargetPageDisplay(clickedRow.url).href
                      : "#",
                    target: "_blank",
                    disabled: !clickedRow,
                  },
                ] satisfies ContextMenuExtraItem[],
              },
            ]}
          >
            {/* A PLAIN DOM CHILD, not the table itself: Radix clones the
              trigger's ref + onContextMenu onto its ONE child, and
              MatrxDataTable forwards neither — wrapping it directly produced
              a menu that never opened (measured live 2026-08-26). */}
            <div className="flex h-full min-h-0 flex-col">
              <MatrxDataTable
                data={visibleRows}
                columns={columns}
                getRowId={(row) => row.id}
                isLoading={loading}
                query={{
                  mode: "controlled-local",
                  state: tableState,
                  onStateChange: handleTableState,
                }}
                searchText={(row) =>
                  reviewSearchText(row, {
                    domain: domainName(row, registry),
                    feature: featureName(row, registry),
                  })
                }
                toolbar={{
                  search: true,
                  searchPlaceholder:
                    "Search title, instructions, target page, lane…",
                }}
                detail={{ enabled: false }}
                onRowOpen={(row) => router.push(reviewItemPath(row.id))}
                pageSize={25}
                pageSizeOptions={[25, 50, 100]}
                zebra
                emptyState={{
                  title: searching
                    ? "No review item matches that search"
                    : view === "inbox"
                      ? "Nothing is waiting for your review"
                      : "No review items match this view",
                  description: searching
                    ? widened
                      ? "Every step was searched, including items agents have not finished reviewing. Archived items are not searched."
                      : `Only ${stepLabel} was searched — use “Search every step” above.`
                    : view === "inbox"
                      ? "Agents are still testing and repairing the remaining activity."
                      : "Clear a search or column filter to see more items.",
                }}
              />
            </div>
          </NonEditableContextMenu>
        </div>
        {fallbackDialog}
      </div>
    </SurfaceRuntimeProvider>
  );
}
