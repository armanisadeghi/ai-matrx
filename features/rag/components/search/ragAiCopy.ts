import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import { factsOnlyMetadata } from "@/features/rag/components/hit-card/copyMetadata";
import type { RagHitView } from "@/features/rag/components/hit-card/types";

export const RAG_AI_SECTION_KEYS = [
  "retrieved",
  "document",
  "clean",
  "raw",
  "tables",
  "images",
  "custom",
  "derived",
  "verification",
] as const;

export type RagAiSectionKey = (typeof RAG_AI_SECTION_KEYS)[number];

export interface RagAiCopySection {
  key: RagAiSectionKey;
  label: string;
  description: string;
  /** Exact, format-aware text used by the one-click human copy action. */
  humanText: string;
  /** Structured representation included in the AI payload. */
  data: unknown;
  count?: number;
  total?: number;
}

export interface RagAiCopyBundle {
  source: {
    name: string;
    kind: string;
    typeLabel: string;
    id: string;
    fileId: string | null;
    processedDocumentId: string | null;
    libraryShortCode: string | null;
    href: string;
  };
  retrieval: {
    chunkId: string;
    fieldId: string | null;
    parentChunkId: string | null;
    chunkKind: string | null;
    resultType: string | null;
    pageNumber: number | null;
    pageNumbers: number[] | null;
  };
  ranking: {
    score: number;
    vectorRank: number | null;
    lexicalRank: number | null;
    rerankScore: number | null;
    entityRank: number | null;
    entities: string[];
  };
  metadata: Record<string, unknown>;
  sections: Partial<Record<RagAiSectionKey, RagAiCopySection>>;
}

export interface RagAiCopyOptions {
  includedSections: RagAiSectionKey[];
  includeRanking: boolean;
  includeMetadata: boolean;
  /** 0 means unlimited. Applied recursively to every string value. */
  maxTextChars: number;
  /** 0 means unlimited. Applied recursively to arrays. */
  maxItems: number;
}

const RESULT_TYPE_LABELS: Record<string, string> = {
  chunked_coarse: "Coarse passage",
  chunked_fine: "Fine passage",
  table: "Table",
  image: "Image",
  page: "Page",
};

function resultTypeLabel(kind: string | null): string | null {
  if (!kind) return null;
  return (
    RESULT_TYPE_LABELS[kind] ??
    kind.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

export function createRagAiCopyBundle(
  view: RagHitView,
  title: string,
  typeLabel: string,
  href: string,
): RagAiCopyBundle {
  return {
    source: {
      name: title,
      kind: view.sourceKind,
      typeLabel,
      id: view.sourceId,
      fileId: view.sourceKind === "cld_file" ? view.sourceId : null,
      processedDocumentId:
        view.sourceKind === "library_doc" ? view.sourceId : null,
      libraryShortCode: view.libraryShortCode,
      href,
    },
    retrieval: {
      chunkId: view.chunkId,
      fieldId: view.fieldId,
      parentChunkId: view.parentChunkId,
      chunkKind: view.chunkKind,
      resultType: resultTypeLabel(view.chunkKind),
      pageNumber: view.pageNumber,
      pageNumbers: view.pageNumbers,
    },
    ranking: {
      score: view.score,
      vectorRank: view.vectorRank,
      lexicalRank: view.lexicalRank,
      rerankScore: view.rerankScore,
      entityRank: view.entityRank,
      entities: view.entities,
    },
    metadata: factsOnlyMetadata(view.metadata) as Record<string, unknown>,
    sections: {
      retrieved: {
        key: "retrieved",
        label: "Retrieved content",
        description: "The exact passage returned by this search result.",
        humanText: view.snippet,
        data: { text: view.snippet },
      },
    },
  };
}

export function withRagAiSections(
  bundle: RagAiCopyBundle,
  sections: RagAiCopySection[],
): RagAiCopyBundle {
  const next = { ...bundle.sections };
  for (const section of sections) next[section.key] = section;
  return { ...bundle, sections: next };
}

function trimValue(
  value: unknown,
  maxTextChars: number,
  maxItems: number,
): unknown {
  if (typeof value === "string") {
    if (maxTextChars <= 0 || value.length <= maxTextChars) return value;
    return `${value.slice(0, maxTextChars)}… [${(
      value.length - maxTextChars
    ).toLocaleString()} chars omitted]`;
  }
  if (Array.isArray(value)) {
    const shown = maxItems > 0 ? value.slice(0, maxItems) : value;
    const trimmed = shown.map((item) =>
      trimValue(item, maxTextChars, maxItems),
    );
    if (shown.length < value.length) {
      trimmed.push({ omitted_items: value.length - shown.length });
    }
    return trimmed;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        trimValue(item, maxTextChars, maxItems),
      ]),
    );
  }
  return value;
}

