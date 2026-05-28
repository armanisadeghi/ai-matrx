"use client";

/**
 * RagSearchInline — inline + overlay renderer for the `rag_search` tool call.
 *
 * The tool ships from aidream/main (c79bb36). Output shape:
 *   {
 *     query: string,
 *     hits: Array<{
 *       chunk_id, source_kind, source_id, snippet, score,
 *       vector_rank, lexical_rank, rerank_score, metadata,
 *       // streaming variant also surfaces:
 *       rank?, file_name?, page_number?
 *     }>,
 *     total_candidates, embedding_model, reranker_model, latency_ms
 *   }
 *
 * Deep links flow through `citationHrefFor()` (the canonical RAG citation
 * router in `features/rag/api/search`) which already knows how to route
 * cld_file / note / code_file / library_doc / transcript / scraped — so a
 * citation in chat behaves identically to a citation in /rag/search.
 *
 * Power-user score breakdown lives in a per-hit popover (vector_rank /
 * lexical_rank / rerank_score) so the default surface stays readable.
 *
 * Same component is registered as both InlineComponent + OverlayComponent;
 * the streaming live card (`LiveToolCallCard`) and the persisted card
 * (`ToolCallVisualization`) both receive the materialized
 * `ToolLifecycleEntry` from Redux and render the same hit list.
 */

