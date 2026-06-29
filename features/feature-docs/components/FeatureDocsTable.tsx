"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpDown,
  ExternalLink,
  FileText,
  RefreshCw,
  Search,
} from "lucide-react";
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
import { featureDocViewHref } from "@/features/feature-docs/sync-utils";

type SortField =
  "path" | "title" | "area" | "slug" | "synced_at" | "updated_at" | "version";
type SortDirection = "asc" | "desc";

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

export default function FeatureDocsTable() {
  const [rows, setRows] = useState<FeatureDocListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("path");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

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

  const areas = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      if (row.area) set.add(row.area);
    }
    return [...set].sort();
  }, [rows]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows.filter((row) => {
      if (areaFilter !== "all" && (row.area ?? "") !== areaFilter) return false;
      if (!q) return true;
      return (
        row.path.toLowerCase().includes(q) ||
        (row.title ?? "").toLowerCase().includes(q) ||
        (row.slug ?? "").toLowerCase().includes(q) ||
        (row.area ?? "").toLowerCase().includes(q)
      );
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
  }, [rows, search, areaFilter, sortField, sortDirection]);

  if (loading && rows.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <MatrxMiniLoader />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search path, title, slug, area…"
            className="h-8 pl-8 text-sm"
          />
        </div>
        <Select value={areaFilter} onValueChange={setAreaFilter}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder="Area" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All areas</SelectItem>
            {areas.map((area) => (
              <SelectItem key={area} value={area}>
                {area}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="text-xs">
          {filtered.length} / {rows.length}
        </Badge>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
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
              {(
                [
                  ["path", "Path"],
                  ["title", "Title"],
                  ["area", "Area"],
                  ["slug", "Slug"],
                  ["synced_at", "Synced"],
                  ["version", "Ver"],
                ] as const
              ).map(([field, label]) => (
                <TableHead key={field} className="min-w-[120px]">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs font-semibold hover:text-primary"
                    onClick={() => handleSort(field)}
                  >
                    {label}
                    <ArrowUpDown className="h-3 w-3" />
                    <SortIcon
                      field={field}
                      sortField={sortField}
                      sortDirection={sortDirection}
                    />
                  </button>
                </TableHead>
              ))}
              <TableHead className="w-[80px]" />
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
                  No docs match. Run{" "}
                  <code className="font-mono text-xs">
                    pnpm sync:feature-docs -- --push
                  </code>{" "}
                  to seed from the repo.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}
