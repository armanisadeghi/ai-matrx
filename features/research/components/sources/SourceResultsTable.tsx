"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type {
  MatrxColumnDef,
  MatrxDataTableEmptyState,
  MatrxDataTableQueryState,
  MatrxDataTableToolbar,
} from "@ai-matrx/design-system/data-table/types";
import { ExternalLinkTapButton } from "@ai-matrx/tap-target/buttons";
import { cn } from "@/lib/utils";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { StatusBadge } from "../shared/StatusBadge";
import { SourceTypeIcon } from "../shared/SourceTypeIcon";
import { RedundancyGroupBadge } from "./RedundancyGroupBadge";
import { ScrapeWorthinessFlag } from "./ScrapeWorthinessFlag";
import {
  ScoreCell,
  sourceScoreValues,
  QUALITY_SCORE_LABEL,
  PRIORITY_SCORE_LABEL,
  POST_READ_SCORE_LABEL,
  AUTH_SCORE_LABEL,
} from "./sourceScoreDisplay";
import { sourceTypeFromDb, type ResearchSource } from "../../types";
import type { CurationAnalysisState } from "../../service";
import { useYouTubeVideoIndex } from "../../hooks/useResearchState";
import { VideoSourceMeta } from "../shared/VideoSourceMeta";
import {
  SCRAPE_STATUS_CONFIG,
  SOURCE_TYPE_CONFIG,
  authorityTier,
} from "../../constants";

function tierFromSource(source: ResearchSource): string | null {
  return authorityTier(source.authority_tier, source.authority_score);
}

const ANALYSIS_LABEL: Record<CurationAnalysisState, string> = {
  content: "Report",
  empty: "Empty",
  failed: "No report",
  none: "None",
};
const ANALYSIS_CLASS: Record<CurationAnalysisState, string> = {
  content: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  empty: "bg-muted text-muted-foreground",
  failed: "bg-muted text-muted-foreground",
  none: "bg-transparent text-muted-foreground/50",
};
const ANALYSIS_ORDER: Record<CurationAnalysisState, number> = {
  content: 3,
  empty: 2,
  failed: 1,
  none: 0,
};

/**
 * Shared source-result table for the keyword preview and the Content view.
 *
 * The read-only keyword preview deliberately hides the toolbar, copy controls,
 * and pagination: its caller supplies a short pre-ranked subset beneath a fade,
 * so query chrome would promise controls over an intentionally partial list.
 * Content mounts its existing source-aware controls as canonical toolbar
 * facets; this table owns all column sort/filter controls.
 */
