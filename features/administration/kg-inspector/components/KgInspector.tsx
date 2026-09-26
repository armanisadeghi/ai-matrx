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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { ADMIN_KNOWLEDGE_SURFACE_NAME, createAdminKnowledgeScope } from "@/features/surfaces/manifests/admin-knowledge.manifest";
import AppLink from "@/components/navigation/AppLink";
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
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import {
  useTableUrlState,
} from "@ai-matrx/design-system/data-table/url-state";
import type {
  ColumnFilterValue,
} from "@ai-matrx/design-system/data-table/types";

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
import { Input } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@ai-matrx/design-system";
import {
  fetchOrganizationNamesByIds,
  organizationDisplayName,
} from "../utils/organizationNames";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { MatrxUuidCell } from "@ai-matrx/design-system/data-table/uuid-cell";
import { citationHrefFor, type RagSearchHit } from "@/features/rag/api/search";
import {
  useOpenCitation,
  shouldOpenInNewTab,
} from "@/features/rag/components/source-inspector/useOpenCitation";
import {
  listKgEntities,
  listKgEntityMentions,
  listKgTopEdges,
  type KgEntityRow,
  type KgMentionRow,
  type KgEdgeRow,
} from "../service/kgInspectorService";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

const PAGE_SIZE = 50;
const FETCH_MAX = 200;

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

function selectedFilterValue(filter: ColumnFilterValue | undefined): string | null {
  if (!filter || filter.kind !== "select") return null;
  return filter.values?.[0] ?? filter.value ?? null;
}

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

/**
 * An edge endpoint is a REAL kg entity (`kg_edge.src_id` / `dst_id`), and this
 * console can already show everything it knows about one — its mentions. It was
 * printed as plain text, so a graph edge named two records the user could not
 * reach. Clicking either end selects it and jumps to the Mentions tab.
 *
 * The endpoint's `kind` ("organization", "code_file", "person") is an NER
 * CLASS, not a canonical entity token — a kg entity kinded "organization" is an
 * extracted name, not a row in `iam.organizations` — so it deliberately does
 * NOT resolve through the entity registry. Doing that would open a completely
 * different record.
 */
