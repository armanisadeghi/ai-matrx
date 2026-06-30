"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpDown, ExternalLink, FileText, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { formatAbsoluteDate, formatRelativeTime } from "@/utils/datetime";
import {
  listFeatureDocs,
  type FeatureDocListRow,
} from "@/features/feature-docs/service";
import {
  pathMatchesZone,
  type FeatureDocDotDir,
  type FeatureDocZone,
} from "@/features/feature-docs/constants";
import { featureDocViewHref } from "@/features/feature-docs/sync-utils";
import {
  buildPathFilterRules,
  matchesPathFilter,
} from "@/features/feature-docs/utils/path-filter";

type SortField = "path" | "title" | "area" | "slug" | "synced_at" | "version";
type SortDirection = "asc" | "desc";

interface ColumnFilters {
  pathInclude: string;
  pathExclude: string;
  title: string;
  area: string;
  slug: string;
  synced: "all" | "synced" | "never";
  version: string;
}

const EMPTY_FILTERS: ColumnFilters = {
  pathInclude: "",
  pathExclude: "",
  title: "",
  area: "all",
  slug: "",
  synced: "all",
  version: "",
};

function SortIcon({
  field,
  sortField,
  sortDirection,
}: {
  field: SortField;
  sortField: SortField;
  sortDirection: SortDirection;
}) {
  if (sortField !== field) return null;
  return (
    <span className="text-[10px] text-muted-foreground">
      {sortDirection === "asc" ? "↑" : "↓"}
    </span>
  );
}

export interface FeatureDocsTableProps {
  zone: FeatureDocZone;
  dotDir?: FeatureDocDotDir;
}

