/**
 * Shared human/agent copy builders for Knowledge chunk lists.
 *
 * Chunk lists are the biggest data surface in the feature — a document page's
 * segments routinely run to tens of thousands of characters — so per the
 * `agent-copy` sized-to-data doctrine their AI control is a dropdown PLUS a
 * custom composer, and the composer's primary lever is **chars per chunk**.
 *
 * Everything here is a pure `(data, options) => …` builder with no React, so
 * the chrome never owns shortening logic and AI features can call the same
 * builders with nothing clicked.
 */

import type { ChunkLike } from "@/features/knowledge/components/library/ChunkList";

/** Where the chunks came from — mirrored into every payload envelope. */
export interface ChunkScope {
  /** e.g. `Library preview` or `Knowledge asset builder`. */
  surface: string;
  documentId?: string;
  derivativeId?: string;
  pageNumber?: number;
  /** How many chunks exist server-side (may exceed what is loaded). */
  total: number;
}

export function ragLocation(surface: string): string {
  return `AI Matrx — Knowledge — ${surface}`;
}

/** One chunk, as the card reads on screen. */
export function chunkSummary(c: ChunkLike): string {
  const bits = [
    `#${c.chunk_index ?? "?"}`,
    c.page_numbers?.length ? `p.${c.page_numbers.join(",")}` : null,
    c.chunk_kind,
    c.section_kind,
    c.token_count != null ? `${c.token_count} tok` : null,
    c.has_oai_embedding ? "embedded" : "no embed",
  ].filter(Boolean);
  return `${bits.join(" · ")}\n${c.content_text}`;
}

export function chunksListSummary(chunks: ChunkLike[]): string {
  return chunks.map(chunkSummary).join("\n\n");
}

/**
 * Projection with a chars-per-chunk cap. `chars = 0` means unlimited.
 *
 * A clipped chunk states exactly how much it dropped — a stub must be honest
 * so the agent knows there is more to ask for.
 */
export function chunkBrief(c: ChunkLike, chars = 0) {
  const text = c.content_text ?? "";
  const truncated = chars > 0 && text.length > chars;
  return {
    id: c.id,
    chunk_index: c.chunk_index,
    chunk_kind: c.chunk_kind,
    section_kind: c.section_kind,
    page_numbers: c.page_numbers,
    token_count: c.token_count,
    has_oai_embedding: c.has_oai_embedding,
    content_text: truncated ? text.slice(0, chars) : text,
    content_chars: text.length,
    content_truncated: truncated
      ? `omitted ${text.length - chars} of ${text.length} chars`
      : undefined,
  };
}

/** Identity + provenance only — no chunk bodies at all. */
export function chunkIndexRow(c: ChunkLike) {
  const { content_text, content_truncated, ...rest } = chunkBrief(c, 0);
  return { ...rest, content_chars: rest.content_chars };
}

/**
 * The loaded-vs-total note. When a list has only fetched part of the set, the
 * payload says so explicitly rather than silently presenting a slice as the
 * whole thing.
 */
export function chunkCoverage(loaded: number, total: number) {
  const complete = total <= loaded;
  return {
    chunks_loaded: loaded,
    chunks_total: total || loaded,
    complete,
    note: complete
      ? undefined
      : `Only ${loaded} of ${total} chunks are loaded on screen; use "Show all" to load the rest before copying everything.`,
  };
}

export function chunkAttributes(
  scope: ChunkScope,
  loaded: number,
  extra?: Record<string, string | number | boolean | undefined>,
) {
  return {
    document_id: scope.documentId,
    derivative_id: scope.derivativeId,
    page_number: scope.pageNumber,
    chunks_loaded: loaded,
    chunks_total: scope.total || loaded,
    complete: (scope.total || loaded) <= loaded,
    ...extra,
  };
}

export const CHUNK_CSV_COLUMNS = [
  { key: "id", header: "ID" },
  { key: "chunk_index", header: "Index" },
  { key: "chunk_kind", header: "Kind" },
  { key: "section_kind", header: "Section" },
  { key: "page_numbers", header: "Pages" },
  { key: "token_count", header: "Tokens" },
  { key: "has_oai_embedding", header: "Embedded" },
  { key: "content_chars", header: "Chars" },
  { key: "content_text", header: "Text" },
];

/** The chars-per-chunk composer schema — the lever this data actually needs. */
export const CHUNK_CUSTOM_OPTIONS = [
  {
    kind: "number" as const,
    key: "chars",
    label: "Chars per chunk",
    hint: "0 = unlimited. Clipped chunks state how much they dropped.",
    min: 0,
    step: 100,
    presets: [
      { label: "200", value: 200 },
      { label: "500", value: 500 },
      { label: "1k", value: 1000 },
      { label: "4k", value: 4000 },
      { label: "All", value: 0 },
    ],
    default: 500,
  },
  {
    kind: "toggle" as const,
    key: "embeddedOnly",
    label: "Embedded only",
    hint: "Drop chunks with no embedding.",
    default: false,
  },
  {
    kind: "toggle" as const,
    key: "indexOnly",
    label: "Index only (no text)",
    hint: "Identity, provenance and sizes — no chunk bodies.",
    default: false,
  },
];

/** Apply the composer options to a chunk set. Pure. */
export function applyChunkCustom(
  chunks: ChunkLike[],
  opts: Record<string, boolean | number>,
) {
  let rows = chunks;
  if (opts.embeddedOnly) rows = rows.filter((c) => c.has_oai_embedding);
  if (opts.indexOnly) return rows.map(chunkIndexRow);
  return rows.map((c) => chunkBrief(c, Number(opts.chars ?? 500)));
}