function EdgeEndpointButton({
  id,
  name,
  kind,
  onSelectEntity,
}: {
  id: string;
  name: string;
  kind: string;
  onSelectEntity: (e: SelectedEntity) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelectEntity({ id, name, kind })}
      title={`Show mentions of ${name}`}
      className="min-w-0 truncate text-left font-medium text-foreground underline-offset-2 hover:text-primary hover:underline"
    >
      {name}
    </button>
  );
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ queryKey: string; message: string } | null>(null);
  const [sourceIssue, setSourceIssue] = useState<{ queryKey: string; message: string } | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const tableQuery = useTableUrlState({
    tableId: "kg-inspector-entities",
    defaultSort: { id: "mention_count", direction: "desc" },
    defaultPageSize: PAGE_SIZE,
  });
  const kind = selectedFilterValue(tableQuery.queryState.columnFilters.kind);
  const q = tableQuery.queryState.search.trim();
  // A refresh is a new source generation, not just another request for the
  // same Kind/Name. Including it fences any earlier append before replacement.
  const sourceQueryKey = `${kind ?? "all"}\u0000${q}\u0000${reloadNonce}`;
  const sourceQueryKeyRef = useRef(sourceQueryKey);
  const [loadedQueryKey, setLoadedQueryKey] = useState(sourceQueryKey);
  const [nextSourceOffset, setNextSourceOffset] = useState(0);

  useEffect(() => {
    sourceQueryKeyRef.current = sourceQueryKey;
  }, [sourceQueryKey]);

  const hasCurrentSource = loadedQueryKey === sourceQueryKey;
  const currentRows = hasCurrentSource ? rawRows : [];
  const currentTotal = hasCurrentSource ? serverTotal : 0;
  const currentOffset = hasCurrentSource ? nextSourceOffset : 0;
  const currentSourceIssue = sourceIssue?.queryKey === sourceQueryKey ? sourceIssue.message : null;
  const currentError = error?.queryKey === sourceQueryKey ? error.message : currentSourceIssue;

  const organizationIds = useMemo(
    () => [
      ...new Set(
        currentRows
          .map((row) => row.organization_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ],
    [currentRows],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    listKgEntities(
      {
        kind,
        q: q || null,
        limit: FETCH_MAX,
        offset: 0,
      },
      { signal: controller.signal },
    )
      .then((pageResult) => {
        if (controller.signal.aborted || sourceQueryKeyRef.current !== sourceQueryKey) return;
        setLoadedQueryKey(sourceQueryKey);
        setRawRows(pageResult.items);
        setServerTotal(pageResult.total);
        setNextSourceOffset(pageResult.items.length);
        setError(null);
        setSourceIssue(null);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted || sourceQueryKeyRef.current !== sourceQueryKey) return;
        setError({
          queryKey: sourceQueryKey,
          message: e instanceof Error ? e.message : "Failed to load entities",
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [kind, q, reloadNonce, sourceQueryKey]);

  const loadNextPage = useCallback(async () => {
    if (!hasCurrentSource || loading || currentSourceIssue || currentOffset >= currentTotal) return;

    setLoading(true);
    setError(null);
    const requestQueryKey = sourceQueryKey;
    try {
      const pageResult = await listKgEntities({
        kind,
        q: q || null,
        limit: FETCH_MAX,
        offset: currentOffset,
      });
      if (sourceQueryKeyRef.current !== requestQueryKey) return;
      const knownIds = new Set(currentRows.map((row) => row.id));
      const uniqueItems = pageResult.items.filter((row) => !knownIds.has(row.id));
      const nextOffset = currentOffset + pageResult.items.length;
      const nextUniqueCount = currentRows.length + uniqueItems.length;
      setRawRows((current) => [...current, ...uniqueItems]);
      setServerTotal(pageResult.total);
      setNextSourceOffset(nextOffset);
      if (pageResult.items.length === 0 || uniqueItems.length === 0) {
        setSourceIssue({
          queryKey: requestQueryKey,
          message: "The KG changed while this result was being paged. Retry from the first page to continue.",
        });
      } else if (nextOffset >= pageResult.total && nextUniqueCount !== pageResult.total) {
        setSourceIssue({
          queryKey: requestQueryKey,
          message: "The live KG changed while pages were loading, so this result cannot prove complete. Retry from the first page.",
        });
      }
    } catch (e: unknown) {
      if (sourceQueryKeyRef.current !== requestQueryKey) return;
      setError({
        queryKey: requestQueryKey,
        message: e instanceof Error ? e.message : "Failed to load more entities",
      });
    } finally {
      if (sourceQueryKeyRef.current === requestQueryKey) setLoading(false);
    }
  }, [currentOffset, currentRows, currentSourceIssue, currentTotal, hasCurrentSource, kind, loading, q, sourceQueryKey]);

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

  const entityColumns: MatrxColumnDef<KgEntityRow>[] = [
    {
      id: "kind",
      accessorKey: "kind",
      header: "Kind",
      filter: "select",
      filterSingle: true,
      filterOptions: ENTITY_KINDS.map((value) => ({ value, label: value })),
      width: 140,
      cell: (row) => <KindChip kind={row.kind} />,
    },
    {
      id: "canonical_name",
      accessorKey: "canonical_name",
      header: "Canonical name",
      // Name search belongs to the source-backed canonical toolbar, where the
      // RPC can search every matching entity before the 200-row window.
      filter: false,
      width: 220,
      cell: (row) => (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelectEntity({ id: row.id, name: row.canonical_name, kind: row.kind });
          }}
          title={`Show mentions of ${row.canonical_name}`}
          className="max-w-full truncate text-left font-medium text-foreground underline-offset-2 hover:text-primary hover:underline"
        >
          {row.canonical_name}
        </button>
      ),
    },
    {
      id: "organization_name",
      header: "Organization",
      accessorFn: (row) => organizationDisplayName(row.organization_id, orgNames) ?? "",
      filter: "text",
      width: 180,
      cell: (row) =>
        !row.organization_id ? (
          "—"
        ) : orgNamesLoading && !(row.organization_id in orgNames) ? (
          <Skeleton className="h-4 w-28" />
        ) : (
          <EntityRef
            token="organization"
            id={row.organization_id}
            name={organizationDisplayName(row.organization_id, orgNames) ?? null}
          />
        ),
    },
    {
      id: "mention_count",
      accessorKey: "mention_count",
      header: "Mentions",
      filter: "number",
      align: "right",
      width: 112,
      cell: (row) => <span className="tabular-nums">{row.mention_count}</span>,
    },
    {
      id: "source_count",
      accessorKey: "source_count",
      header: "Sources",
      filter: "number",
      align: "right",
      width: 104,
      cell: (row) => <span className="tabular-nums">{row.source_count}</span>,
    },
    {
      id: "confidence_avg",
      accessorKey: "confidence_avg",
      header: "Confidence",
      filter: "number",
      width: 140,
      cell: (row) => <ConfidenceBar value={row.confidence_avg} />,
    },
    {
      id: "created_at",
      accessorKey: "created_at",
      header: "Created",
      filter: "date",
      width: 170,
      cell: (row) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {new Date(row.created_at).toLocaleString()}
        </span>
      ),
    },
    {
      id: "graph",
      header: "Graph",
      filter: false,
      sortable: false,
      compact: true,
      align: "center",
      width: 48,
      cell: () => (
        <AppLink
          href="/knowledge/graph"
          onClick={(event) => event.stopPropagation()}
          className="inline-flex items-center text-muted-foreground hover:text-primary"
          title="Open knowledge-graph canvas"
          aria-label="View graph"
        >
          <Network className="h-3.5 w-3.5" />
        </AppLink>
      ),
    },
  ];

  return (
    <SurfaceRuntimeProvider surfaceName={ADMIN_KNOWLEDGE_SURFACE_NAME} getScope={() => createAdminKnowledgeScope({ knowledge_section: "kg_inspector", kg_inspector_tab: "entities", kg_entities_filter: { kind, q, tableQuery: tableQuery.state }, kg_entities: currentRows })}>
    <div className="flex flex-col gap-3">
      {currentError ? (
        <div className="rounded-md border border-border bg-card p-4 text-sm text-destructive">
          {currentError}
          <ErrorAlchemyMenu error={currentError} />
        </div>
      ) : null}

      <MatrxDataTable<KgEntityRow>
        tableId="kg-inspector-entities"
        viewTabs={false}
        data={currentRows}
        columns={entityColumns}
        getRowId={(row) => row.id}
        isLoading={loading && currentRows.length === 0}
        isFetching={loading && currentRows.length > 0}
        query={{
          mode: "controlled-append",
          state: tableQuery.state,
          onStateChange: tableQuery.onStateChange,
          // Name and Kind reload the source. All remaining filters and sorting
          // apply to rows explicitly loaded through the canonical footer.
          sourceProcessing: {
            search: "source",
            columnFilters: { source: ["kind"] },
            sort: "local",
            sourceTotal: currentTotal,
          },
          pagination: {
            queryKey: sourceQueryKey,
            rows: currentRows,
            loading: loading && currentRows.length === 0,
            isFetchingNextPage: loading && currentRows.length > 0,
            error: currentError ? new Error(currentError) : null,
            hasNextPage: !currentSourceIssue && currentOffset < currentTotal,
            loadNextPage,
            refresh: () => setReloadNonce((current) => current + 1),
            retrySource: () => setReloadNonce((current) => current + 1),
            totalItems: currentTotal,
          },
          scroll: {
            mode: "suspended",
            reason: "Pages are loaded on request. The KG has no snapshot cursor, so concurrent writes can shift offset pages; the footer warns and offers a retry if that prevents a complete result.",
          },
        }}
        pageSize={PAGE_SIZE}
        stickyHeader
        detail={{ enabled: false }}
        copy={false}
        toolbar={{
          title: "Entities",
          search: true,
          searchPlaceholder: "Search canonical names…",
        }}
        emptyState={{ title: "No entities match the current filters." }}
        onRowOpen={(row) =>
          onSelectEntity({ id: row.id, name: row.canonical_name, kind: row.kind })
        }
        mobileCards={(row) => (
          <div
            className="rounded-md border border-border bg-card p-3"
            onClick={() =>
              onSelectEntity({ id: row.id, name: row.canonical_name, kind: row.kind })
            }
          >
            <div className="flex items-start gap-2">
              <KindChip kind={row.kind} />
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left font-medium underline-offset-2 hover:text-primary hover:underline"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectEntity({ id: row.id, name: row.canonical_name, kind: row.kind });
                }}
              >
                {row.canonical_name}
              </button>
              <AppLink
                href="/knowledge/graph"
                onClick={(event) => event.stopPropagation()}
                aria-label={`View ${row.canonical_name} in the graph`}
                title="Open knowledge-graph canvas"
              >
                <Network className="h-4 w-4 text-muted-foreground" />
              </AppLink>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div>
                <span className="text-muted-foreground">Organization</span>
                <div>
                  {!row.organization_id ? (
                    "—"
                  ) : orgNamesLoading && !(row.organization_id in orgNames) ? (
                    <Skeleton className="h-4 w-28" />
                  ) : (
                    <EntityRef
                      token="organization"
                      id={row.organization_id}
                      name={organizationDisplayName(row.organization_id, orgNames) ?? null}
                    />
                  )}
                </div>
              </div>
              <div><span className="text-muted-foreground">Mentions</span><div className="tabular-nums">{row.mention_count}</div></div>
              <div><span className="text-muted-foreground">Sources</span><div className="tabular-nums">{row.source_count}</div></div>
              <div><span className="text-muted-foreground">Confidence</span><div>{row.confidence_avg === null ? "—" : row.confidence_avg.toFixed(2)}</div></div>
              <div className="col-span-2"><span className="text-muted-foreground">Created</span><div>{new Date(row.created_at).toLocaleString()}</div></div>
            </div>
          </div>
        )}
      />
    </div>
    </SurfaceRuntimeProvider>
  );
}

