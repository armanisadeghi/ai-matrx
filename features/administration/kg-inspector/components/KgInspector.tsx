"use client";

/**
 * features/administration/kg-inspector/components/KgInspector.tsx
 *
 * Read-only KG data inspector (Phase C.5). Three tabs over the existing
 * rag.kg_* graph tables:
 *   - Entities  — sortable/filterable column headers (kind, name, org, counts,
 *                 confidence, created); server filters + client sort within 200 rows.
 *   - Mentions  — per-entity drill-down (selected from the Entities tab),
 *                 each mention deep-links to its source via citationHrefFor().
 *   - Top edges — sortable/filterable column headers (source, edge kind, target, weight).
 *
 * This is an admin forensic surface (the (admin) layout already super-admin
 * gates it) so the product owner can eyeball NER quality + entity volume as
 * the graph fills, before committing to the full cytoscape view (Phase G).
 * Pure reads through the typed kgInspectorService → Python backend.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Database,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Search,
  Network,
  ListTree,
} from "lucide-react";

import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { KgInspectorColumnHeader } from "./KgInspectorColumnHeader";
import {
  applyColumnFilters,
  sortRows,
  toggleSort,
  type ColumnDef,
  type ColumnFilter,
  type SortDirection,
} from "../utils/tableFilters";
import {
  fetchOrganizationNamesByIds,
  organizationDisplayName,
} from "../utils/organizationNames";
import { citationHrefFor, type RagSearchHit } from "@/features/rag/api/search";
import {
  listKgEntities,
  listKgEntityMentions,
  listKgTopEdges,
  type KgEntityRow,
  type KgMentionRow,
  type KgEdgeRow,
} from "../service/kgInspectorService";

const PAGE_SIZE = 50;
const FETCH_MAX = 200;
const ANY = "__any__";

type EntitySortKey =
  | "kind"
  | "canonical_name"
  | "organization_name"
  | "mention_count"
  | "source_count"
  | "confidence_avg"
  | "created_at";

type EdgeSortKey = "source" | "kind" | "target" | "weight";

const ENTITY_CLIENT_COLUMNS: ColumnDef<KgEntityRow>[] = [
  {
    key: "mention_count",
    type: "number",
    getValue: (row) => row.mention_count,
  },
  {
    key: "source_count",
    type: "number",
    getValue: (row) => row.source_count,
  },
  {
    key: "confidence_avg",
    type: "number",
    getValue: (row) => row.confidence_avg,
  },
  {
    key: "created_at",
    type: "date",
    getValue: (row) => row.created_at,
  },
];

const ENTITY_SORT_COLUMNS: ColumnDef<KgEntityRow>[] = [
  { key: "kind", type: "enum", getValue: (row) => row.kind },
  {
    key: "canonical_name",
    type: "text",
    getValue: (row) => row.canonical_name,
  },
  ...ENTITY_CLIENT_COLUMNS,
];

const EDGE_COLUMNS: ColumnDef<KgEdgeRow>[] = [
  {
    key: "source",
    type: "text",
    getValue: (row) => `${row.src_kind} ${row.src_name}`,
  },
  { key: "kind", type: "enum", getValue: (row) => row.kind },
  {
    key: "target",
    type: "text",
    getValue: (row) => `${row.dst_kind} ${row.dst_name}`,
  },
  { key: "weight", type: "number", getValue: (row) => row.weight },
];

// Code-graph kinds are present today; NER widens this set as Phase C fills.
const ENTITY_KINDS = [
  "person",
  "organization",
  "address",
  "phone",
  "email",
  "url",
  "date",
  "concept",
  "module",
  "code_file",
  "unresolved_symbol",
] as const;

const EDGE_KINDS = [
  "co_occurs_with",
  "imports",
  "calls",
  "references",
] as const;

function KindChip({ kind }: { kind: string }) {
  return (
    <Badge variant="secondary" className="font-mono">
      {kind}
    </Badge>
  );
}

function ConfidenceBar({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="tabular-nums text-xs text-muted-foreground">
        {value.toFixed(2)}
      </span>
    </div>
  );
}

function TableSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <TableBody>
      {Array.from({ length: rows }).map((_, r) => (
        <TableRow key={r}>
          {Array.from({ length: cols }).map((__, c) => (
            <TableCell key={c}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  );
}

// Build the minimal RagSearchHit shape citationHrefFor() reads so we reuse the
// existing source-routing map instead of re-deriving per-kind URLs.
function mentionHref(m: KgMentionRow): string | null {
  if (!m.source_kind || !m.source_id) return null;
  const hit: RagSearchHit = {
    chunk_id: m.chunk_id,
    source_kind: m.source_kind,
    source_id: m.source_id,
    field_id: null,
    parent_chunk_id: null,
    chunk_kind: "",
    snippet: m.snippet,
    score: 0,
    vector_rank: null,
    lexical_rank: null,
    rerank_score: null,
    entity_rank: null,
    entities: [],
    metadata: {},
  };
  return citationHrefFor(hit);
}

interface SelectedEntity {
  id: string;
  name: string;
  kind: string;
}

// ---------------------------------------------------------------------------

function EntitiesTab({
  onSelectEntity,
}: {
  onSelectEntity: (e: SelectedEntity) => void;
}) {
  const [rawRows, setRawRows] = useState<KgEntityRow[]>([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [orgNames, setOrgNames] = useState<Record<string, string>>({});
  const [orgNamesLoading, setOrgNamesLoading] = useState(false);
  const [kind, setKind] = useState<string>(ANY);
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<EntitySortKey>("mention_count");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [columnFilters, setColumnFilters] = useState<
    Record<string, ColumnFilter>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const organizationIds = useMemo(
    () => [
      ...new Set(
        rawRows
          .map((row) => row.organization_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ],
    [rawRows],
  );

  useEffect(() => {
    const t = setTimeout(() => setQ(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(0);
  }, [kind, q, columnFilters, sortKey, sortDir]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listKgEntities(
      {
        kind: kind === ANY ? null : kind,
        q: q || null,
        limit: FETCH_MAX,
        offset: 0,
      },
      { signal: controller.signal },
    )
      .then((pageResult) => {
        setRawRows(pageResult.items);
        setServerTotal(pageResult.total);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Failed to load entities");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [kind, q]);

  useEffect(() => {
    if (organizationIds.length === 0) {
      setOrgNames({});
      setOrgNamesLoading(false);
      return undefined;
    }

    let active = true;
    setOrgNamesLoading(true);
    fetchOrganizationNamesByIds(organizationIds)
      .then((names) => {
        if (active) setOrgNames(names);
      })
      .catch(() => {
        if (active) setOrgNames({});
      })
      .finally(() => {
        if (active) setOrgNamesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [organizationIds]);

  const entityColumnDefs = useMemo(() => {
    const organizationColumn: ColumnDef<KgEntityRow> = {
      key: "organization_name",
      type: "text",
      getValue: (row) =>
        organizationDisplayName(row.organization_id, orgNames) ?? "",
    };
    return {
      filterColumns: [organizationColumn, ...ENTITY_CLIENT_COLUMNS],
      sortColumns: [
        ...ENTITY_SORT_COLUMNS.slice(0, 2),
        organizationColumn,
        ...ENTITY_CLIENT_COLUMNS,
      ],
    };
  }, [orgNames]);

  const processedRows = useMemo(() => {
    const filtered = applyColumnFilters(
      rawRows,
      entityColumnDefs.filterColumns,
      columnFilters,
    );
    return sortRows(filtered, entityColumnDefs.sortColumns, sortKey, sortDir);
  }, [rawRows, columnFilters, sortKey, sortDir, entityColumnDefs]);

  const pageStart = processedRows.length === 0 ? 0 : page * PAGE_SIZE + 1;
  const pageEnd = Math.min((page + 1) * PAGE_SIZE, processedRows.length);
  const displayRows = processedRows.slice(
    page * PAGE_SIZE,
    page * PAGE_SIZE + PAGE_SIZE,
  );

  const handleSort = (key: string) => {
    const next = toggleSort(sortKey, sortDir, key);
    setSortKey(next.sortKey as EntitySortKey);
    setSortDir(next.sortDir);
  };

  const setColumnFilter = (key: string, value: ColumnFilter | undefined) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (!value || Object.keys(value).length === 0) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  const kindSelectOptions = [
    { value: ANY, label: "All kinds" },
    ...ENTITY_KINDS.map((k) => ({ value: k, label: k })),
  ];

  return (
    <div className="flex flex-col gap-3">
      {serverTotal > FETCH_MAX ? (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Showing up to {FETCH_MAX} of {serverTotal} matching entities. Narrow
          Kind or Name filters to refine server results; column sort and other
          filters apply within this window.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-border bg-card p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead className="min-w-[140px]">
                <KgInspectorColumnHeader
                  label="Kind"
                  sortKey="kind"
                  activeSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  filterType="enum"
                  selectValue={kind}
                  selectOptions={kindSelectOptions}
                  onSelectChange={setKind}
                />
              </TableHead>
              <TableHead className="min-w-[180px]">
                <KgInspectorColumnHeader
                  label="Canonical name"
                  sortKey="canonical_name"
                  activeSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  filterType="text"
                  textValue={searchInput}
                  onTextChange={setSearchInput}
                />
              </TableHead>
              <TableHead className="min-w-[160px]">
                <KgInspectorColumnHeader
                  label="Organization"
                  sortKey="organization_name"
                  activeSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  filterType="text"
                  textValue={columnFilters.organization_name?.text ?? ""}
                  onTextChange={(text) =>
                    setColumnFilter(
                      "organization_name",
                      text ? { text } : undefined,
                    )
                  }
                />
              </TableHead>
              <TableHead className="min-w-[120px] text-right">
                <KgInspectorColumnHeader
                  label="Mentions"
                  sortKey="mention_count"
                  activeSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  align="right"
                  filterType="number"
                  columnFilter={columnFilters.mention_count}
                  onColumnFilterChange={(value) =>
                    setColumnFilter("mention_count", value)
                  }
                />
              </TableHead>
              <TableHead className="min-w-[120px] text-right">
                <KgInspectorColumnHeader
                  label="Sources"
                  sortKey="source_count"
                  activeSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  align="right"
                  filterType="number"
                  columnFilter={columnFilters.source_count}
                  onColumnFilterChange={(value) =>
                    setColumnFilter("source_count", value)
                  }
                />
              </TableHead>
              <TableHead className="min-w-[140px]">
                <KgInspectorColumnHeader
                  label="Confidence"
                  sortKey="confidence_avg"
                  activeSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  filterType="number"
                  columnFilter={columnFilters.confidence_avg}
                  onColumnFilterChange={(value) =>
                    setColumnFilter("confidence_avg", value)
                  }
                />
              </TableHead>
              <TableHead className="min-w-[150px]">
                <KgInspectorColumnHeader
                  label="Created"
                  sortKey="created_at"
                  activeSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  filterType="date"
                  columnFilter={columnFilters.created_at}
                  onColumnFilterChange={(value) =>
                    setColumnFilter("created_at", value)
                  }
                />
              </TableHead>
              <TableHead className="w-12 text-right">
                <KgInspectorColumnHeader
                  label="Graph"
                  sortKey="graph"
                  activeSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  align="right"
                  sortable={false}
                  filterable={false}
                />
              </TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton rows={8} cols={8} />
          ) : (
            <TableBody>
              {displayRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No entities match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                displayRows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() =>
                      onSelectEntity({
                        id: row.id,
                        name: row.canonical_name,
                        kind: row.kind,
                      })
                    }
                  >
                    <TableCell>
                      <KindChip kind={row.kind} />
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      {row.canonical_name}
                    </TableCell>
                    <TableCell className="text-sm text-foreground">
                      {!row.organization_id ? (
                        "—"
                      ) : orgNamesLoading &&
                        !(row.organization_id in orgNames) ? (
                        <Skeleton className="h-4 w-28" />
                      ) : (
                        <span title={row.organization_id}>
                          {orgNames[row.organization_id] ??
                            "Unknown organization"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.mention_count}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.source_count}
                    </TableCell>
                    <TableCell>
                      <ConfidenceBar value={row.confidence_avg} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(row.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href="/knowledge/graph"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center text-muted-foreground hover:text-primary"
                        title="Open knowledge-graph canvas"
                        aria-label="View graph"
                      >
                        <Network className="h-3.5 w-3.5" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          )}
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="tabular-nums">
          {pageStart}–{pageEnd} of {processedRows.length}
          {serverTotal > processedRows.length
            ? ` (${serverTotal} server matches)`
            : ""}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0 || loading}
            onClick={() => setPage(Math.max(0, page - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pageEnd >= processedRows.length || loading}
            onClick={() => setPage(page + 1)}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MentionsTab({ entity }: { entity: SelectedEntity | null }) {
  const [rows, setRows] = useState<KgMentionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOffset(0);
  }, [entity?.id]);

  useEffect(() => {
    if (!entity) {
      setRows([]);
      setTotal(0);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listKgEntityMentions(
      entity.id,
      { limit: PAGE_SIZE, offset },
      { signal: controller.signal },
    )
      .then((page) => {
        setRows(page.items);
        setTotal(page.total);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Failed to load mentions");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [entity, offset]);

  if (!entity) {
    return (
      <div className="rounded-md border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Select an entity in the Entities tab to inspect its mentions.
      </div>
    );
  }

  const pageEnd = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <KindChip kind={entity.kind} />
        <span className="font-medium text-foreground">{entity.name}</span>
        <span className="text-sm text-muted-foreground tabular-nums">
          ({total} mentions)
        </span>
      </div>

      {error ? (
        <div className="rounded-md border border-border bg-card p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No mentions recorded for this entity yet.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((m, i) => {
            const href = mentionHref(m);
            return (
              <div
                key={`${m.chunk_id}-${i}`}
                className="rounded-md border border-border bg-card p-3"
              >
                <div className="mb-2 flex items-center gap-2">
                  {m.source_kind ? <KindChip kind={m.source_kind} /> : null}
                  {m.confidence !== null ? (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      conf {m.confidence.toFixed(2)}
                    </span>
                  ) : null}
                  {href ? (
                    <Link
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Open source
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  ) : (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {m.source_kind ?? "unknown"}:{m.source_id ?? "—"}
                    </span>
                  )}
                </div>
                <p className="text-sm text-foreground">{m.snippet || "—"}</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="tabular-nums">
          {total === 0 ? 0 : offset + 1}–{pageEnd} of {total}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pageEnd >= total || loading}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function EdgesTab() {
  const [rawRows, setRawRows] = useState<KgEdgeRow[]>([]);
  const [orgInput, setOrgInput] = useState("");
  const [orgId, setOrgId] = useState("");
  const [edgeKind, setEdgeKind] = useState<string>(ANY);
  const [sortKey, setSortKey] = useState<EdgeSortKey>("weight");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [columnFilters, setColumnFilters] = useState<
    Record<string, ColumnFilter>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setOrgId(orgInput.trim()), 350);
    return () => clearTimeout(t);
  }, [orgInput]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listKgTopEdges(
      {
        kind: edgeKind === ANY ? null : edgeKind,
        organizationId: orgId || null,
        limit: FETCH_MAX,
      },
      { signal: controller.signal },
    )
      .then((res) => setRawRows(res.items))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Failed to load edges");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [edgeKind, orgId]);

  const displayRows = useMemo(() => {
    const filtered = applyColumnFilters(rawRows, EDGE_COLUMNS, columnFilters);
    return sortRows(filtered, EDGE_COLUMNS, sortKey, sortDir);
  }, [rawRows, columnFilters, sortKey, sortDir]);

  const handleSort = (key: string) => {
    const next = toggleSort(sortKey, sortDir, key);
    setSortKey(next.sortKey as EdgeSortKey);
    setSortDir(next.sortDir);
  };

  const setColumnFilter = (key: string, value: ColumnFilter | undefined) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (!value || Object.keys(value).length === 0) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  const edgeKindOptions = [
    { value: ANY, label: "All edge kinds" },
    ...EDGE_KINDS.map((k) => ({ value: k, label: k })),
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={orgInput}
          onChange={(e) => setOrgInput(e.target.value)}
          placeholder="Organization ID (optional)"
          className="h-8 w-64 text-base"
        />
      </div>

      {error ? (
        <div className="rounded-md border border-border bg-card p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead className="min-w-[220px]">
                <KgInspectorColumnHeader
                  label="Source"
                  sortKey="source"
                  activeSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  filterType="text"
                  textValue={columnFilters.source?.text ?? ""}
                  onTextChange={(text) =>
                    setColumnFilter("source", text ? { text } : undefined)
                  }
                />
              </TableHead>
              <TableHead className="min-w-[140px]">
                <KgInspectorColumnHeader
                  label="Edge"
                  sortKey="kind"
                  activeSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  filterType="enum"
                  selectValue={edgeKind}
                  selectOptions={edgeKindOptions}
                  onSelectChange={setEdgeKind}
                />
              </TableHead>
              <TableHead className="min-w-[220px]">
                <KgInspectorColumnHeader
                  label="Target"
                  sortKey="target"
                  activeSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  filterType="text"
                  textValue={columnFilters.target?.text ?? ""}
                  onTextChange={(text) =>
                    setColumnFilter("target", text ? { text } : undefined)
                  }
                />
              </TableHead>
              <TableHead className="min-w-[120px] text-right">
                <KgInspectorColumnHeader
                  label="Weight"
                  sortKey="weight"
                  activeSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  align="right"
                  filterType="number"
                  columnFilter={columnFilters.weight}
                  onColumnFilterChange={(value) =>
                    setColumnFilter("weight", value)
                  }
                />
              </TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton rows={8} cols={4} />
          ) : (
            <TableBody>
              {displayRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No edges match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                displayRows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <KindChip kind={e.src_kind} />
                        <span className="font-medium text-foreground">
                          {e.src_name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">
                        {e.kind}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <KindChip kind={e.dst_kind} />
                        <span className="font-medium text-foreground">
                          {e.dst_name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {e.weight === null ? "—" : e.weight.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          )}
        </Table>
      </div>

      <div className="text-sm text-muted-foreground tabular-nums">
        {displayRows.length} edge{displayRows.length === 1 ? "" : "s"}
        {rawRows.length >= FETCH_MAX ? ` (top ${FETCH_MAX} from server)` : ""}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function KgInspector() {
  const [selected, setSelected] = useState<SelectedEntity | null>(null);
  const [tab, setTab] = useState("entities");

  const handleSelectEntity = (e: SelectedEntity) => {
    setSelected(e);
    setTab("mentions");
  };

  return (
    <div className="flex h-[calc(100dvh-2.5rem)] flex-col overflow-hidden bg-textured">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Database className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-sm font-semibold text-foreground">
          Knowledge Graph Inspector
        </h1>
        <Badge variant="outline" className="ml-1">
          read-only
        </Badge>
      </div>

      <Tabs
        value={tab}
        onValueChange={setTab}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="px-4 pt-3">
          <TabsList>
            <TabsTrigger value="entities">
              <ListTree className="mr-1.5 h-4 w-4" />
              Entities
            </TabsTrigger>
            <TabsTrigger value="mentions">
              <Search className="mr-1.5 h-4 w-4" />
              Mentions
              {selected ? (
                <Badge variant="secondary" className="ml-1.5">
                  1
                </Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="edges">
              <Network className="mr-1.5 h-4 w-4" />
              Top edges
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <TabsContent value="entities" className="mt-0">
            <EntitiesTab onSelectEntity={handleSelectEntity} />
          </TabsContent>
          <TabsContent value="mentions" className="mt-0">
            <MentionsTab entity={selected} />
          </TabsContent>
          <TabsContent value="edges" className="mt-0">
            <EdgesTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
