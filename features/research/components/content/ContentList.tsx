"use client";

import { useState, useMemo } from "react";
import { FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTopicContext } from "../../context/ResearchContext";
import {
  useResearchSources,
  useSourceImportance,
} from "../../hooks/useResearchState";
import { SCRAPE_STATUS_CONFIG, SOURCE_TYPE_CONFIG } from "../../constants";
import { ResearchFilterBar, type FilterDef } from "../shared/ResearchFilterBar";
import type { FilterOption } from "@/components/hierarchy-filter/HierarchyFilterPill";
import type { ResearchSource } from "../../types";
import { filterAndSortBySearch } from "@/utils/search-scoring";
import { SourceResultsTable } from "../sources/SourceResultsTable";

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

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-3 sm:px-4 pt-3 pb-2">
        <ResearchFilterBar
          title="Content"
          count={isLoading ? "—" : `${filtered.length}/${scraped.length}`}
          filters={filterDefs}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search title, url, description, host..."
        />
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4">
        {isLoading ? (
          <div className="space-y-1.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[280px] gap-3 text-center px-4">
            <div className="h-12 w-12 rounded-2xl bg-primary/8 flex items-center justify-center">
              <FileText className="h-6 w-6 text-primary/40" />
            </div>
            <div>
              <p className="text-xs font-medium text-foreground/70">
                {scraped.length === 0 ? "No content yet" : "No matches"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1 max-w-[240px]">
                {scraped.length === 0
                  ? "Scrape your sources to collect page content for analysis and synthesis."
                  : "Try adjusting your search or filters to find what you're looking for."}
              </p>
            </div>
          </div>
        ) : (
          <SourceResultsTable
            sources={filtered}
            topicId={topicId}
            rankFor={(s) => importanceMap?.get(s.id)?.bestRank ?? null}
          />
        )}
      </div>
    </div>
  );
}