// ---------------------------------------------------------------------------

function MentionsTab({ entity }: { entity: SelectedEntity | null }) {
  const [rows, setRows] = useState<KgMentionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openCitation = useOpenCitation();

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
    <SurfaceRuntimeProvider surfaceName={ADMIN_KNOWLEDGE_SURFACE_NAME} getScope={() => createAdminKnowledgeScope({ knowledge_section: "kg_inspector", kg_inspector_tab: "mentions", kg_inspector_selected_entity: { ...entity }, kg_mentions: rows })}>
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
          <ErrorAlchemyMenu error={error} />
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
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        if (shouldOpenInNewTab(e)) return;
                        e.preventDefault();
                        openCitation({
                          sourceKind: m.source_kind ?? "",
                          sourceId: m.source_id ?? "",
                          href,
                          chunkId: m.chunk_id,
                          snippet: m.snippet,
                        });
                      }}
                      className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Open source
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    /* No route for this source kind (citationHrefFor knows the
                       mapped set and returns null otherwise). The id stays a
                       dead end by necessity — but not an unselectable one: the
                       canonical uuid cell gives it a copy control. The kind is
                       NOT run through the entity registry: a Knowledge `source_kind`
                       is not a canonical entity token, and a colliding name
                       would open the wrong record. */
                    <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                      <span>{m.source_kind ?? "unknown"}</span>
                      {m.source_id ? (
                        <MatrxUuidCell value={m.source_id} label="Source" />
                      ) : (
                        <span>—</span>
                      )}
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
    </SurfaceRuntimeProvider>
  );
}

