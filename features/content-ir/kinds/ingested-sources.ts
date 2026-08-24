/**
 * `ingested_sources` (+ nested child `ingested_chunk`) — what the platform
 * actually took in from a person's materials, as a Shape.
 *
 * Produced by `docproc.ingest.from_media_refs` (aidream
 * `aidream/graph_actions/docproc/ingest.py`, output model `IngestedContent`),
 * which is the FIRST step of every Study Pack run — so this shape is on screen
 * from the opening seconds. Before registration it rendered as a raw JSON
 * viewer: a learner who pasted a chapter of their own textbook was shown
 * `content_hash`, `chunk_index` and `source_offset_end` instead of "we read
 * your pasted material — 1,057 characters".
 *
 * PYTHON-OWNED. The DB row's `emitted_json_schema` is
 * `IngestedContent.model_json_schema()` verbatim (never hand-written, never
 * regenerated from the TS schema below); the schema here is the compiled
 * client mirror that lets the parser type an instance before any network
 * fetch. Same arrangement as `podcast_episode` / `podcast_speaker`, and
 * `ingested_chunk` likewise has no DB row — it lives inline in the parent's
 * `$defs`.
 *
 * Canonical `__kind` JSON shape:
 *   { "__kind":"ingested_sources",
 *     "chunks":[ { "__kind":"ingested_chunk", "chunk_id":"…", "content":"…",
 *                  "content_hash":"…", "chunk_index":0, "kind":"plain_text",
 *                  "source_label":"Pasted material", … } ],
 *     "total_chars":1057, "source_count":1,
 *     "sources_requested":1, "sources_ingested":1, "sources_failed":0,
 *     "errors":[] }
 *
 * 🚨 PARTIAL SOURCE LOSS IS THE POINT OF THE COUNT TRIO. `sources_requested`
 * / `sources_ingested` / `sources_failed` exist so a pack built from 1 of 3
 * uploads CANNOT pose as complete (the model's own docstring says so, audit
 * P0-2d). Any renderer of this shape states the shortfall and names the
 * reasons in `errors` — hiding it is the defect those fields were added to
 * prevent.
 *
 * THE READER'S UNIT IS A SOURCE, NOT A CHUNK. Chunking is an implementation
 * detail of retrieval; the person recognizes "my pasted material" and "the PDF
 * I attached". `groupChunksBySource` is the ONE place that regrouping happens
 * — never re-derive it in a surface.
 */

import type { CanonicalBlockIR } from "@ai-matrx/content-ir";
import type { KindSchema } from "@ai-matrx/content-ir";
import type { KindDefinition } from "@ai-matrx/content-ir";
import {
  additionalDetailsSection,
  collectExtras,
  joinBlocks,
} from "./kind-markdown-utils";
import { KIND_KEY } from "@ai-matrx/content-ir";
import type { MaterializedKind } from "./kind-payload";
import type { IngestedChunk, IngestedSources } from "./generated/kinds.generated";

// ---------------------------------------------------------------------------
// Schemas — the compiled client mirror of IngestedContent / IngestedChunk.
// ---------------------------------------------------------------------------

export const ingestedChunkKindSchema: KindSchema = {
  kind: "ingested_chunk",
  fields: {
    chunk_id: {
      type: "string",
      required: true,
      description: "Stable id for this piece of the source.",
    },
    content: {
      type: "string",
      required: true,
      description: "The readable text of this piece.",
    },
    content_hash: {
      type: "string",
      required: true,
      description: "sha256 of the content — how a re-ingest recognizes a piece it already has.",
    },
    chunk_index: {
      type: "number",
      required: true,
      description: "Position of this piece within its source, starting at 0.",
    },
    kind: {
      type: "string",
      required: true,
      description:
        "What the source was — 'plain_text', 'user_note', 'pdf', 'web_page', and so on.",
    },
    source_label: {
      type: "string",
      description: "The human name of the source this piece came from.",
    },
    source_media_ref_id: {
      type: "string",
      nullable: true,
      description: "The stored file this piece came from, when there was one.",
    },
    source_offset_start: {
      type: "number",
      description: "Character offset where this piece starts in its source.",
    },
    source_offset_end: {
      type: "number",
      description: "Character offset where this piece ends in its source.",
    },
    source_metadata: {
      type: "record",
      values: "json",
      description: "Per-source provenance — url, path, file id, mime type.",
    },
  },
};

