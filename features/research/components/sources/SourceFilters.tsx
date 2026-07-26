"use client";

import { useMemo } from "react";
import { ResearchFilterBar, type FilterDef } from "../shared/ResearchFilterBar";
import {
  SCRAPE_STATUS_CONFIG,
  SOURCE_TYPE_CONFIG,
  ORIGIN_CONFIG,
} from "../../constants";
import type { ResearchKeyword, SourceFilters as Filters } from "../../types";
import type { FilterOption } from "@/components/hierarchy-filter/HierarchyFilterPill";
import type { ReactNode } from "react";

interface SourceFiltersProps {
  filters: Filters;
  onFilterChange: (updates: Partial<Filters>) => void;
  onReset: () => void;
  hasActiveFilters: boolean;
  keywords: ResearchKeyword[];
  hostnames: string[];
  count: string;
  search?: string;
  onSearchChange?: (value: string) => void;
  trailing?: ReactNode;
}

export function SourceFilters({
  filters,
  onFilterChange,
  onReset,
  hasActiveFilters,
  keywords,
  hostnames,
  count,
  search,
  onSearchChange,
  trailing,
}: SourceFiltersProps) {
  const keywordOptions: FilterOption[] = useMemo(
    () =>
      keywords.map((kw) => ({
        id: kw.id,
        label: kw.keyword,
        count: kw.result_count ?? undefined,
      })),
    [keywords],
  );

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

  const originOptions: FilterOption[] = useMemo(
    () =>
      Object.entries(ORIGIN_CONFIG).map(([key, config]) => ({
        id: key,
        label: config.label,
      })),
    [],
  );

  const hostOptions: FilterOption[] = useMemo(
    () => hostnames.map((h) => ({ id: h, label: h })),
    [hostnames],
  );

  const filterDefs: FilterDef[] = useMemo(() => {
    const defs: FilterDef[] = [
      {
        key: "keyword",
        label: "Keyword",
        allLabel: "All Keywords",
        options: keywordOptions,
        selectedId: filters.keyword_id ?? null,
        onSelect: (id) => onFilterChange({ keyword_id: id ?? undefined }),
      },
      {
        key: "status",
        label: "Status",
        allLabel: "All Statuses",
        options: statusOptions,
        selectedId: filters.scrape_status ?? null,
        onSelect: (id) =>
          onFilterChange({
            scrape_status: (id ?? undefined) as Filters["scrape_status"],
          }),
      },
      {
        key: "type",
        label: "Type",
        allLabel: "All Types",
        options: typeOptions,
        selectedId: filters.source_type ?? null,
        onSelect: (id) =>
          onFilterChange({
            source_type: (id ?? undefined) as Filters["source_type"],
          }),
      },
      {
        key: "origin",
        label: "Origin",
        allLabel: "All Origins",
        options: originOptions,
        selectedId: filters.origin ?? null,
        onSelect: (id) =>
          onFilterChange({ origin: (id ?? undefined) as Filters["origin"] }),
      },
    ];
    if (hostnames.length > 0) {
      defs.push({
        key: "host",
        label: "Host",
        allLabel: "All Hosts",
        options: hostOptions,
        selectedId: filters.hostname ?? null,
        onSelect: (id) => onFilterChange({ hostname: id ?? undefined }),
      });
    }
    return defs;
  }, [
    keywordOptions,
    statusOptions,
    typeOptions,
    originOptions,
    hostOptions,
    filters,
    onFilterChange,
    hostnames.length,
  ]);

  return (
    <ResearchFilterBar
      title="Sources"
      count={`${count}`}
      filters={filterDefs}
      search={search}
      onSearchChange={onSearchChange}
      searchPlaceholder="Search title, url, host..."
      trailing={trailing}
    />
  );
}
