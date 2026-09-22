"use client";

import { useState, useMemo } from "react";
import { Skeleton } from "@ai-matrx/design-system";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import { FilterTapButton } from "@ai-matrx/tap-target/buttons";
import { useTopicContext } from "../../context/ResearchContext";
import {
  useResearchSources,
  useSourceImportance,
  useCurationData,
} from "../../hooks/useResearchState";
import { SCRAPE_STATUS_CONFIG, SOURCE_TYPE_CONFIG } from "../../constants";
import type { FilterDef } from "../shared/ResearchFilterBar";
import type { FilterOption } from "@/components/hierarchy-filter/HierarchyFilterPill";
import { HierarchyFilterPill } from "@/components/hierarchy-filter/HierarchyFilterPill";
import type { ResearchSource } from "../../types";
import type { CurationAnalysisState } from "../../service";
import { filterAndSortBySearch } from "@ai-matrx/kit/search-scoring";
import { SourceResultsTable } from "../sources/SourceResultsTable";
import type { MatrxDataTableToolbar } from "@ai-matrx/design-system/data-table/types";

function SourceScopeFilterPopover({ filters }: { filters: FilterDef[] }) {
  const activeCount = filters.filter(
    (filter) => filter.selectedId !== null,
  ).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <FilterTapButton
          variant="transparent"
          ariaLabel={`Filter content sources${activeCount ? ` (${activeCount} active)` : ""}`}
        />
      </PopoverTrigger>
      <PopoverContent
        /* sizing: fixed — content already decides its own width; no fixed box to remove */
        align="start"
        className="w-auto max-w-[min(24rem,calc(100vw-2rem))] p-2"
      >
        <div className="flex flex-wrap gap-1">
          {filters.map((filter) => (
            <HierarchyFilterPill
              key={filter.key}
              label={filter.label}
              allLabel={filter.allLabel}
              options={filter.options}
              selectedId={filter.selectedId}
              onSelect={filter.onSelect}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function ContentList() {
  const { topicId } = useTopicContext();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [qualityFilter, setQualityFilter] = useState<string | null>(null);
  const [hostFilter, setHostFilter] = useState<string | null>(null);

  const { data: sources, isLoading } = useResearchSources(topicId, {
    limit: 200,
  });
  const { data: importanceMap } = useSourceImportance(topicId);
  const { data: curation } = useCurationData(topicId);

  /** source id → scraped char count (current version) for the Characters column. */
  const charCountMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of curation?.rows ?? []) {
      if (row.charCount != null) m.set(row.source.id, row.charCount);
    }
    return m;
  }, [curation]);

  /** source id → analysis-report outcome, for the Analysis column. */
  const analysisMap = useMemo(() => {
    const m = new Map<string, CurationAnalysisState>();
    for (const row of curation?.rows ?? []) {
      m.set(row.source.id, row.analysis);
    }
    return m;
  }, [curation]);

  const scraped = useMemo(
    () =>
      (sources ?? []).filter(
        (s) =>
          s.scrape_status === "success" ||
          s.scrape_status === "thin" ||
          s.scrape_status === "complete",
      ),
    [sources],
  );

  const hostnames = useMemo(
    () =>
      [
        ...new Set(scraped.map((s) => s.hostname).filter(Boolean) as string[]),
      ].sort(),
    [scraped],
  );

  const filtered = useMemo(() => {
    let items = scraped;

    if (statusFilter) {
      items = items.filter((s) => s.scrape_status === statusFilter);
    }
    if (typeFilter) {
      items = items.filter((s) => s.source_type === typeFilter);
    }
    if (qualityFilter === "good") {
      items = items.filter((s) => s.scrape_status === "success");
    } else if (qualityFilter === "thin") {
      items = items.filter((s) => s.scrape_status === "thin");
    }
    if (hostFilter) {
      items = items.filter((s) => s.hostname === hostFilter);
    }
    if (search) {
      items = filterAndSortBySearch(items, search, [
        { get: (s) => s.title, weight: "title" },
        { get: (s) => s.hostname, weight: "subtitle" },
        { get: (s) => s.url, weight: "subtitle" },
        { get: (s) => s.description, weight: "body" },
      ]);
    }

    return items;
  }, [scraped, statusFilter, typeFilter, qualityFilter, hostFilter, search]);

  const statusOptions: FilterOption[] = useMemo(
    () =>
      Object.entries(SCRAPE_STATUS_CONFIG).map(([key, config]) => ({
        id: key,
        label: config.label,
      })),
    [],
  );
  const typeOptions: FilterOption[] = useMemo(
    () =>
      Object.entries(SOURCE_TYPE_CONFIG).map(([key, config]) => ({
        id: key,
        label: config.label,
      })),
    [],
  );
  const qualityOptions: FilterOption[] = [
    { id: "good", label: "Good" },
    { id: "thin", label: "Thin" },
  ];
  const hostOptions: FilterOption[] = useMemo(
    () => hostnames.map((h) => ({ id: h, label: h })),
    [hostnames],
  );

  const filterDefs: FilterDef[] = useMemo(() => {
    const defs: FilterDef[] = [
      {
        key: "status",
        label: "Status",
        allLabel: "All Statuses",
        options: statusOptions,
        selectedId: statusFilter,
        onSelect: setStatusFilter,
      },
      {
        key: "type",
        label: "Type",
        allLabel: "All Types",
        options: typeOptions,
        selectedId: typeFilter,
        onSelect: setTypeFilter,
      },
      {
        key: "quality",
        label: "Quality",
        allLabel: "All Quality",
        options: qualityOptions,
        selectedId: qualityFilter,
        onSelect: setQualityFilter,
      },
    ];
    if (hostnames.length > 0) {
      defs.push({
        key: "host",
        label: "Host",
        allLabel: "All Hosts",
        options: hostOptions,
        selectedId: hostFilter,
        onSelect: setHostFilter,
      });
    }
    return defs;
  }, [
    statusOptions,
    typeOptions,
    qualityOptions,
    hostOptions,
    statusFilter,
    typeFilter,
    qualityFilter,
    hostFilter,
    hostnames.length,
  ]);

  // These predicates remain source-owned because Quality and Host are derived
  // from the loaded research set, not independent source-table columns. The
  // canonical table owns the container and Clear filters invokes this reset.
  const resetSourceFilters = () => {
    setSearch("");
    setStatusFilter(null);
    setTypeFilter(null);
    setQualityFilter(null);
    setHostFilter(null);
  };

  const toolbarFacets: MatrxDataTableToolbar["facets"] = [
    {
      type: "custom",
      id: "source-scope",
      render: () => <SourceScopeFilterPopover filters={filterDefs} />,
      filter: {
        active: Boolean(
          search || statusFilter || typeFilter || qualityFilter || hostFilter,
        ),
        onReset: resetSourceFilters,
      },
    },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-3 sm:p-4">
        {isLoading ? (
          <div className="space-y-1.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            {sources?.length === 200 && (
              <p className="mb-2 text-[11px] text-muted-foreground">
                This view loaded its first 200 sources; more sources may exist.
              </p>
            )}
            <SourceResultsTable
              interactive
              sources={filtered}
              topicId={topicId}
              rankFor={(s) => importanceMap?.get(s.id)?.bestRank ?? null}
              dataSizeFor={(s) => charCountMap.get(s.id) ?? null}
              analysisFor={(s) => analysisMap.get(s.id) ?? null}
              toolbarFacets={toolbarFacets}
              sourceSearch={search}
              onSourceSearchChange={setSearch}
              emptyState={{
                title: scraped.length === 0 ? "No content yet" : "No matches",
                description:
                  scraped.length === 0
                    ? "Read your sources to collect page content for analysis and synthesis."
                    : "Try adjusting search or filters to find what you need.",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
