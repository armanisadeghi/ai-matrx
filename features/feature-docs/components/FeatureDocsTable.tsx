"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, FileText, RefreshCw } from "lucide-react";
import {
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import { Input } from "@ai-matrx/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export interface FeatureDocsTableProps {
  zone: FeatureDocZone;
  dotDir?: FeatureDocDotDir;
}

export function filterFeatureDocRows(
  rows: FeatureDocListRow[],
  zone: FeatureDocZone,
  dotDir: FeatureDocDotDir | undefined,
  filters: ColumnFilters,
) {
  const pathRules = buildPathFilterRules(
    filters.pathInclude,
    filters.pathExclude,
  );
  const titleQuery = filters.title.trim().toLowerCase();
  const slugQuery = filters.slug.trim().toLowerCase();
  const versionQuery = filters.version.trim();

  return rows.filter((row) => {
    if (!pathMatchesZone(row.path, zone, dotDir)) return false;
    if (!matchesPathFilter(row.path, pathRules)) return false;
    if (filters.area !== "all" && (row.area ?? "") !== filters.area) {
      return false;
    }
    if (titleQuery && !(row.title ?? "").toLowerCase().includes(titleQuery)) {
      return false;
    }
    if (slugQuery && !(row.slug ?? "").toLowerCase().includes(slugQuery)) {
      return false;
    }
    if (filters.synced === "synced" && !row.synced_at) return false;
    if (filters.synced === "never" && row.synced_at) return false;
    if (versionQuery && !String(row.version).includes(versionQuery)) {
      return false;
    }
    return true;
  });
}

const columns: MatrxColumnDef<FeatureDocListRow>[] = [
  {
    id: "path",
    accessorKey: "path",
    header: "Path",
    label: "Path",
    sortValue: (row) => row.path,
    filter: false,
    cell: (row) => (
      <span className="block max-w-[280px] truncate font-mono text-xs">
        {row.path}
      </span>
    ),
  },
  {
    id: "title",
    accessorKey: "title",
    header: "Title",
    label: "Title",
    sortValue: (row) => row.title ?? "",
    filter: false,
    cell: (row) => (
      <span className="block max-w-[200px] truncate text-sm">
        {row.title ?? "—"}
      </span>
    ),
  },
  {
    id: "area",
    accessorKey: "area",
    header: "Area",
    label: "Area",
    sortValue: (row) => row.area ?? "",
    filter: false,
    cell: (row) =>
      row.area ? (
        <Badge variant="outline" className="text-[10px]">
          {row.area}
        </Badge>
      ) : (
        "—"
      ),
  },
  {
    id: "slug",
    accessorKey: "slug",
    header: "Slug",
    label: "Slug",
    sortValue: (row) => row.slug ?? "",
    filter: false,
    cell: (row) => <span className="font-mono text-xs">{row.slug ?? "—"}</span>,
  },
  {
    id: "synced_at",
    accessorKey: "synced_at",
    header: "Synced",
    label: "Synced",
    sortValue: (row) => row.synced_at ?? "",
    filter: false,
    cell: (row) =>
      row.synced_at ? (
        <span
          className="whitespace-nowrap text-xs text-muted-foreground"
          title={formatAbsoluteDate(row.synced_at)}
        >
          {formatRelativeTime(row.synced_at)}
        </span>
      ) : (
        "—"
      ),
  },
  {
    id: "version",
    accessorKey: "version",
    header: "Ver",
    label: "Version",
    sortValue: (row) => String(row.version),
    filter: false,
    cell: (row) => <span className="text-xs tabular-nums">{row.version}</span>,
  },
];

