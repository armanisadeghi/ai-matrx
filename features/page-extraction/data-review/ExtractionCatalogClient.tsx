"use client";

/**
 * features/page-extraction/data-review/ExtractionCatalogClient.tsx
 *
 * The cross-document catalog at /knowledge/extractions — the "savior" list
 * page for extraction data. Every dataset the user owns, regardless of which
 * PDF it came from: searchable, sortable, context-filterable, with a live
 * context-status nudge per row. Clicking a row opens the full grid.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpDown,
  Database,
  FileText,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Table2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import {
  ContextAssignmentField,
  type ContextSelection,
} from "@/features/scopes/components/context-assignment/ContextAssignmentField";
import { ContextStatusButton } from "@/features/scopes/components/context-assignment/ContextStatusButton";
import {
  fetchEntityScopesBulk,
  primeEntityScopes,
  setRowScopes,
} from "@/features/scopes/components/context-assignment/data";

import { listExtractionCatalog, type ExtractionCatalogEntry } from "./data";
import { EXTRACTION_ENTITY_TYPE } from "./constants";

type SortKey = "updated" | "name" | "rows" | "source";

const STATUS_STYLES: Record<string, string> = {
  completed:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  running: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400",
  queued:
    "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400",
  cancelled: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

export function ExtractionCatalogClient() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [entries, setEntries] = useState<ExtractionCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showFilter, setShowFilter] = useState(false);
  const [filterScopeIds, setFilterScopeIds] = useState<string[]>([]);
  const [scopesByJob, setScopesByJob] = useState<Record<string, string[]>>({});
  const [navigatingId, setNavigatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listExtractionCatalog();
      setEntries(data);
      setError(null);
      const ids = data.map((d) => d.jobId);
      primeEntityScopes(EXTRACTION_ENTITY_TYPE, ids);
      const byEntity = await fetchEntityScopesBulk(EXTRACTION_ENTITY_TYPE, ids);
      setScopesByJob(byEntity);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load extractions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir(key === "name" || key === "source" ? "asc" : "desc");
      }
    },
    [sortKey],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = entries;
    if (q) {
      rows = rows.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.sourceName.toLowerCase().includes(q),
      );
    }
    if (filterScopeIds.length > 0) {
      const need = new Set(filterScopeIds);
      rows = rows.filter((e) => {
        const tags = scopesByJob[e.jobId] ?? [];
        return tags.some((t) => need.has(t));
      });
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "source":
          return a.sourceName.localeCompare(b.sourceName) * dir;
        case "rows":
          return (a.rowCount - b.rowCount) * dir;
        case "updated":
        default:
          return (
            (new Date(a.updatedAt).getTime() -
              new Date(b.updatedAt).getTime()) *
            dir
          );
      }
    });
  }, [entries, query, filterScopeIds, scopesByJob, sortKey, sortDir]);

  const onFilterChange = useCallback((sel: ContextSelection) => {
    setFilterScopeIds(sel.scopeIds);
  }, []);

  const open = useCallback(
    (jobId: string) => {
      setNavigatingId(jobId);
      startTransition(() => router.push(`/knowledge/extractions/${jobId}`));
    },
    [router],
  );

  const totalRows = useMemo(
    () => entries.reduce((acc, e) => acc + e.rowCount, 0),
    [entries],
  );

  return (
    <div className="w-full h-page flex flex-col overflow-hidden bg-textured">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Database className="h-5 w-5 text-primary shrink-0" />
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight">
              Extraction Data
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              {entries.length} dataset{entries.length === 1 ? "" : "s"} ·{" "}
              {totalRows.toLocaleString()} extracted row
              {totalRows === 1 ? "" : "s"} across your documents
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button
            size="sm"
            onClick={() =>
              startTransition(() => router.push("/tools/pdf-extractor"))
            }
            title="New extraction"
          >
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">New extraction</span>
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-2 border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search datasets and sources…"
              className="h-9 pl-8 text-base sm:text-sm"
              style={{ fontSize: "16px" }}
            />
          </div>
          <Button
            variant={
              showFilter || filterScopeIds.length > 0 ? "default" : "outline"
            }
            size="sm"
            onClick={() => setShowFilter((v) => !v)}
            title="Filter by context"
          >
            <Filter className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">
              Context
              {filterScopeIds.length > 0 ? ` (${filterScopeIds.length})` : ""}
            </span>
          </Button>
        </div>
        {showFilter && (
          <div className="rounded-md border border-border bg-card p-2">
            <ContextAssignmentField
              mode="filter"
              writeMode="preview"
              sectionHeight={220}
              onSelectionChange={onFilterChange}
            />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading datasets…
          </div>
        ) : error ? (
          <div className="m-4 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState hasAny={entries.length > 0} />
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <Th
                  onClick={() => toggleSort("name")}
                  active={sortKey === "name"}
                >
                  Dataset
                </Th>
                <Th
                  onClick={() => toggleSort("source")}
                  active={sortKey === "source"}
                >
                  Source
                </Th>
                <Th
                  onClick={() => toggleSort("rows")}
                  active={sortKey === "rows"}
                  className="text-right"
                >
                  Rows
                </Th>
                <th className="px-3 py-2 font-medium">Status</th>
                <Th
                  onClick={() => toggleSort("updated")}
                  active={sortKey === "updated"}
                >
                  Updated
                </Th>
                <th className="px-3 py-2 font-medium text-center">Context</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => {
                const tags = scopesByJob[e.jobId] ?? [];
                const isNav = navigatingId === e.jobId && isPending;
                return (
                  <tr
                    key={e.jobId}
                    onClick={() => open(e.jobId)}
                    className="group cursor-pointer border-b border-border/60 transition-colors hover:bg-accent/50"
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {isNav ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                        ) : (
                          <Table2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="font-medium">{e.name}</span>
                        {e.kind === "validation" && (
                          <span className="rounded bg-secondary/15 px-1.5 py-0.5 text-[10px] font-medium text-secondary">
                            validation
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate max-w-[220px]">
                          {e.sourceName}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {e.rowCount.toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      {e.latestRunStatus ? (
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[11px] font-medium capitalize",
                            STATUS_STYLES[e.latestRunStatus] ??
                              STATUS_STYLES.cancelled,
                          )}
                        >
                          {e.latestRunStatus}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                      {formatRelative(e.updatedAt)}
                    </td>
                    <td
                      className="px-3 py-2 text-center"
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      <ContextStatusButton
                        size="xs"
                        knownScopeCount={tags.length}
                        subject={{
                          entityType: EXTRACTION_ENTITY_TYPE,
                          entityId: e.jobId,
                          title: e.name,
                          subtitle: e.sourceName,
                          icon: Table2,
                        }}
                        onSaved={(r) => {
                          if (r.ok) {
                            setRowScopes(
                              EXTRACTION_ENTITY_TYPE,
                              e.jobId,
                              r.selection.scopeIds,
                            );
                            setScopesByJob((prev) => ({
                              ...prev,
                              [e.jobId]: r.selection.scopeIds,
                            }));
                            toast.success("Context updated");
                          }
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Th({
  children,
  onClick,
  active,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  className?: string;
}) {
  return (
    <th
      onClick={onClick}
      className={cn(
        "cursor-pointer select-none px-3 py-2 font-medium hover:text-foreground",
        active && "text-foreground",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <ArrowUpDown
          className={cn("h-3 w-3", active ? "opacity-100" : "opacity-30")}
        />
      </span>
    </th>
  );
}

function EmptyState({ hasAny }: { hasAny: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 p-12 text-center text-muted-foreground">
      <ShieldCheck className="h-8 w-8 opacity-50" />
      <div className="text-sm font-medium">
        {hasAny ? "No datasets match your filters" : "No extraction data yet"}
      </div>
      <div className="max-w-sm text-xs">
        {hasAny
          ? "Try clearing the search or context filter."
          : "Run an extraction from the PDF Extractor and your structured results will collect here, ready to review, export, and organize."}
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