export const ingestedSourcesKindSchema: KindSchema = {
  kind: "ingested_sources",
  fields: {
    chunks: {
      type: "array",
      itemKinds: ["ingested_chunk"],
      description: "Every piece of readable text taken from the materials, in order.",
    },
    total_chars: {
      type: "number",
      description: "How much readable material was taken in, in characters.",
    },
    source_count: {
      type: "number",
      description: "How many distinct sources contributed text.",
    },
    sources_requested: {
      type: "number",
      description: "How many sources were handed in.",
    },
    sources_ingested: {
      type: "number",
      description: "How many of them were read successfully.",
    },
    sources_failed: {
      type: "number",
      description: "How many could not be read. Never hide a non-zero value.",
    },
    errors: {
      type: "string[]",
      description: "Why each failed source failed, in the reader's language where possible.",
    },
  },
};

export const INGESTED_SOURCES_KIND_SCHEMAS: KindSchema[] = [
  ingestedSourcesKindSchema,
  ingestedChunkKindSchema,
];

// ---------------------------------------------------------------------------
// serverData bridge
// ---------------------------------------------------------------------------

/**
 * Source-kind → what a person calls it. Unknown values fall back to a
 * humanized form of the raw token rather than the token itself, because the
 * set is open by design (the node's docstring says "etc.").
 */
const SOURCE_KIND_LABEL: Record<string, string> = {
  plain_text: "Pasted text",
  user_note: "Your note",
  pdf: "PDF",
  web_page: "Web page",
  html: "Web page",
  text: "Text file",
  markdown: "Markdown",
  docx: "Word document",
  transcript: "Transcript",
};

export function sourceKindLabel(kind: string): string {
  if (kind === "") return "Material";
  const known = SOURCE_KIND_LABEL[kind];
  if (known) return known;
  const humanized = kind.replace(/[_-]+/g, " ").trim();
  return humanized.charAt(0).toUpperCase() + humanized.slice(1);
}

/** THE SHAPE COMES FROM THE REGISTRY — the three fields a reader needs. */
export type IngestedChunkData = Pick<
  IngestedChunk,
  "chunk_id" | "content" | "chunk_index"
>;

/** One SOURCE as the reader understands it — its pieces already regrouped. */
export interface IngestedSourceData {
  /** Stable key for lists — label + kind + media ref. */
  key: string;
  label: string;
  kind: string;
  kindLabel: string;
  mediaRefId: string | null;
  chunks: IngestedChunkData[];
  /** Characters of readable text across this source's pieces. */
  chars: number;
  /** The source's text, pieces rejoined in order — what "expand" reveals. */
  text: string;
}

/**
 * THE COUNTS COME FROM THE REGISTRY. `sources` is the bridge's own work: the
 * flat `chunks[]` the producer emits, GROUPED by source for the reader.
 */
export type IngestedSourcesData = Omit<
  MaterializedKind<IngestedSources>,
  "__kind" | "chunks"