export function SourceResultsTable({
  sources,
  topicId,
  rankFor,
  dataSizeFor,
  analysisFor,
  interactive = false,
  toolbarFacets,
  sourceSearch,
  onSourceSearchChange,
  emptyState,
}: {
  sources: ResearchSource[];
  topicId: string;
  rankFor: (source: ResearchSource) => number | null;
  dataSizeFor?: (source: ResearchSource) => number | null;
  analysisFor?: (source: ResearchSource) => CurationAnalysisState | null;
  interactive?: boolean;
  /** Declares source-owned toolbar state so canonical Clear filters resets it. */
  toolbarFacets?: MatrxDataTableToolbar["facets"];
  /** Weighted search remains source-owned by ContentList; the table hosts its input. */
  sourceSearch?: string;
  onSourceSearchChange?: (value: string) => void;
  emptyState?: MatrxDataTableEmptyState;
}) {
  const router = useRouter();
  const { identityFor } = useYouTubeVideoIndex(sources);
  const [query, setQuery] = useState<MatrxDataTableQueryState>({
    page: 1,
    pageSize: 25,
    search: sourceSearch ?? "",
    anyOf: "",
    columnFilters: {},
    sort: null,
  });

  useEffect(() => {
    setQuery((current) =>
      current.search === (sourceSearch ?? "")
        ? current
        : { ...current, page: 1, search: sourceSearch ?? "" },
    );
  }, [sourceSearch]);

  const columns: MatrxColumnDef<ResearchSource>[] = [
    {
      id: "rank",
      header: "Best",
      label: "Best rank",
      accessorFn: rankFor,
      filter: "number",
      width: 56,
      frozen: true,
      align: "right",
      cell: (source) => (
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {rankFor(source) ?? "—"}
        </span>
      ),
    },
    {
      id: "source",
      header: "Source",
      label: "Source",
      accessorFn: (source) => source.title || source.hostname || source.url,
      filter: "text",
      width: 360,
      frozen: true,
      cell: (source) => {
        const video = identityFor(source);
        return (
          <div className="flex min-w-0 items-start gap-1.5">
            <SourceTypeIcon type={sourceTypeFromDb(source.source_type)} />
            <div className="min-w-0">
              <EntityRef
                token="research_source"
                id={source.id}
                name={source.title || source.hostname || source.url}
                href={`/research/topics/${topicId}/sources/${source.id}`}
                showIcon={false}
                className="block max-w-[20rem] truncate whitespace-nowrap text-xs font-medium"
              />
              {(source.hostname || source.redundancy_group || source.url) && (
                <div
                  className="mt-0.5 flex items-center gap-1.5 overflow-hidden whitespace-nowrap"
                  title={[source.hostname, source.url, source.redundancy_group]
                    .filter(Boolean)
                    .join(" · ")}
                >
                  {source.hostname && (
                    <span className="max-w-[20rem] truncate whitespace-nowrap text-[10px] text-muted-foreground">
                      {source.hostname}
                    </span>
                  )}
                  {source.url && (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      title={`Open ${source.url} in a new tab`}
                      aria-label={`Open the original page for ${source.title || source.hostname || source.url} in a new tab`}
                      className="inline-flex text-muted-foreground/70 hover:text-foreground"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  <RedundancyGroupBadge group={source.redundancy_group} />
                </div>
              )}
              {video && (
                <VideoSourceMeta
                  identity={video}
                  className="mt-0.5 max-w-full flex-nowrap overflow-hidden"
                />
              )}
            </div>
          </div>
        );
      },
    },
    {
      id: "search",
      header: "Search",
      accessorFn: () => "Found",
      sortable: false,
      filter: false,
      width: 84,
      cell: () => (
        <span className="inline-flex whitespace-nowrap rounded-full bg-green-100 px-1.5 py-px text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
          <span className="mr-1 h-1 w-1 rounded-full bg-green-500" />
          Found
        </span>
      ),
    },
    {
      id: "scrape",
      header: "Read",
      accessorFn: (source) => source.scrape_status,
      filter: "select",
      filterSingle: true,
      filterOptions: Object.entries(SCRAPE_STATUS_CONFIG).map(
        ([value, config]) => ({ value, label: config.label }),
      ),
      width: 118,
      cell: (source) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={source.scrape_status} />
          <ScrapeWorthinessFlag scrapeWorthiness={source.scrape_worthiness} />
        </div>
      ),
    },
    scoreColumn(
      "priority",
      PRIORITY_SCORE_LABEL,
      (source) => sourceScoreValues(source, rankFor(source)).priority,
    ),
    {
      id: "authority",
      header: AUTH_SCORE_LABEL,
      accessorFn: (source) =>
        numericScore(sourceScoreValues(source, rankFor(source)).auth),
      filterValue: tierFromSource,
      filter: "select",
      filterSingle: true,
      filterOptions: ["high", "medium", "low"].map((value) => ({
        value,
        label: value[0].toUpperCase() + value.slice(1),
      })),
      align: "right",
      width: 84,
      cell: (source) => (
        <ScoreCell value={sourceScoreValues(source, rankFor(source)).auth} />
      ),
    },
    scoreColumn(
      "post",
      POST_READ_SCORE_LABEL,
      (source) => sourceScoreValues(source, rankFor(source)).post,
    ),
    scoreColumn(
      "verdict",
      QUALITY_SCORE_LABEL,
      (source) => sourceScoreValues(source, rankFor(source)).quality,
    ),
  ];

  if (interactive) {
    columns.push({
      id: "type",
      header: "Type",
      accessorFn: (source) => source.source_type,
      filter: "select",
      filterSingle: true,
      filterOptions: Object.entries(SOURCE_TYPE_CONFIG).map(
        ([value, config]) => ({ value, label: config.label }),
      ),
      mobileHidden: true,
      width: 120,
      cell: (source) => (
        <span
          className="whitespace-nowrap text-[11px] text-muted-foreground"
          title={SOURCE_TYPE_CONFIG[sourceTypeFromDb(source.source_type)].label}
        >
          {SOURCE_TYPE_CONFIG[sourceTypeFromDb(source.source_type)].label}
        </span>
      ),
    });
  }
  if (analysisFor) {
    columns.push({
      id: "analysis",
      header: "Analysis",
      accessorFn: (source) => analysisFor(source) ?? "none",
      sortValue: (source) => ANALYSIS_ORDER[analysisFor(source) ?? "none"],
      filter: "select",
      filterSingle: true,
      filterOptions: Object.entries(ANALYSIS_LABEL).map(([value, label]) => ({
        value,
        label,
      })),
      mobileHidden: true,
      width: 104,
      cell: (source) => {
        const analysis = analysisFor(source) ?? "none";
        return (
          <span
            className={cn(
              "inline-flex whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-medium",
              ANALYSIS_CLASS[analysis],
            )}
          >
            {ANALYSIS_LABEL[analysis]}
          </span>
        );
      },
    });
  }
  if (dataSizeFor) {
    columns.push({
      id: "characters",
      header: "Characters",
      accessorFn: (source) => dataSizeFor(source),
      filter: "number",
      align: "right",
      mobileHidden: true,
      width: 112,
      cell: (source) => {
        const size = dataSizeFor(source);
        return (
          <span
            className={cn(
              "font-mono text-[11px] tabular-nums whitespace-nowrap",
              size != null && size >= 1000
                ? "text-muted-foreground"
                : "text-muted-foreground/50",
            )}
            title={
              size != null
                ? `${size.toLocaleString()} characters read`
                : "No page content recorded"
            }
          >
            {size != null ? Math.round(size).toLocaleString() : "—"}
          </span>
        );
      },
    });
  }
  if (interactive) {
    columns.push({
      id: "hostname",
      header: "Hostname",
      accessorFn: (source) => source.hostname ?? "",
      filter: "text",
      hidden: true,
    });
    columns.push({
      id: "source-id",
      header: "Source ID",
      accessorKey: "id",
      filter: "text",
      hidden: true,
      cellKind: "text",
    });
  }
  // The preview's input is deliberately pre-ranked and partial. Its cells stay
  // readable, but no hidden canonical control may reorder or filter that view.
  const displayedColumns = interactive
    ? columns
    : columns.map(
        (column) =>
          ({
            ...column,
            sortable: false,
            filter: false,
          }) as MatrxColumnDef<ResearchSource>,
      );

  return (
    <MatrxDataTable<ResearchSource>
      data={sources}
      columns={displayedColumns}
      emptyState={emptyState}
      getRowId={(source) => source.id}
      detail={{ enabled: false }}
      getRowHref={(source) =>
        `/research/topics/${topicId}/sources/${source.id}`
      }
      onRowOpen={(source) =>
        router.push(`/research/topics/${topicId}/sources/${source.id}`)
      }
      rowActions={(source) => (
        <ExternalLinkTapButton
          href={`/research/topics/${topicId}/sources/${source.id}`}
          target="_blank"
          rel="noopener noreferrer"
          variant="transparent"
          ariaLabel={`Open ${source.title || source.hostname || source.url} in a new tab`}
        />
      )}
      {...(interactive
        ? {
            query: {
              mode: "controlled-local" as const,
              state: query,
              onStateChange: (next: MatrxDataTableQueryState) => {
                setQuery(next);
                if (next.search !== query.search)
                  onSourceSearchChange?.(next.search);
              },
              sourceProcessing: { search: "source" as const },
            },
            toolbar: {
              title: "Content",
              searchPlaceholder: "Search title, url, description, host...",
              facets: toolbarFacets,
            },
          }
        : {})}
      hideToolbar={!interactive}
      {...(!interactive
        ? { hidePagination: true, pageSize: 0, copy: false, zebra: false }
        : {})}
      tableClassName="text-left"
    />
  );
}

function scoreColumn(
  id: string,
  header: string,
  value: (source: ResearchSource) => string,
): MatrxColumnDef<ResearchSource> {
  return {
    id,
    header,
    accessorFn: (source) => numericScore(value(source)),
    filter: "number",
    align: "right",
    width: 84,
    cell: (source) => <ScoreCell value={value(source)} />,
  };
}

function numericScore(value: string): number | null {
  if (value === "—") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
