import type { LucideIcon } from "lucide-react";
import {
  FileText,
  NotebookText,
  Code2,
  BookOpen,
  Mic,
  Globe,
} from "lucide-react";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { getArg, isTerminal, resultAsObject } from "../_shared";
import { citationHrefFor, type RagSearchHit } from "@/features/rag/api/search";
import type { ToolAccent } from "../../types";

/**
 * Parse + normalize the `rag_search` tool result, and map a source_kind to its
 * glossy glyph. Output shape (aidream): { query, hits[], total_candidates,
 * embedding_model, reranker_model, latency_ms }. Persisted hits carry
 * vector_rank/lexical_rank/rerank_score/metadata; streamed hits carry
 * rank/file_name/page_number — normalized to one shape here.
 */

export interface NormalizedHit {
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
  /** Rank in the KG entity-recall lane (1 = best); non-null only when the hit
   * was surfaced because its source mentions a matched entity. */
  entity_rank: number | null;
  /** Entity names this chunk mentions (KG) — the per-hit "why it ranked". */
  entities: string[];
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
  entity_rank?: number | null;
  entities?: string[] | null;
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
  // Both `score` and `page_number` are untrusted JSON off the wire (streamed
  // hits may omit or malform them). Coerce here so no render path hits
  // `undefined.toFixed()` or prints "NaN" / "Page NaN".
  const rawPage =
    typeof raw.page_number === "number" && Number.isFinite(raw.page_number)
      ? raw.page_number
      : null;
  return {
    rank: raw.rank ?? index + 1,
    chunk_id: raw.chunk_id,
    source_kind: raw.source_kind,
    source_id: raw.source_id,
    snippet: raw.snippet,
    score: Number.isFinite(raw.score) ? raw.score : 0,
    file_name: raw.file_name ?? fileNameFromMeta,
    page_number: rawPage ?? pageFromMeta,
    vector_rank: raw.vector_rank ?? null,
    lexical_rank: raw.lexical_rank ?? null,
    rerank_score: raw.rerank_score ?? null,
    entity_rank: raw.entity_rank ?? null,
    entities: raw.entities ?? [],
    metadata: meta,
  };
}

export interface ParsedRagSearch {
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

export function parseRag(entry: ToolLifecycleEntry): ParsedRagSearch {
  const queryArg = getArg<string>(entry, "query") ?? "";
  const result = resultAsObject(entry) as {
    query?: string;
    hits?: RawHit[];
    total_candidates?: number;
    embedding_model?: string;
    reranker_model?: string | null;
    latency_ms?: number;
  } | null;
  const isError = entry.status === "error";
  const done = isTerminal(entry);
  const base = {
    query: queryArg,
    hits: [] as NormalizedHit[],
    total_candidates: null,
    embedding_model: null,
    reranker_model: null,
    latency_ms: null,
  };
  if (isError) {
    return {
      ...base,
      isLoading: false,
      isError: true,
      errorMessage: entry.errorMessage ?? "Search failed",
    };
  }
  if (!result) {
    return { ...base, isLoading: !done, isError: false, errorMessage: null };
  }
  return {
    query: result.query ?? queryArg,
    hits: (result.hits ?? []).map(normalizeHit),
    total_candidates: result.total_candidates ?? null,
    embedding_model: result.embedding_model ?? null,
    reranker_model: result.reranker_model ?? null,
    latency_ms: result.latency_ms ?? null,
    isLoading: false,
    isError: false,
    errorMessage: null,
  };
}

// ─── Source-kind glyph + deep link ──────────────────────────────────────────

interface KindGlyph {
  icon: LucideIcon;
  accent: ToolAccent;
  label: string;
}

const KIND: Record<string, KindGlyph> = {
  cld_file: { icon: FileText, accent: "slate", label: "File" },
  note: { icon: NotebookText, accent: "amber", label: "Note" },
  code_file: { icon: Code2, accent: "blue", label: "Code" },
  library_doc: { icon: BookOpen, accent: "violet", label: "Library" },
  transcript: { icon: Mic, accent: "rose", label: "Transcript" },
  scraped: { icon: Globe, accent: "cyan", label: "Web page" },
};

export function kindGlyph(kind: string): KindGlyph {
  return KIND[kind] ?? { icon: FileText, accent: "slate", label: kind };
}

/** Deep link for a hit via the canonical citation router. */
export function hrefForNormalized(hit: NormalizedHit): string {
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
    entity_rank: null,
    entities: [],
    metadata:
      hit.page_number != null && hit.metadata["page_number"] === undefined
        ? { ...hit.metadata, page_number: hit.page_number }
        : hit.metadata,
  };
  return citationHrefFor(synth);
}