> & {
  sources: IngestedSourceData[];
  isComplete: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * THE regrouping: chunks (a retrieval detail) → sources (what the person
 * handed in). Order is first-appearance, so the list reads in the order the
 * materials were given. Chunks within a source are ordered by `chunk_index`,
 * which is what makes the rejoined `text` readable rather than shuffled.
 */
export function groupChunksBySource(
  rawChunks: readonly unknown[],
): IngestedSourceData[] {
  const byKey = new Map<string, IngestedSourceData>();

  for (const raw of rawChunks) {
    if (!isRecord(raw)) continue;
    const content = stringOr(raw.content, "");
    const kind = stringOr(raw.kind, "");
    const label = stringOr(raw.source_label, "");
    const mediaRefId =
      typeof raw.source_media_ref_id === "string" &&
      raw.source_media_ref_id !== ""
        ? raw.source_media_ref_id
        : null;
    const key = `${label} ${kind} ${mediaRefId ?? ""}`;

    let source = byKey.get(key);
    if (!source) {
      source = {
        key,
        label: label === "" ? sourceKindLabel(kind) : label,
        kind,
        kindLabel: sourceKindLabel(kind),
        mediaRefId,
        chunks: [],
        chars: 0,
        text: "",
      };
      byKey.set(key, source);
    }
    source.chunks.push({
      chunk_id: stringOr(raw.chunk_id, ""),
      content,
      chunk_index: numberOr(raw.chunk_index, source.chunks.length),
    });
    source.chars += content.length;
  }

  const sources = [...byKey.values()];
  for (const source of sources) {
    source.chunks.sort((a, b) => a.chunk_index - b.chunk_index);
    // Chunks overlap by design (`chunk_overlap`), so a naive join repeats
    // text. Two adjacent pieces are joined on the longest suffix/prefix they
    // share, which reproduces the original prose for the reader.
    source.text = source.chunks.reduce(
      (acc, chunk) => (acc === "" ? chunk.content : joinOverlapping(acc, chunk.content)),
      "",
    );
  }
  return sources;
}

/** Longest suffix of `left` that prefixes `right`, capped for sanity. */
function joinOverlapping(left: string, right: string): string {
  const max = Math.min(left.length, right.length, 4000);
  for (let size = max; size > 20; size--) {
    if (left.endsWith(right.slice(0, size))) return left + right.slice(size);
  }
  return `${left}\n\n${right}`;
}

export function coerceIngestedSources(value: unknown): IngestedSourcesData {
  const record = isRecord(value) ? value : {};
  const rawChunks = Array.isArray(record.chunks) ? record.chunks : [];
  const sources = groupChunksBySource(rawChunks);
  const errors = Array.isArray(record.errors)
    ? record.errors.filter((e): e is string => typeof e === "string")
    : [];

  return {
    sources,
    total_chars: numberOr(
      record.total_chars,
      sources.reduce((sum, s) => sum + s.chars, 0),
    ),
    source_count: numberOr(record.source_count, sources.length),
    sources_requested: numberOr(record.sources_requested, sources.length),
    sources_ingested: numberOr(record.sources_ingested, sources.length),
    sources_failed: numberOr(record.sources_failed, errors.length),
    errors,
    isComplete: true,
  };
}

export function ingestedSourcesServerDataFromEnvelope(
  envelope: CanonicalBlockIR,
): (IngestedSourcesData & Record<string, unknown>) | undefined {
  if (envelope.root.kind !== "ingested_sources") return undefined;
  return {
    ...coerceIngestedSources(envelope.root.value),
    isComplete: envelope.root.status === "complete",
  };
}

// ---------------------------------------------------------------------------
// toMarkdown facet — the intake as readable text, never a chunk dump.
// ---------------------------------------------------------------------------

const MD_KNOWN_KEYS = [
  "chunks",
  "total_chars",
  "source_count",
  "sources_requested",
  "sources_ingested",
  "sources_failed",
  "errors",
  KIND_KEY,
];

export function ingestedSourcesMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const data = coerceIngestedSources(value);
  const shortfall =
    (data.sources_failed ?? 0) > 0
      ? `**${(data.sources_failed ?? 0)} of ${data.sources_requested} could not be read.**`
      : null;

  return joinBlocks([
    "# Your materials",
    `${data.source_count} ${data.source_count === 1 ? "source" : "sources"} · ${(data.total_chars ?? 0).toLocaleString()} characters of readable text`,
    shortfall,
    data.errors.length > 0 ? data.errors.map((e) => `- ${e}`).join("\n") : null,
    ...data.sources.map((source) =>
      joinBlocks([
        `## ${source.label}`,
        `${source.kindLabel} · ${source.chars.toLocaleString()} characters`,
        source.text,
      ]),
    ),
    additionalDetailsSection(collectExtras(value, MD_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// Compiled definitions — registered centrally in system-kinds.ts.
// ---------------------------------------------------------------------------

export const INGESTED_SOURCES_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "ingested_sources",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "ingested_sources",
    toLegacyServerData: ingestedSourcesServerDataFromEnvelope,
    toMarkdown: ingestedSourcesMarkdownFromValue,
    persistence: { persistStructured: true },
    loadingComponent: "list",
    schema: ingestedSourcesKindSchema,
  },
  {
    kind: "ingested_chunk",
    schemaSource: "system",
    tier: "eager",
    schema: ingestedChunkKindSchema,
  },
];
