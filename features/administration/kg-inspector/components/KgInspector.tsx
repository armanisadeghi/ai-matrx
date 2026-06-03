"use client";

/**
 * features/administration/kg-inspector/components/KgInspector.tsx
 *
 * Read-only KG data inspector (Phase C.5). Three tabs over the existing
 * rag.kg_* graph tables:
 *   - Entities  — paginated table with kind / org / search filters.
 *   - Mentions  — per-entity drill-down (selected from the Entities tab),
 *                 each mention deep-links to its source via citationHrefFor().
 *   - Top edges — weight-ordered edge list with kind filter.
 *
 * This is an admin forensic surface (the (admin) layout already super-admin
 * gates it) so the product owner can eyeball NER quality + entity volume as
 * the graph fills, before committing to the full cytoscape view (Phase G).
 * Pure reads through the typed kgInspectorService → Python backend.
 */
import { useEffect, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
const ANY = "__any__";

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

const EDGE_KINDS = ["co_occurs_with", "imports", "calls", "references"] as const;

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
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular-nums text-xs text-muted-foreground">{value.toFixed(2)}</span>
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
  const [rows, setRows] = useState<KgEntityRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [kind, setKind] = useState<string>(ANY);
  const [orgId, setOrgId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce the search box into the applied `q`.
  useEffect(() => {
    const t = setTimeout(() => setQ(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset to first page whenever a filter changes.
  useEffect(() => {
    setOffset(0);
  }, [kind, orgId, q]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listKgEntities(
      {
        kind: kind === ANY ? null : kind,
        organizationId: orgId.trim() || null,
        q: q || null,
        limit: PAGE_SIZE,
        offset,
      },
      { signal: controller.signal },
    )
      .then((page) => {
        setRows(page.items);
        setTotal(page.total);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Failed to load entities");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [kind, orgId, q, offset]);

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search canonical name…"
            className="h-8 w-64 pl-8 text-sm"
          />
        </div>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="h-8 w-44 text-sm">
            <SelectValue placeholder="All kinds" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All kinds</SelectItem>
            {ENTITY_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
          placeholder="Organization ID (optional)"
          className="h-8 w-64 text-sm"
        />
      </div>

      {error ? (
        <div className="rounded-md border border-border bg-card p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">Kind</TableHead>
              <TableHead>Canonical name</TableHead>
              <TableHead className="text-right">Mentions</TableHead>
              <TableHead className="text-right">Sources</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead className="whitespace-nowrap">Created</TableHead>
              <TableHead className="w-12 text-right">Graph</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton rows={8} cols={7} />
          ) : (
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No entities match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() =>
                      onSelectEntity({ id: row.id, name: row.canonical_name, kind: row.kind })
                    }
                  >
                    <TableCell>
                      <KindChip kind={row.kind} />
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      {row.canonical_name}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.mention_count}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.source_count}</TableCell>
                    <TableCell>
                      <ConfidenceBar value={row.confidence_avg} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(row.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {/* Deep-link to the org-wide knowledge-graph canvas. The
                          canvas does not yet support a `?entity=<id>` preselect
                          param, so we link without one — still useful as a
                          jump-out from the forensic table to the visual graph. */}
                      <Link
                        href="/knowledge-graph"
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
          {pageStart}–{pageEnd} of {total}
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
      return;
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
        <span className="text-sm text-muted-foreground tabular-nums">({total} mentions)</span>
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
  const [rows, setRows] = useState<KgEdgeRow[]>([]);
  const [kind, setKind] = useState<string>(ANY);
  const [orgId, setOrgId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listKgTopEdges(
      {
        kind: kind === ANY ? null : kind,
        organizationId: orgId.trim() || null,
        limit: PAGE_SIZE,
      },
      { signal: controller.signal },
    )
      .then((res) => setRows(res.items))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Failed to load edges");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [kind, orgId]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="h-8 w-44 text-sm">
            <SelectValue placeholder="All edge kinds" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All edge kinds</SelectItem>
            {EDGE_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
          placeholder="Organization ID (optional)"
          className="h-8 w-64 text-sm"
        />
      </div>

      {error ? (
        <div className="rounded-md border border-border bg-card p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead className="w-40">Edge</TableHead>
              <TableHead>Target</TableHead>
              <TableHead className="text-right w-24">Weight</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton rows={8} cols={4} />
          ) : (
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    No edges match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <KindChip kind={e.src_kind} />
                        <span className="font-medium text-foreground">{e.src_name}</span>
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
                        <span className="font-medium text-foreground">{e.dst_name}</span>
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
        <h1 className="text-sm font-semibold text-foreground">Knowledge Graph Inspector</h1>
        <Badge variant="outline" className="ml-1">
          read-only
        </Badge>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
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