export default function FeatureDocsTable({
  zone,
  dotDir,
}: FeatureDocsTableProps) {
  const [rows, setRows] = useState<FeatureDocListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ColumnFilters>(EMPTY_FILTERS);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRows(await listFeatureDocs());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Failed to load feature docs",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const zoneRows = rows.filter((row) =>
    pathMatchesZone(row.path, zone, dotDir),
  );
  const filteredRows = filterFeatureDocRows(rows, zone, dotDir, filters);
  const areaOptions = [
    ...new Set(zoneRows.flatMap((row) => (row.area ? [row.area] : []))),
  ].sort();

  function updateFilter<K extends keyof ColumnFilters>(
    key: K,
    value: ColumnFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  if (loading && rows.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <MatrxMiniLoader />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {error && (
        <div className="border-b border-border px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <MatrxDataTable<FeatureDocListRow>
        data={filteredRows}
        columns={columns}
        getRowId={(row) => row.id}
        defaultSort={{ id: "path", direction: "asc" }}
        isFetching={loading && rows.length > 0}
        pageSize={0}
        emptyState={{
          title: "No docs in this zone match your filters.",
        }}
        toolbar={{
          search: false,
          leading: (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {filteredRows.length} / {zoneRows.length}
              </Badge>
              <Input
                value={filters.pathInclude}
                onChange={(event) =>
                  updateFilter("pathInclude", event.target.value)
                }
                placeholder="Include: features/**, **/FEATURE.md"
                className="h-8 w-60 font-mono text-xs"
                aria-label="Include paths"
              />
              <Input
                value={filters.pathExclude}
                onChange={(event) =>
                  updateFilter("pathExclude", event.target.value)
                }
                placeholder="Exclude: **/README.md, !docs/**"
                className="h-8 w-60 font-mono text-xs"
                aria-label="Exclude paths"
              />
              <Input
                value={filters.title}
                onChange={(event) => updateFilter("title", event.target.value)}
                placeholder="Filter title…"
                className="h-8 w-40 text-xs"
                aria-label="Filter title"
              />
              <Select
                value={filters.area}
                onValueChange={(value) => updateFilter("area", value)}
              >
                <SelectTrigger
                  className="h-8 w-32 text-xs"
                  aria-label="Filter area"
                >
                  <SelectValue placeholder="All areas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All areas</SelectItem>
                  {areaOptions.map((area) => (
                    <SelectItem key={area} value={area}>
                      {area}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={filters.slug}
                onChange={(event) => updateFilter("slug", event.target.value)}
                placeholder="Filter slug…"
                className="h-8 w-36 font-mono text-xs"
                aria-label="Filter slug"
              />
              <Select
                value={filters.synced}
                onValueChange={(value) =>
                  updateFilter("synced", value as ColumnFilters["synced"])
                }
              >
                <SelectTrigger
                  className="h-8 w-32 text-xs"
                  aria-label="Filter sync state"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sync states</SelectItem>
                  <SelectItem value="synced">Synced</SelectItem>
                  <SelectItem value="never">Never synced</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={filters.version}
                onChange={(event) =>
                  updateFilter("version", event.target.value)
                }
                placeholder="Version…"
                className="h-8 w-24 text-xs tabular-nums"
                aria-label="Filter version"
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setFilters(EMPTY_FILTERS)}
              >
                Clear filters
              </Button>
            </div>
          ),
          actions: (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => void load()}
            >
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              Refresh
            </Button>
          ),
        }}
        rowActions={(row) => (
          <Link
            href={featureDocViewHref(row.path)}
            target="_blank"
            className="inline-flex items-center gap-1 text-xs text-primary"
          >
            <FileText className="h-3 w-3" />
            Open
            <ExternalLink className="h-3 w-3" />
          </Link>
        )}
        mobileCards={(row, _index, controls) => (
          <article className="space-y-2 rounded-md border border-border p-3 text-sm">
            <p className="break-all font-mono text-xs">{row.path}</p>
            <p>{row.title ?? "—"}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{row.area ?? "No area"}</span>
              <span>{row.slug ?? "No slug"}</span>
              <span>
                {row.synced_at
                  ? formatRelativeTime(row.synced_at)
                  : "Never synced"}
              </span>
              <span>v{row.version}</span>
            </div>
            {controls.actions}
          </article>
        )}
      />
    </div>
  );
}
