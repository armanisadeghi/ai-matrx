"use client";

/**
 * The full backlink table — ONE MatrxDataTable (controlled mode) over
 * `useLatestBacklinks`, with URL-owned state via `useMarketingTableState`
 * (GscDimensionTable is the exemplar). Search, sort, pagination, and the
 * placement/type/rel/state filters all push down to the Supabase query in
 * `backlinks-queries.ts`; every sortable/filterable control here maps 1:1 to
 * what that server query honors — nothing renders a control the server
 * silently ignores. An optional `lens` narrows to one Insights slice
 * server-side; the empty state then names the lens honestly.
 */

import {
  BrainCircuit,
  ExternalLink,
  Image as ImageIcon,
  Link2,
  Loader2,
  Unlink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import type { MatrxDataTableRecordControls } from "@/components/official/matrx-data-table/types";
import {
  DateCell,
  headerWithTooltip,
  MutedChip,
  RankCell,
  SpamCell,
  urlPath,
} from "@/features/marketing/components/backlinks/lib/columns";
import { parseObservationExtras } from "@/features/marketing/components/backlinks/lib/extras";
import {
  backlinkAnalysisActionState,
  parseBacklinkAssessment,
  providerExtras,
} from "@/features/marketing/components/backlinks/lib/enrichment";
import { BacklinkEnrichmentDetail } from "@/features/marketing/components/backlinks/BacklinkEnrichmentDetail";
import {
  BACKLINK_CONTROL_LEVELS,
  BACKLINK_ENRICHMENT_STATUSES,
  BACKLINK_LENSES,
  BACKLINK_PAGE_TYPES,
  BACKLINK_RECOMMENDED_ACTIONS,
  BACKLINK_RELEVANCE_VERDICTS,
  BACKLINK_STATES,
  backlinkActionLabel,
  backlinkControlLabel,
  backlinkEmptyHint,
  backlinkPageTypeLabel,
  backlinkRelevanceLabel,
  backlinkReviewStatusLabel,
  DOMAIN_RANK_EXPLAINER,
  LINK_CREDIT_EXPLAINER,
  linkAttributeLabel,
  LINK_PLACEMENTS,
  linkPlacementLabel,
  LINK_TYPES,
  linkTypeLabel,
  PAGE_RANK_EXPLAINER,
  SPAM_SCORE_EXPLAINER,
  type BacklinkLensKey,
} from "@/features/marketing/components/backlinks/lib/vocab";
import {
  humanBacklinkRow,
  projectBacklinkRow,
} from "@/features/marketing/components/backlinks/format";
import { formatGscDate } from "@/features/marketing/search-console/lib/format";
import {
  InlineQueryError,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import { useLatestBacklinks } from "@/features/marketing/data/backlinks-hooks";
import { LENS_DEFAULT_SORT } from "@/features/marketing/data/backlinks-queries";
import type { BacklinkObservationRow } from "@/features/marketing/data/backlinks-types";
import type { BacklinkEnrichmentRunState } from "@/features/marketing/components/backlinks/lib/enrichment-run";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import { webLocation } from "@/features/marketing/lib/copy-payloads";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";

/**
 * One honest empty line per lens — a lens finding nothing is usually GOOD
 * news, and must never read like missing data.
 */
const LENS_EMPTY_LINE: Record<BacklinkLensKey, string> = {
  best: "None of your live links currently pass credit, so there is nothing to rank here yet.",
  new: "You have not picked up any new links since our last check.",
  lost: "Nothing has disappeared — there is no link to go and ask for.",
  broken: "Every link points at a page of yours that works. Nothing to fix.",
  toxic: "Nothing we have read gave us pause. Nothing here needs a second look.",
  actionable: "Nothing needs doing right now.",
  relevant: "None of the pages we have read so far are a close topic match.",
  controllable: "We have not found a link you can edit yourself yet.",
};

export function BacklinkObservationTable({
  siteId,
  lens = null,
  onAnalyze,
  analysisRuns = {},
  onDismissAnalysisRun,
  analysisDisabled = false,
}: {
  siteId: string;
  lens?: BacklinkLensKey | null;
  onAnalyze?: (row: BacklinkObservationRow) => void;
  analysisRuns?: Record<string, BacklinkEnrichmentRunState>;
  onDismissAnalysisRun?: (backlinkId: string) => void;
  analysisDisabled?: boolean;
}) {
  const { sitePath } = useMarketingSite();
  const lensFallback = lens ? LENS_DEFAULT_SORT[lens] : null;
  const table = useMarketingTableState({
    defaultSort: lensFallback
      ? {
          id: lensFallback.column,
          direction: lensFallback.ascending ? "asc" : "desc",
        }
      : { id: "domain_rank", direction: "desc" },
    defaultPageSize: 50,
  });
  const backlinks = useLatestBacklinks(siteId, table.queryState, lens);
  const rows = backlinks.data?.rows ?? [];
  const total = backlinks.data?.total ?? 0;
  const lensLabel = lens
    ? BACKLINK_LENSES.find((entry) => entry.key === lens)?.label
    : null;

  const backlinkDetail = (
    row: BacklinkObservationRow,
    onAnalyzeFromRecord?: () => void,
  ) => (
    <BacklinkEnrichmentDetail
      key={row.id}
      row={row}
      sitePath={sitePath}
      onSaved={() => void backlinks.refetch()}
      onAnalyze={onAnalyzeFromRecord}
      running={analysisRuns[row.id]?.status === "running"}
      analysisDisabled={analysisDisabled}
      analysisRun={analysisRuns[row.id]}
      onDismissAnalysisRun={
        onDismissAnalysisRun ? () => onDismissAnalysisRun(row.id) : undefined
      }
    />
  );

  const renderBacklinkDrawer = (
    row: BacklinkObservationRow,
    controls: MatrxDataTableRecordControls,
  ) =>
    backlinkDetail(
      row,
      onAnalyze
        ? () => {
            controls.openWindow();
            controls.closeDetail();
            onAnalyze(row);
          }
        : undefined,
    );

  const renderBacklinkWindow = (row: BacklinkObservationRow) =>
    backlinkDetail(row, onAnalyze ? () => onAnalyze(row) : undefined);

  const columns: MatrxColumnDef<BacklinkObservationRow>[] = [
    {
      id: "source_domain",
      accessorKey: "source_domain",
      header: "Source",
      filter: false,
      cellKind: "text",
      cell: (row) => {
        const extras = parseObservationExtras(
          providerExtras(row.provider_evidence),
        );
        return (
          <a
            href={row.source_url}
            target="_blank"
            rel="noopener noreferrer"
            title={row.source_url}
            onClick={(event) => event.stopPropagation()}
            className="group block min-w-44 max-w-72"
          >
            <span className="flex items-center gap-1 truncate text-xs font-medium text-foreground group-hover:text-primary group-hover:underline">
              <span className="truncate">
                {row.source_domain ?? urlPath(row.source_url)}
              </span>
              <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
            </span>
            {extras.pageFromTitle ? (
              <span className="block truncate text-[11px] text-muted-foreground">
                {extras.pageFromTitle}
              </span>
            ) : null}
          </a>
        );
      },
    },
    {
      id: "anchor_text",
      accessorKey: "anchor_text",
      header: "Anchor",
      filter: false,
      cellKind: "text",
      cell: (row) => {
        const extras = parseObservationExtras(
          providerExtras(row.provider_evidence),
        );
        if (extras.imageUrl) {
          return (
            <span
              className="flex max-w-52 items-center gap-1 text-xs text-foreground"
              title={extras.imageUrl}
            >
              <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">
                {extras.imageAlt ?? row.anchor_text ?? "image link"}
              </span>
            </span>
          );
        }
        if (!row.anchor_text) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        const context =
          extras.textPre || extras.textPost
            ? `…${extras.textPre ?? ""} [${row.anchor_text}] ${extras.textPost ?? ""}…`
            : row.anchor_text;
        return (
          <span
            className="block max-w-52 truncate text-xs text-foreground"
            title={context}
          >
            {row.anchor_text}
          </span>
        );
      },
    },
    {
      id: "target_url",
      accessorKey: "target_url",
      header: "Target",
      filter: false,
      cellKind: "text",
      cell: (row) => {
        const href = row.page_id
          ? `${sitePath}/pages/${row.page_id}`
          : row.target_url;
        return (
          <a
            href={href}
            target={row.page_id ? undefined : "_blank"}
            rel={row.page_id ? undefined : "noopener noreferrer"}
            title={row.target_url}
            onClick={(event) => event.stopPropagation()}
            className="block min-w-40 max-w-72 truncate font-mono text-[11px] text-primary hover:underline"
          >
            {urlPath(row.target_url)}
          </a>
        );
      },
    },
    {
      id: "placement",
      header: "Placement",
      sortable: false,
      filter: "select",
      filterOptions: LINK_PLACEMENTS.map((placement) => ({
        value: placement.key,
        label: placement.label,
      })),
      accessorFn: (row) =>
        parseObservationExtras(providerExtras(row.provider_evidence))
          .semanticLocation ?? "",
      cell: (row) => {
        const placement = parseObservationExtras(
          providerExtras(row.provider_evidence),
        ).semanticLocation;
        const label = placement ? linkPlacementLabel(placement) : null;
        return label ? (
          <span className="text-xs text-foreground">{label}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        );
      },
    },
    {
      id: "link_type",
      accessorKey: "link_type",
      header: "Type",
      filter: "select",
      filterOptions: LINK_TYPES.map((type) => ({
        value: type.key,
        label: type.label,
      })),
      cell: (row) => {
        const label = row.link_type ? linkTypeLabel(row.link_type) : null;
        return label ? (
          <span className="text-xs text-foreground">{label}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        );
      },
    },
    {
      id: "is_dofollow",
      accessorKey: "is_dofollow",
      header: headerWithTooltip("Counts for SEO?", LINK_CREDIT_EXPLAINER),
      filter: "boolean",
      cell: (row) => {
        const extras = parseObservationExtras(
          providerExtras(row.provider_evidence),
        );
        const special = (extras.attributes ?? []).filter(
          (attribute) => attribute === "sponsored" || attribute === "ugc",
        );
        return (
          <span className="flex flex-wrap items-center gap-1">
            {row.is_dofollow ? (
              <span
                className="inline-flex items-center rounded border border-success/30 bg-success/10 px-1 py-px text-[10px] font-medium leading-4 text-success"
                title="Search engines let this link help your rankings (dofollow)."
              >
                Passes credit
              </span>
            ) : (
              <MutedChip>
                <span title="This link is marked so search engines ignore it (nofollow).">
                  No credit
                </span>
              </MutedChip>
            )}
            {special.map((attribute) => (
              <MutedChip key={attribute}>
                {linkAttributeLabel(attribute)}
              </MutedChip>
            ))}
          </span>
        );
      },
    },
    {
      id: "enrichment_status",
      accessorKey: "enrichment_status",
      header: "Review",
      filter: "select",
      filterOptions: BACKLINK_ENRICHMENT_STATUSES.map((status) => ({
        value: status.key,
        label: status.label,
      })),
      cell: (row) => {
        const error =
          row.last_error &&
          typeof row.last_error === "object" &&
          !Array.isArray(row.last_error) &&
          "message" in row.last_error &&
          typeof row.last_error.message === "string"
            ? row.last_error.message
            : undefined;
        // The attempt counter is a pipeline number, not news for the user —
        // it stays inside the record, never on a row badge.
        return (
          <span title={error} className="whitespace-nowrap">
            <StatusBadge
              value={row.enrichment_status}
              label={backlinkReviewStatusLabel(row.enrichment_status)}
            />
          </span>
        );
      },
    },
    {
      id: "our_score",
      header: "Our score",
      filter: "number",
      align: "right",
      accessorFn: (row) =>
        parseBacklinkAssessment(row.resolved_assessment).overallScore ?? -1,
      cell: (row) => {
        const value = parseBacklinkAssessment(
          row.resolved_assessment,
        ).overallScore;
        return value === null ? (
          <span className="text-xs text-muted-foreground">Not reviewed</span>
        ) : (
          <span className="font-medium tabular-nums text-foreground">
            {value}
          </span>
        );
      },
    },
    {
      id: "relevance",
      header: headerWithTooltip(
        "Topic match",
        "How closely the subject of the linking page matches the page of yours it points to.",
      ),
      filter: "select",
      filterOptions: BACKLINK_RELEVANCE_VERDICTS.map((verdict) => ({
        value: verdict.key,
        label: verdict.label,
      })),
      accessorFn: (row) =>
        parseBacklinkAssessment(row.resolved_assessment).relevanceVerdict ?? "",
      cell: (row) => {
        const value = parseBacklinkAssessment(row.resolved_assessment);
        return (
          <span className="whitespace-nowrap text-xs text-foreground">
            {backlinkRelevanceLabel(value.relevanceVerdict)}
            {value.relevanceScore !== null ? ` · ${value.relevanceScore}` : ""}
          </span>
        );
      },
    },
    {
      id: "page_type",
      header: "Kind of page",
      filter: "select",
      filterOptions: BACKLINK_PAGE_TYPES.map((pageType) => ({
        value: pageType.key,
        label: pageType.label,
      })),
      accessorFn: (row) =>
        parseBacklinkAssessment(row.resolved_assessment).pageType ?? "",
      cell: (row) => (
        <span className="text-xs text-foreground">
          {backlinkPageTypeLabel(
            parseBacklinkAssessment(row.resolved_assessment).pageType,
          )}
        </span>
      ),
    },
    {
      id: "control",
      header: headerWithTooltip(
        "Can you change it?",
        "Whether this is a page you could edit yourself, or ask someone to edit.",
      ),
      filter: "select",
      filterOptions: BACKLINK_CONTROL_LEVELS.map((level) => ({
        value: level.key,
        label: level.label,
      })),
      accessorFn: (row) =>
        parseBacklinkAssessment(row.resolved_assessment).controlLevel ?? "",
      cell: (row) => (
        <span className="text-xs text-foreground">
          {backlinkControlLabel(
            parseBacklinkAssessment(row.resolved_assessment).controlLevel,
          )}
        </span>
      ),
    },
    {
      id: "action",
      header: "What to do",
      filter: "select",
      filterOptions: BACKLINK_RECOMMENDED_ACTIONS.map((action) => ({
        value: action.key,
        label: action.label,
      })),
      accessorFn: (row) =>
        parseBacklinkAssessment(row.resolved_assessment).action ?? "",
      cell: (row) => {
        const value = parseBacklinkAssessment(row.resolved_assessment);
        return (
          <span
            className="block max-w-52 text-xs text-foreground"
            title={value.actionReason ?? undefined}
          >
            {backlinkActionLabel(value.action)}
            {value.priority ? (
              <span className="ml-1 text-[10px] uppercase text-muted-foreground">
                {value.priority}
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      id: "source_rank",
      accessorKey: "source_rank",
      header: headerWithTooltip("Page authority", PAGE_RANK_EXPLAINER),
      filter: false,
      align: "right",
      cell: (row) => <RankCell value={row.source_rank} />,
    },
    {
      id: "domain_rank",
      accessorKey: "domain_rank",
      header: headerWithTooltip("Site authority", DOMAIN_RANK_EXPLAINER),
      filter: false,
      align: "right",
      cell: (row) => <RankCell value={row.domain_rank} />,
    },
    {
      id: "spam_score",
      accessorKey: "spam_score",
      header: headerWithTooltip("Spam signals", SPAM_SCORE_EXPLAINER),
      filter: false,
      align: "right",
      cell: (row) => <SpamCell score={row.spam_score} />,
    },
    {
      id: "state",
      accessorKey: "state",
      header: "State",
      filter: "select",
      filterOptions: BACKLINK_STATES.map((state) => ({
        value: state.key,
        label: state.label,
      })),
      cell: (row) => {
        const extras = parseObservationExtras(
          providerExtras(row.provider_evidence),
        );
        const broken =
          extras.isBroken === true ||
          (extras.urlToStatusCode !== null && extras.urlToStatusCode >= 400);
        return (
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <StatusBadge value={row.state} />
            {row.state === "lost" && row.lost_at ? (
              <span className="text-[11px] text-muted-foreground">
                {formatGscDate(row.lost_at)}
              </span>
            ) : null}
            {broken ? (
              <span
                title={
                  extras.urlToStatusCode
                    ? `This link points at a page of yours that does not work (error ${extras.urlToStatusCode}).`
                    : "This link points at a page of yours that does not work."
                }
              >
                <Unlink
                  className="h-3.5 w-3.5 shrink-0 text-destructive"
                  aria-label="Points at a page that does not work"
                />
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      id: "first_seen_at",
      accessorKey: "first_seen_at",
      header: "First seen",
      filter: false,
      cell: (row) => <DateCell iso={row.first_seen_at} />,
    },
    {
      id: "last_seen_at",
      accessorKey: "last_seen_at",
      header: "Last seen",
      filter: false,
      cell: (row) => <DateCell iso={row.last_seen_at} />,
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {backlinks.isError ? (
        <InlineQueryError
          what="backlinks"
          error={backlinks.error}
          onRetry={() => void backlinks.refetch()}
        />
      ) : (
        <MatrxDataTable<BacklinkObservationRow>
          data={rows}
          columns={columns}
          getRowId={(row) => row.id}
          isLoading={backlinks.isLoading}
          isFetching={backlinks.isFetching}
          query={{
            mode: "controlled",
            totalItems: total,
            state: table.state,
            onStateChange: table.onStateChange,
          }}
          toolbar={{
            searchPlaceholder: "Search by linking site, your page, or link text…",
          }}
          copy={{
            label: "Backlink",
            listLabel: lensLabel
              ? `Backlinks — ${lensLabel}`
              : "Backlinks table",
            location: webLocation(
              lensLabel ? `Backlinks — ${lensLabel}` : "Backlinks",
            ),
            rowKind: "web-backlink",
            listKind: "web-backlink-table",
            rowDescription:
              "One link to this site: where it comes from, where it points, how much authority it carries, whether it passes credit, and when we first and last saw it.",
            listDescription:
              "The links currently on screen (respecting the search, sort, filters, view, and page you are on).",
            humanRow: humanBacklinkRow,
            agentRow: projectBacklinkRow,
            rowAttributes: (row) => ({
              site_id: siteId,
              lens: lens ?? undefined,
              id: row.id,
              state: row.state,
              source_domain: row.source_domain ?? undefined,
              domain_rank: row.domain_rank ?? undefined,
              spam_score: row.spam_score ?? undefined,
            }),
            listAttributes: (visible) => ({
              site_id: siteId,
              lens: lens ?? undefined,
              page: table.state.page,
              visible_rows: visible.length,
              total_rows: total,
              search: table.state.search || undefined,
            }),
          }}
          detail={{
            title: (row) =>
              `Link from ${row.source_domain ?? "another website"}`,
            description: () => "Everything we know about this link",
            render: renderBacklinkDrawer,
          }}
          rowActions={
            onAnalyze
              ? (row, controls) => {
                  const running = analysisRuns[row.id]?.status === "running";
                  const action = backlinkAnalysisActionState(
                    row.enrichment_status,
                    running,
                    analysisDisabled,
                  );
                  return (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 px-2 text-[11px]"
                      disabled={action.disabled}
                      title={action.title}
                      onClick={() => {
                        controls.openWindow();
                        onAnalyze(row);
                      }}
                    >
                      {running || action.inProgress ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <BrainCircuit className="h-3 w-3" />
                      )}
                      {action.label}
                    </Button>
                  );
                }
              : undefined
          }
          window={{
            title: (row) =>
              `Link from ${row.source_domain ?? "another website"}`,
            renderView: renderBacklinkWindow,
            renderEdit: false,
            defaultTab: "view",
          }}
          pageSize={50}
          pageSizeOptions={[25, 50, 100, 250]}
          emptyState={{
            icon: <Link2 className="h-8 w-8 text-muted-foreground" />,
            title: lensLabel
              ? `${lensLabel}: nothing found`
              : "No links stored yet",
            description:
              backlinks.isSuccess && (lens || table.queryState.search)
                ? lens
                  ? LENS_EMPTY_LINE[lens]
                  : "No links match what you searched and filtered for."
                : backlinkEmptyHint("the individual links to this site"),
          }}
          className="min-h-0 flex-1"
        />
      )}
    </div>
  );
}