export function defaultRagAiCopyOptions(
  bundle: RagAiCopyBundle,
): RagAiCopyOptions {
  const preferred: RagAiSectionKey[] = [
    "retrieved",
    "clean",
    "tables",
    "images",
    "custom",
  ];
  const includedSections = preferred.filter((key) => bundle.sections[key]);
  if (!includedSections.length && bundle.sections.retrieved) {
    includedSections.push("retrieved");
  }
  return {
    includedSections,
    includeRanking: true,
    includeMetadata: false,
    maxTextChars: 8_000,
    maxItems: 25,
  };
}

export function allRagAiCopyOptions(bundle: RagAiCopyBundle): RagAiCopyOptions {
  return {
    includedSections: RAG_AI_SECTION_KEYS.filter((key) => bundle.sections[key]),
    includeRanking: true,
    includeMetadata: true,
    maxTextChars: 0,
    maxItems: 0,
  };
}

export function identifiersOnlyRagAiCopyOptions(): RagAiCopyOptions {
  return {
    includedSections: [],
    includeRanking: false,
    includeMetadata: false,
    maxTextChars: 8_000,
    maxItems: 25,
  };
}

export function buildRagAiPayload(
  bundle: RagAiCopyBundle,
  options: RagAiCopyOptions,
): AgentPayloadInput {
  const selected = options.includedSections
    .map((key) => bundle.sections[key])
    .filter((section): section is RagAiCopySection => Boolean(section));
  const content = Object.fromEntries(
    selected.map((section) => [
      section.key,
      {
        label: section.label,
        description: section.description,
        shown: section.count,
        total: section.total,
        data: trimValue(section.data, options.maxTextChars, options.maxItems),
      },
    ]),
  );
  const data: Record<string, unknown> = {
    source: {
      name: bundle.source.name,
      kind: bundle.source.kind,
      type_label: bundle.source.typeLabel,
      id: bundle.source.id,
      file_id: bundle.source.fileId,
      processed_document_id: bundle.source.processedDocumentId,
      library_short_code: bundle.source.libraryShortCode,
      href: bundle.source.href,
    },
    retrieval: {
      chunk_id: bundle.retrieval.chunkId,
      field_id: bundle.retrieval.fieldId,
      parent_chunk_id: bundle.retrieval.parentChunkId,
      chunk_kind: bundle.retrieval.chunkKind,
      type_label: bundle.retrieval.resultType,
      page_number: bundle.retrieval.pageNumber,
      page_numbers: bundle.retrieval.pageNumbers,
    },
  };
  if (options.includeRanking) {
    data.ranking = {
      score: bundle.ranking.score,
      vector_rank: bundle.ranking.vectorRank,
      lexical_rank: bundle.ranking.lexicalRank,
      rerank_score: bundle.ranking.rerankScore,
      entity_rank: bundle.ranking.entityRank,
      entities: bundle.ranking.entities,
    };
  }
  if (options.includeMetadata) data.metadata = bundle.metadata;
  if (selected.length) data.content = content;

  const summaryLines = [
    `Source: ${bundle.source.name}`,
    `Type: ${bundle.source.typeLabel}`,
    bundle.retrieval.resultType
      ? `Result type: ${bundle.retrieval.resultType}`
      : null,
    bundle.retrieval.pageNumber != null
      ? `Page: ${bundle.retrieval.pageNumber}`
      : null,
    `Included content: ${
      selected.length
        ? selected.map((section) => section.label).join(", ")
        : "none"
    }`,
  ].filter((line): line is string => Boolean(line));

  return {
    kind: "rag-result-reference",
    location: "AI Matrx — RAG search results",
    description:
      selected.length > 0
        ? "Identifying, retrieval, and user-selected content for one RAG result."
        : "Identifying and retrieval facts for one RAG result; document content is intentionally excluded.",
    attributes: {
      source_kind: bundle.source.kind,
      page_number: bundle.retrieval.pageNumber,
      included_sections: selected.length,
      max_text_chars: options.maxTextChars || "unlimited",
      max_items: options.maxItems || "unlimited",
    },
    context: {
      source_id: bundle.source.id,
      file_id: bundle.source.fileId,
      processed_document_id: bundle.source.processedDocumentId,
      chunk_id: bundle.retrieval.chunkId,
      field_id: bundle.retrieval.fieldId,
      parent_chunk_id: bundle.retrieval.parentChunkId,
    },
    summary: summaryLines.join("\n"),
    data,
  };
}

export function ragAiPreviewText(
  bundle: RagAiCopyBundle,
  options: RagAiCopyOptions,
): string {
  return JSON.stringify(buildRagAiPayload(bundle, options).data, null, 2);
}

export function combineSelectedHumanText(
  bundle: RagAiCopyBundle,
  options: RagAiCopyOptions,
): string {
  return options.includedSections
    .map((key) => bundle.sections[key])
    .filter((section): section is RagAiCopySection => Boolean(section))
    .map((section) => `# ${section.label}\n\n${section.humanText}`)
    .join("\n\n");
}