import React, { useMemo } from "react";
import Link from "next/link";
import {
  ExternalLink,
  FileText,
  Loader2,
  NotebookText,
  Code2,
  BookOpen,
  Mic,
  Globe,
  Search,
  AlertCircle,
  Info,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import type { ToolRendererProps } from "../../types";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { getArg, isTerminal, resultAsObject } from "../_shared";
import {
  citationHrefFor,
  type RagSearchHit,
} from "@/features/rag/api/search";

// ---------------------------------------------------------------------------
// Hit normalization
//
// The tool result and the streaming AgentToolHit shapes differ slightly:
//   - persisted result hits: have vector_rank / lexical_rank / rerank_score
//     / metadata, no rank / file_name / page_number
//   - streamed AgentToolHit:  have rank / file_name / page_number,
//     no vector_rank / lexical_rank / rerank_score
//
// We normalize to one display shape and reuse `citationHrefFor` (which
// only needs chunk_id + source_kind + source_id + metadata.page_number)
// so we never reimplement citation routing here.
// ---------------------------------------------------------------------------

interface NormalizedHit {
  rank: number;
  chunk_id: string;
  source_kind: string;
  source_id: string;
  snippet: string;
  score: number;
  file_name: string | null;
  page_number: number | null;
  vector_rank: number | null;
  lexical_rank: number | null;
  rerank_score: number | null;
  metadata: Record<string, unknown>;
}

interface RawHit {
  rank?: number;
  chunk_id: string;
  source_kind: string;
  source_id: string;
  snippet: string;
  score: number;
  file_name?: string | null;
  page_number?: number | null;
  vector_rank?: number | null;
  lexical_rank?: number | null;
  rerank_score?: number | null;
  metadata?: Record<string, unknown>;
}

function normalizeHit(raw: RawHit, index: number): NormalizedHit {
  const meta = raw.metadata ?? {};
  const metaSource = (meta["source"] ?? {}) as Record<string, unknown>;
  const fileNameFromMeta =
    (metaSource.file_name as string | undefined) ??
    (metaSource.title as string | undefined) ??
    (metaSource.path as string | undefined) ??
    null;
  const pageFromMeta = (() => {
    const pn = meta["page_number"];
    if (typeof pn === "number") return pn;
    if (typeof pn === "string") {
      const n = Number.parseInt(pn, 10);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  })();
  return {
    rank: raw.rank ?? index + 1,
    chunk_id: raw.chunk_id,
    source_kind: raw.source_kind,
    source_id: raw.source_id,
    snippet: raw.snippet,
    score: raw.score,
    file_name: raw.file_name ?? fileNameFromMeta,
    page_number: raw.page_number ?? pageFromMeta,
    vector_rank: raw.vector_rank ?? null,
    lexical_rank: raw.lexical_rank ?? null,
    rerank_score: raw.rerank_score ?? null,
    metadata: meta,
  };
}

interface ParsedRagSearch {
  query: string;
  hits: NormalizedHit[];
  total_candidates: number | null;
  embedding_model: string | null;
  reranker_model: string | null;
  latency_ms: number | null;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
}

function parse(entry: ToolLifecycleEntry): ParsedRagSearch {
  const queryArg = getArg<string>(entry, "query") ?? "";
  const result = resultAsObject(entry) as
    | {
        query?: string;
        hits?: RawHit[];
        total_candidates?: number;
        embedding_model?: string;
        reranker_model?: string | null;
        latency_ms?: number;
      }
    | null;
  const isError = entry.status === "error";
  const done = isTerminal(entry);
  if (isError) {
    return {
      query: queryArg,
      hits: [],
      total_candidates: null,
      embedding_model: null,
      reranker_model: null,
      latency_ms: null,
      isLoading: false,
      isError: true,
      errorMessage: entry.errorMessage ?? "Search failed",
    };
  }
  if (!result) {
    return {
      query: queryArg,
      hits: [],
      total_candidates: null,
      embedding_model: null,
      reranker_model: null,
      latency_ms: null,
      isLoading: !done,
      isError: false,
      errorMessage: null,
    };
  }
  const hits = (result.hits ?? []).map(normalizeHit);
  return {
    query: result.query ?? queryArg,
    hits,
    total_candidates: result.total_candidates ?? null,
    embedding_model: result.embedding_model ?? null,
    reranker_model: result.reranker_model ?? null,
    latency_ms: result.latency_ms ?? null,
    isLoading: false,
    isError: false,
    errorMessage: null,
  };
}

// ---------------------------------------------------------------------------
// Hit-level helpers
// ---------------------------------------------------------------------------

function iconForSourceKind(kind: string) {
  switch (kind) {
    case "cld_file":
      return FileText;
    case "note":
      return NotebookText;
    case "code_file":
      return Code2;
    case "library_doc":
      return BookOpen;
    case "transcript":
      return Mic;
    case "scraped":
      return Globe;
    default:
      return FileText;
  }
}

function truncateSnippet(s: string, max = 200): string {
  if (s.length <= max) return s;
  return s.slice(0, max).trimEnd() + "…";
}

// `citationHrefFor` accepts a `RagSearchHit` — we feed it just the fields
// it needs (chunk_id, source_kind, source_id, metadata.page_number).
function hrefForNormalized(hit: NormalizedHit): string {
  const synth: RagSearchHit = {
    chunk_id: hit.chunk_id,
    source_kind: hit.source_kind,
    source_id: hit.source_id,
    field_id: null,
    parent_chunk_id: null,
    chunk_kind: "",
    snippet: hit.snippet,
    score: hit.score,
    vector_rank: hit.vector_rank,
    lexical_rank: hit.lexical_rank,
    rerank_score: hit.rerank_score,
    metadata:
      hit.page_number != null && hit.metadata["page_number"] === undefined
        ? { ...hit.metadata, page_number: hit.page_number }
        : hit.metadata,
  };
  return citationHrefFor(synth);
}

// ---------------------------------------------------------------------------
// Per-hit row
// ---------------------------------------------------------------------------

function HitRow({ hit }: { hit: NormalizedHit }) {
  const Icon = iconForSourceKind(hit.source_kind);
  const href = hrefForNormalized(hit);
  const hasBreakdown =
    hit.vector_rank != null ||
    hit.lexical_rank != null ||
    hit.rerank_score != null;
  const labelText =
    hit.file_name ?? `${hit.source_kind} · ${hit.source_id.slice(0, 8)}`;
  return (
    <li className="rounded-md border border-border bg-card overflow-hidden hover:border-primary/30 transition-colors">
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 text-xs mb-1">
          <span className="tabular-nums font-mono w-6 text-right text-muted-foreground shrink-0">
            #{hit.rank}
          </span>
          <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="font-mono uppercase tracking-wide text-[10px] text-muted-foreground shrink-0">
            {hit.source_kind}
          </span>
          <span className="truncate font-medium text-foreground">
            {labelText}
          </span>
          {hit.page_number != null && (
            <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
              p.{hit.page_number}
            </span>
          )}
          <span className="ml-auto flex items-center gap-1 shrink-0">
            <span className="tabular-nums text-[10px] text-muted-foreground">
              {hit.score.toFixed(3)}
            </span>
            {hasBreakdown && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    aria-label="Score breakdown"
                    title="Score breakdown"
                  >
                    <Info className="h-3 w-3" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-56 p-2 text-[11px] space-y-1"
                  align="end"
                  side="top"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="font-mono uppercase tracking-wide text-[10px] text-muted-foreground mb-1">
                    Score breakdown
                  </div>
                  <ScoreLine
                    label="Vector rank"
                    value={hit.vector_rank}
                    fmt="rank"
                  />
                  <ScoreLine
                    label="Lexical rank"
                    value={hit.lexical_rank}
                    fmt="rank"
                  />
                  <ScoreLine
                    label="Rerank score"
                    value={hit.rerank_score}
                    fmt="score"
                  />
                  <div className="pt-1 border-t mt-1 text-muted-foreground font-mono break-all">
                    chunk_id: {hit.chunk_id}
                  </div>
                </PopoverContent>
              </Popover>
            )}
            <Link
              href={href}
              prefetch={false}
              className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              open
              <ExternalLink className="h-3 w-3" />
            </Link>
          </span>
        </div>
        <p className="text-xs text-foreground whitespace-pre-wrap break-words line-clamp-3 leading-snug">
          {truncateSnippet(hit.snippet)}
        </p>
      </div>
    </li>
  );
}

function ScoreLine({
  label,
  value,
  fmt,
}: {
  label: string;
  value: number | null;
  fmt: "rank" | "score";
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-mono">
        {value == null
          ? "—"
          : fmt === "rank"
            ? `#${value}`
            : value.toFixed(3)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Renderer (used for both inline + overlay; same data, same view)
// ---------------------------------------------------------------------------

export const RagSearchInline: React.FC<ToolRendererProps> = ({ entry }) => {
  const data = useMemo(() => parse(entry), [entry]);

  if (data.isError) {
    return (
      <div className="flex items-start gap-2 text-xs text-destructive py-2">
        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="font-medium">RAG search failed</div>
          {data.errorMessage && (
            <div className="text-[11px] text-muted-foreground">
              {data.errorMessage}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (data.isLoading && data.hits.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2 animate-in fade-in">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        <span>
          Searching indexed content
          {data.query ? ` for "${data.query}"` : ""}…
        </span>
      </div>
    );
  }

  if (data.hits.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Search className="h-3.5 w-3.5" />
        <span>
          No hits
          {data.query ? ` for "${data.query}"` : ""}.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2 animate-in fade-in">
      {/* Compact header: totals + latency + reranker */}
      <div className="flex items-center flex-wrap gap-1.5 text-[10px] text-muted-foreground">
        <Chip>
          <span className="tabular-nums font-semibold text-foreground">
            {data.hits.length}
          </span>
          {data.hits.length === 1 ? " hit" : " hits"}
        </Chip>
        {data.total_candidates != null && (
          <Chip>
            <span className="tabular-nums">{data.total_candidates}</span>{" "}
            candidates
          </Chip>
        )}
        {data.latency_ms != null && (
          <Chip>
            <span className="tabular-nums">{data.latency_ms}</span> ms
          </Chip>
        )}
        {data.reranker_model && (
          <Chip>reranked · {data.reranker_model}</Chip>
        )}
        {data.query && (
          <span className="ml-auto truncate max-w-[60%] italic">
            “{data.query}”
          </span>
        )}
      </div>

      {/* Hit list */}
      <ol
        className={cn("flex flex-col gap-1.5", "max-h-[420px] overflow-y-auto")}
      >
        {data.hits.map((h, i) => (
          <HitRow key={`${h.chunk_id}-${i}`} hit={h} />
        ))}
      </ol>
    </div>
  );
};

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/30 px-1.5 py-0.5">
      {children}
    </span>
  );
}