export default function FeatureDocsTable({
  zone,
  dotDir,
}: FeatureDocsTableProps) {
  const [rows, setRows] = useState<FeatureDocListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("path");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [filters, setFilters] = useState<ColumnFilters>(EMPTY_FILTERS);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listFeatureDocs();
      setRows(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load feature docs",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const zoneRows = useMemo(
    () => rows.filter((row) => pathMatchesZone(row.path, zone, dotDir)),
    [rows, zone, dotDir],
  );

  const areaOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of zoneRows) {
      if (row.area) set.add(row.area);
    }
    return [...set].sort();
  }, [zoneRows]);

  const pathRules = useMemo(
    () => buildPathFilterRules(filters.pathInclude, filters.pathExclude),
    [filters.pathInclude, filters.pathExclude],
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const updateFilter = <K extends keyof ColumnFilters>(
    key: K,
    value: ColumnFilters[K],
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const filtered = useMemo(() => {
    const titleQ = filters.title.trim().toLowerCase();
    const slugQ = filters.slug.trim().toLowerCase();
    const versionQ = filters.version.trim();

    let list = zoneRows.filter((row) => {
      if (!matchesPathFilter(row.path, pathRules)) return false;

      if (filters.area !== "all" && (row.area ?? "") !== filters.area) {
        return false;
      }

      if (titleQ && !(row.title ?? "").toLowerCase().includes(titleQ)) {
        return false;
      }

      if (slugQ && !(row.slug ?? "").toLowerCase().includes(slugQ)) {
        return false;
      }

      if (filters.synced === "synced" && !row.synced_at) return false;
      if (filters.synced === "never" && row.synced_at) return false;

      if (versionQ) {
        const v = String(row.version);
        if (!v.includes(versionQ)) return false;
      }

      return true;
    });

    list = [...list].sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      const aStr = av == null ? "" : String(av);
      const bStr = bv == null ? "" : String(bv);
      const cmp = aStr.localeCompare(bStr, undefined, { sensitivity: "base" });
      return sortDirection === "asc" ? cmp : -cmp;
    });

    return list;
  }, [zoneRows, pathRules, filters, sortField, sortDirection]);

  const clearFilters = () => setFilters(EMPTY_FILTERS);

  if (loading && rows.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <MatrxMiniLoader />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        <Badge variant="secondary" className="text-xs">
          {filtered.length} / {zoneRows.length}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={clearFilters}
        >
          Clear filters
        </Button>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          className="h-7"
          onClick={() => void load()}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="px-4 py-2 text-sm text-destructive border-b border-border">
          {error}
        </div>
      )}

      <ScrollArea className="flex-1">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead className="min-w-[220px] align-top">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-semibold hover:text-primary mb-1"
                  onClick={() => handleSort("path")}
                >
                  Path
                  <ArrowUpDown className="h-3 w-3" />
                  <SortIcon
                    field="path"
                    sortField={sortField}
                    sortDirection={sortDirection}
                  />
                </button>
                <div className="space-y-1">
                  <Input
                    value={filters.pathInclude}
                    onChange={(e) =>
                      updateFilter("pathInclude", e.target.value)
                    }
                    placeholder="Include: features/**, **/FEATURE.md"
                    className="h-7 text-[11px] font-mono"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Input
                    value={filters.pathExclude}
                    onChange={(e) =>
                      updateFilter("pathExclude", e.target.value)
                    }
                    placeholder="Exclude: **/README.md, !docs/**"
                    className="h-7 text-[11px] font-mono"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </TableHead>

              <TableHead className="min-w-[160px] align-top">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-semibold hover:text-primary mb-1"
                  onClick={() => handleSort("title")}
                >
                  Title
                  <ArrowUpDown className="h-3 w-3" />
                  <SortIcon
                    field="title"
                    sortField={sortField}
                    sortDirection={sortDirection}
                  />
                </button>
                <Input
                  value={filters.title}
                  onChange={(e) => updateFilter("title", e.target.value)}
                  placeholder="Filter title…"
                  className="h-7 text-xs"
                  onClick={(e) => e.stopPropagation()}
                />
              </TableHead>

              <TableHead className="min-w-[120px] align-top">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-semibold hover:text-primary mb-1"
                  onClick={() => handleSort("area")}
                >
                  Area
                  <ArrowUpDown className="h-3 w-3" />
                  <SortIcon
                    field="area"
                    sortField={sortField}
                    sortDirection={sortDirection}
                  />
                </button>
                <Select
                  value={filters.area}
                  onValueChange={(v) => updateFilter("area", v)}
                >
                  <SelectTrigger
                    className="h-7 text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {areaOptions.map((area) => (
                      <SelectItem key={area} value={area}>
                        {area}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableHead>

              <TableHead className="min-w-[120px] align-top">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-semibold hover:text-primary mb-1"
                  onClick={() => handleSort("slug")}
                >
                  Slug
                  <ArrowUpDown className="h-3 w-3" />
                  <SortIcon
                    field="slug"
                    sortField={sortField}
                    sortDirection={sortDirection}
                  />
                </button>
                <Input
                  value={filters.slug}
                  onChange={(e) => updateFilter("slug", e.target.value)}
                  placeholder="Filter slug…"
                  className="h-7 text-xs font-mono"
                  onClick={(e) => e.stopPropagation()}
                />
              </TableHead>

              <TableHead className="min-w-[100px] align-top">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-semibold hover:text-primary mb-1"
                  onClick={() => handleSort("synced_at")}
                >
                  Synced
                  <ArrowUpDown className="h-3 w-3" />
                  <SortIcon
                    field="synced_at"
                    sortField={sortField}
                    sortDirection={sortDirection}
                  />
                </button>
                <Select
                  value={filters.synced}
                  onValueChange={(v) =>
                    updateFilter("synced", v as ColumnFilters["synced"])
                  }
                >
                  <SelectTrigger
                    className="h-7 text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="synced">Synced</SelectItem>
                    <SelectItem value="never">Never synced</SelectItem>
                  </SelectContent>
                </Select>
              </TableHead>

              <TableHead className="min-w-[72px] align-top">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-semibold hover:text-primary mb-1"
                  onClick={() => handleSort("version")}
                >
                  Ver
                  <ArrowUpDown className="h-3 w-3" />
                  <SortIcon
                    field="version"
                    sortField={sortField}
                    sortDirection={sortDirection}
                  />
                </button>
                <Input
                  value={filters.version}
                  onChange={(e) => updateFilter("version", e.target.value)}
                  placeholder="e.g. 2"
                  className="h-7 text-xs tabular-nums"
                  onClick={(e) => e.stopPropagation()}
                />
              </TableHead>

              <TableHead className="w-[72px] align-top pt-6" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-xs max-w-[280px] truncate">
                  {row.path}
                </TableCell>
                <TableCell className="text-sm max-w-[200px] truncate">
                  {row.title ?? "—"}
                </TableCell>
                <TableCell className="text-xs">
                  {row.area ? (
                    <Badge variant="outline" className="text-[10px]">
                      {row.area}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {row.slug ?? "—"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {row.synced_at ? (
                    <span title={formatAbsoluteDate(row.synced_at)}>
                      {formatRelativeTime(row.synced_at)}
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-xs tabular-nums">
                  {row.version}
                </TableCell>
                <TableCell>
                  <Link
                    href={featureDocViewHref(row.path)}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <FileText className="h-3 w-3" />
                    Open
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-sm text-muted-foreground py-8"
                >
                  No docs in this zone match your filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}
