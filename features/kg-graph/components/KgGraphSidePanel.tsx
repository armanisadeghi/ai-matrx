// features/kg-graph/components/KgGraphSidePanel.tsx
//
// Evidence panel for a clicked entity — the "tie to something real" surface. It
// fetches the entity's source mentions (USER-scoped, never another user's private
// source) and turns them into READABLE EVIDENCE:
//   - dedupes raw mentions to unique occurrences by (chunk_id, span_start), so the
//     same passage counted N times collapses to one card with an "×N" badge (the
//     measured inflation — "the same chunk counted 8×");
//   - groups occurrences by source document;
//   - highlights the entity inside each passage so you read the real context;
//   - deep-links each source to its viewer (notes get a forward-compatible
//     `?find=` anchor; passage-accurate page jumps await backend provenance — see
//     features/kg-graph/docs/PRODUCT_DIRECTION.md §B1).

"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Copy, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { citationHrefFor, type RagSearchHit } from "@/features/rag/api/search";

import { fetchEntityMentions } from "../service/kgGraphService";
import { fetchSourceNames } from "../service/sourceNames";
import type { GraphNode, MentionRow } from "../types";
import { colorForKind } from "../constants";

interface KgGraphSidePanelProps {
  node: GraphNode;
  onClose: () => void;
}

// ── Evidence model ──────────────────────────────────────────────────────────

interface Occurrence {
  /** Dedup key: chunk + intra-chunk start offset (or mention index when the
   *  backend returns a null span, so distinct null-span mentions don't merge). */
  key: string;
  /** Chunk this occurrence lives in — used to build a chunk-anchored deep link. */
  chunkId: string;
  snippet: string;
  confidence: number | null;
  /** How many raw mentions collapsed into this occurrence. */
  dupCount: number;
}

interface SourceGroup {
  sourceKind: string | null;
  sourceId: string | null;
  occurrences: Occurrence[];
}

/** Dedupe raw mentions → unique occurrences, grouped by source document. Two
 *  mentions at the same (chunk, span_start) are the same occurrence — counted
 *  many times by the (un-canonicalized) NER pass; we collapse them. */
export function groupMentions(mentions: MentionRow[]): SourceGroup[] {
  const occByKey = new Map<
    string,
    Occurrence & { sk: string | null; sid: string | null }
  >();
  const order: string[] = [];
  mentions.forEach((m, i) => {
    // Fall back to the mention index when span_start is null so distinct
    // null-span mentions in one chunk don't all collapse into one inflated card.
    const key =
      m.span_start != null
        ? `${m.chunk_id}:${m.span_start}`
        : `${m.chunk_id}:i${i}`;
    const existing = occByKey.get(key);
    if (existing) {
      existing.dupCount += 1;
      if ((m.confidence ?? 0) > (existing.confidence ?? 0)) {
        existing.confidence = m.confidence;
      }
    } else {
      occByKey.set(key, {
        key,
        chunkId: m.chunk_id,
        snippet: m.snippet,
        confidence: m.confidence,
        dupCount: 1,
        sk: m.source_kind,
        sid: m.source_id,
      });
      order.push(key);
    }
  });

  const groups = new Map<string, SourceGroup>();
  const groupOrder: string[] = [];
  for (const key of order) {
    const occ = occByKey.get(key)!;
    const gkey = `${occ.sk ?? "?"}|${occ.sid ?? "?"}`;
    let g = groups.get(gkey);
    if (!g) {
      g = { sourceKind: occ.sk, sourceId: occ.sid, occurrences: [] };
      groups.set(gkey, g);
      groupOrder.push(gkey);
    }
    g.occurrences.push({
      key: occ.key,
      chunkId: occ.chunkId,
      snippet: occ.snippet,
      confidence: occ.confidence,
      dupCount: occ.dupCount,
    });
  }

  // Most-repeated occurrences first (frequency — NOT confidence; confidence is an
  // undecided trust placeholder per the knowledge-vision guardrails, so it must
  // not drive ranking). Biggest groups first. Ties keep first-seen document order
  // (Array.sort is stable).
  for (const g of groups.values()) {
    g.occurrences.sort((a, b) => b.dupCount - a.dupCount);
  }
  return groupOrder
    .map((k) => groups.get(k)!)
    .sort((a, b) => b.occurrences.length - a.occurrences.length);
}

/** Deep-link to a source's viewer. For notes, append a forward-compatible
 *  `?find=` anchor (the snippet text) so the note viewer can scroll+highlight the
 *  passage once it honors the param — harmless if it doesn't yet. */
export function evidenceHref(
  group: SourceGroup,
  occ: Occurrence | undefined,
): string | null {
  if (!group.sourceKind || !group.sourceId) return null;
  const hit: RagSearchHit = {
    chunk_id: occ?.chunkId ?? "",
    source_kind: group.sourceKind,
    source_id: group.sourceId,
    field_id: null,
    parent_chunk_id: null,
    chunk_kind: "",
    snippet: occ?.snippet ?? "",
    score: 0,
    vector_rank: null,
    lexical_rank: null,
    rerank_score: null,
    entity_rank: null,
    entities: [],
    metadata: {},
  };
  let href = citationHrefFor(hit);
  if (group.sourceKind === "note" && occ?.snippet) {
    const find = occ.snippet.trim().slice(0, 120);
    if (find) {
      href += `${href.includes("?") ? "&" : "?"}find=${encodeURIComponent(find)}`;
    }
  }
  return href;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Bold every case-insensitive occurrence of `name` inside `snippet`. Uses a
 *  regex over the original string (indices stay valid for Unicode case-folding,
 *  unlike a lowercase-and-indexOf approach); the name is escaped, so no ReDoS. */
function highlightEntity(snippet: string, name: string): ReactNode[] {
  if (!name) return [snippet];
  const re = new RegExp(escapeRegExp(name), "gi");
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(snippet)) !== null) {
    if (m.index > last) out.push(snippet.slice(last, m.index));
    out.push(
      <mark
        key={k++}
        className="rounded-sm bg-primary/20 px-0.5 font-semibold text-foreground"
      >
        {m[0]}
      </mark>,
    );
    last = m.index + m[0].length;
    if (m.index === re.lastIndex) re.lastIndex++; // guard against zero-length match
  }
  if (last < snippet.length) out.push(snippet.slice(last));
  return out;
}

