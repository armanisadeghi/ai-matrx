// features/kg-graph/components/KgGraphSidePanel.tsx
//
// Drill-down panel for a clicked entity: its name/kind/stats + the source
// mentions the caller can access (fetched from /kg/graph/entity/{id}/mentions —
// USER-scoped, never another user's private source). Each mention deep-links to
// its source via the shared `citationHrefFor()` (reused from
// `features/rag/api/search.ts`, NOT redeclared).

"use client";

import { useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { citationHrefFor, type RagSearchHit } from "@/features/rag/api/search";

import { fetchEntityMentions } from "../service/kgGraphService";
import type { GraphNode, MentionRow } from "../types";
import { colorForKind } from "../constants";

interface KgGraphSidePanelProps {
  node: GraphNode;
  onClose: () => void;
}

// Build the minimal RagSearchHit shape citationHrefFor() reads (source_kind /
// source_id / chunk_id / metadata). A mention without a source can't deep-link.
function mentionHref(m: MentionRow): string | null {
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

export function KgGraphSidePanel({ node, onClose }: KgGraphSidePanelProps) {
  const [mentions, setMentions] = useState<MentionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    setError(null);
    fetchEntityMentions(node.id, { limit: 50 }, { signal: controller.signal })
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

  return (
    <div className="flex h-full w-full flex-col border-l border-border bg-card">
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
              {node.mention_count} mention
              {node.mention_count === 1 ? "" : "s"} · {node.source_count} source
              {node.source_count === 1 ? "" : "s"}
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
        Source mentions
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-2 p-3">
          {status === "loading" ? (
            <>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </>
          ) : status === "error" ? (
            <div className="text-xs text-destructive">{error}</div>
          ) : mentions.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              No accessible source mentions for this entity yet. NER mentions
              populate as your content is ingested.
            </div>
          ) : (
            mentions.map((m) => {
              const href = mentionHref(m);
              return (
                <div
                  key={`${m.chunk_id}-${m.span_start ?? 0}`}
                  className="rounded-md border border-border/60 bg-background p-2.5"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {m.source_kind ?? "unknown"}
                    </span>
                    {href ? (
                      <a
                        href={href}
                        className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                      >
                        Open <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </div>
                  <p className="text-xs leading-snug text-foreground/90">
                    {m.snippet || "(no snippet)"}
                  </p>
                </div>
              );
            })
          )}
          {status === "ready" && total > mentions.length ? (
            <div className="pt-1 text-center text-[11px] text-muted-foreground">
              Showing {mentions.length} of {total}
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