// ---------------------------------------------------------------------------

function EdgesTab({
  onSelectEntity,
}: {
  onSelectEntity: (e: SelectedEntity) => void;
}) {
  const [rawRows, setRawRows] = useState<KgEdgeRow[]>([]);
  const [orgInput, setOrgInput] = useState("");
  const [orgId, setOrgId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tableQuery = useTableUrlState({
    tableId: "kg-inspector-edges",
    defaultSort: { id: "weight", direction: "desc" },
    defaultPageSize: 0,
  });
  const edgeKind = selectedFilterValue(tableQuery.queryState.columnFilters.kind);

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
        kind: edgeKind,
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

  const edgeColumns: MatrxColumnDef<KgEdgeRow>[] = [
    {
      id: "source",
      header: "Source",
      accessorFn: (row) => `${row.src_kind} ${row.src_name}`,
      filter: "text",
      width: 250,
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <KindChip kind={row.src_kind} />
          <EdgeEndpointButton id={row.src_id} name={row.src_name} kind={row.src_kind} onSelectEntity={onSelectEntity} />
        </div>
      ),
    },
    {
      id: "kind",
      accessorKey: "kind",
      header: "Edge",
      filter: "select",
      filterSingle: true,
      filterOptions: EDGE_KINDS.map((value) => ({ value, label: value })),
      width: 170,
      cell: (row) => <Badge variant="outline" className="font-mono">{row.kind}</Badge>,
    },
    {
      id: "target",
      header: "Target",
      accessorFn: (row) => `${row.dst_kind} ${row.dst_name}`,
      filter: "text",
      width: 250,
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <KindChip kind={row.dst_kind} />
          <EdgeEndpointButton id={row.dst_id} name={row.dst_name} kind={row.dst_kind} onSelectEntity={onSelectEntity} />
        </div>
      ),
    },
    {
      id: "weight",
      accessorKey: "weight",
      header: "Weight",
      filter: "number",
      align: "right",
      width: 120,
      cell: (row) => <span className="tabular-nums">{row.weight === null ? "—" : row.weight.toFixed(2)}</span>,
    },
  ];

  return (
    <SurfaceRuntimeProvider surfaceName={ADMIN_KNOWLEDGE_SURFACE_NAME} getScope={() => createAdminKnowledgeScope({ knowledge_section: "kg_inspector", kg_inspector_tab: "edges", kg_edges_filter: { orgId, edgeKind, tableQuery: tableQuery.state }, kg_edges: rawRows })}>
    <div className="flex flex-col gap-3">
      {error ? (
        <div className="rounded-md border border-border bg-card p-4 text-sm text-destructive">
          {error}
          <ErrorAlchemyMenu error={error} />
        </div>
      ) : null}

      <MatrxDataTable<KgEdgeRow>
        tableId="kg-inspector-edges"
        viewTabs={false}
        data={rawRows}
        columns={edgeColumns}
        getRowId={(row) => row.id}
        isLoading={loading && rawRows.length === 0}
        isFetching={loading && rawRows.length > 0}
        query={{ mode: "controlled-local", state: tableQuery.state, onStateChange: tableQuery.onStateChange }}
        coverage={rawRows.length >= FETCH_MAX ? {
          loaded: rawRows.length,
          cap: FETCH_MAX,
          answeredBy: "client",
          noun: "edge",
        } : undefined}
        pageSize={0}
        stickyHeader
        detail={{ enabled: false }}
        copy={false}
        toolbar={{
          title: "Top edges",
          search: false,
          leading: (
            <Input
              value={orgInput}
              onChange={(event) => setOrgInput(event.target.value)}
              placeholder="Organization ID (optional)"
              className="h-8 w-64 text-base"
              aria-label="Filter edges by organization ID"
            />
          ),
        }}
        emptyState={{ title: "No edges match the current filters." }}
        mobileCards={(row) => (
          <div className="rounded-md border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <KindChip kind={row.src_kind} />
              <EdgeEndpointButton id={row.src_id} name={row.src_name} kind={row.src_kind} onSelectEntity={onSelectEntity} />
            </div>
            <div className="my-2 border-l border-border pl-3 text-xs text-muted-foreground">
              <Badge variant="outline" className="font-mono">{row.kind}</Badge>
              <span className="ml-2 tabular-nums">Weight {row.weight === null ? "—" : row.weight.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-2">
              <KindChip kind={row.dst_kind} />
              <EdgeEndpointButton id={row.dst_id} name={row.dst_name} kind={row.dst_kind} onSelectEntity={onSelectEntity} />
            </div>
          </div>
        )}
      />
    </div>
    </SurfaceRuntimeProvider>
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
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_KNOWLEDGE_SURFACE_NAME}
      getScope={() => createAdminKnowledgeScope({
        knowledge_section: "kg_inspector",
        kg_inspector_tab: tab as "entities" | "mentions" | "edges",
        ...(selected ? { kg_inspector_selected_entity: { ...selected } } : {}),
      })}
    >
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
            <EdgesTab onSelectEntity={handleSelectEntity} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
    </SurfaceRuntimeProvider>
  );
}