function sourceLabel(kind: string | null): string {
  switch (kind) {
    case "note":
      return "Note";
    case "cld_file":
      return "File";
    case "code_file":
      return "Code";
    case "library_doc":
      return "Document";
    case "transcript":
      return "Transcript";
    case "scraped":
      return "Web page";
    default:
      return kind ?? "Source";
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function KgGraphSidePanel({ node, onClose }: KgGraphSidePanelProps) {
  const [mentions, setMentions] = useState<MentionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);
  // source id → human name (note label, filename…); best-effort, async.
  const [sourceNames, setSourceNames] = useState<Map<string, string>>(
    new Map(),
  );

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    setError(null);
    fetchEntityMentions(node.id, { limit: 100 }, { signal: controller.signal })
      .then((page) => {
        setMentions(page.items);
        setTotal(page.total);
        setStatus("ready");
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Failed to load mentions");
        setStatus("error");
      });
    return () => controller.abort();
  }, [node.id]);

  const groups = useMemo(() => groupMentions(mentions), [mentions]);

  // Resolve the source documents' names (note label, etc.) for the group headers.
  useEffect(() => {
    if (groups.length === 0) {
      setSourceNames(new Map());
      return undefined;
    }
    let cancelled = false;
    fetchSourceNames(
      groups.map((g) => ({ kind: g.sourceKind, id: g.sourceId })),
    )
      .then((names) => {
        if (!cancelled) setSourceNames(names);
      })
      .catch(() => {
        /* names are best-effort; the kind label is the fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [groups]);
  const occurrenceCount = useMemo(
    () => groups.reduce((n, g) => n + g.occurrences.length, 0),
    [groups],
  );

  const copyPassage = (text: string) => {
    if (!navigator.clipboard?.writeText) {
      toast.error("Clipboard unavailable in this context");
      return;
    }
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success("Passage copied"))
      .catch(() => toast.error("Couldn't copy passage"));
  };

  return (
    <div className="flex h-full w-full flex-col border-l border-border bg-card">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-border p-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: colorForKind(node.kind) }}
            />
            <span className="truncate text-sm font-semibold text-foreground">
              {node.name}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="text-[10px]">
              {node.kind}
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              {status === "ready"
                ? `${occurrenceCount} occurrence${occurrenceCount === 1 ? "" : "s"} · ${groups.length} source${groups.length === 1 ? "" : "s"}`
                : `${node.mention_count} mention${node.mention_count === 1 ? "" : "s"}`}
              {node.confidence_avg !== null
                ? ` · ${(node.confidence_avg * 100).toFixed(0)}% avg conf`
                : ""}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
        Evidence
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-3 p-3">
          {status === "loading" ? (
            <>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </>
          ) : status === "error" ? (
            <div className="text-xs text-destructive">{error}</div>
          ) : groups.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              No accessible source mentions for this entity yet. NER mentions
              populate as your content is ingested.
            </div>
          ) : (
            groups.map((group) => {
              const href = evidenceHref(group, group.occurrences[0]);
              return (
                <div
                  key={`${group.sourceKind}-${group.sourceId}`}
                  className="overflow-hidden rounded-md border border-border/60 bg-background"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/40 px-2.5 py-1.5">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[11px] font-medium text-foreground">
                        {(group.sourceId && sourceNames.get(group.sourceId)) ||
                          sourceLabel(group.sourceKind)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {sourceLabel(group.sourceKind)} ·{" "}
                        {group.occurrences.length} passage
                        {group.occurrences.length === 1 ? "" : "s"}
                      </span>
                    </span>
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 text-[11px] text-primary hover:underline"
                      >
                        Open <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </div>

                  <div className="divide-y divide-border/40">
                    {group.occurrences.map((occ) => (
                      <div
                        key={occ.key}
                        className="group/occ relative px-2.5 py-2"
                      >
                        <p className="pr-5 text-xs leading-snug text-foreground/90">
                          {highlightEntity(
                            occ.snippet || "(no snippet)",
                            node.name,
                          )}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          {occ.dupCount > 1 ? (
                            <span
                              className="rounded bg-muted px-1 text-[10px] text-muted-foreground"
                              title={`This passage was extracted ${occ.dupCount} times`}
                            >
                              ×{occ.dupCount}
                            </span>
                          ) : null}
                          {occ.confidence !== null ? (
                            <span className="text-[10px] text-muted-foreground">
                              {(occ.confidence * 100).toFixed(0)}% conf
                            </span>
                          ) : null}
                        </div>
                        {occ.snippet ? (
                          <button
                            type="button"
                            onClick={() => copyPassage(occ.snippet)}
                            className="absolute right-1.5 top-1.5 rounded p-1 text-muted-foreground/40 transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground focus-visible:outline-none group-hover/occ:text-muted-foreground"
                            aria-label="Copy passage"
                            title="Copy passage"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
          {status === "ready" && total > mentions.length ? (
            <div className="pt-1 text-center text-[11px] text-muted-foreground">
              Showing the first {mentions.length} of {total} mentions
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
