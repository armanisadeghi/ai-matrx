/**
 * Closed-corpus grounding for any product surface that needs cited passages.
 *
 * Corpus inventory is a direct, owner-scoped Postgres read. Retrieval itself
 * always goes through the canonical streamed RAG API; this module never reads
 * chunks or embeddings directly.
 */
import { supabase } from "@/utils/supabase/client";
import { docprocDb } from "@/utils/supabase/docprocDb";
import type {
  SourceCitation,
  TrustEnvelope,
} from "@/features/education/trust/types";
import { ragSearch, type RagSearchHit } from "./search";

export interface GroundingSource {
  sourceKind: string;
  sourceId: string;
  title: string;
}

export type GroundingCorpus =
  { mode: "learner_owned" } | { mode: "explicit"; sources: GroundingSource[] };

export interface GroundingRequest {
  query: string;
  corpus: GroundingCorpus;
  limit?: number;
}

export interface GroundingActor {
  /** Required for learner_owned. Deliberately explicit: no hidden auth lookup. */
  userId?: string;
}

export interface GroundedPassage {
  chunkId: string;
  text: string;
  title: string;
  sourceKind: string;
  sourceId: string;
  fileId?: string;
  documentId?: string;
  page?: number;
  locator: string;
  score: number;
}

export interface GroundingResult {
  status: "retrieved" | "empty" | "failed";
  passages: GroundedPassage[];
  trust: TrustEnvelope;
  error?: string;
}

const EMPTY_TRUST: TrustEnvelope = {
  citations: [],
  confidence: "not_in_material",
  groundedIn: "your uploaded study materials",
};

const sourceKey = (source: Pick<GroundingSource, "sourceKind" | "sourceId">) =>
  `${source.sourceKind}:${source.sourceId}`;

/** List only root processed documents owned by this exact learner. */
export async function listLearnerOwnedGroundingSources(
  userId: string,
): Promise<GroundingSource[]> {
  if (!userId) throw new Error("Learner-owned grounding requires a user id.");
  const { data, error } = await docprocDb(supabase)
    .from("processed_documents")
    .select("name, owner_id, source_kind, source_id")
    .eq("owner_id", userId)
    .is("parent_processed_id", null)
    .is("archived_at", null)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) {
    throw new Error("We couldn't read your uploaded study materials.", {
      cause: error,
    });
  }
  if (!data) {
    throw new Error("Your uploaded study-material inventory returned no data.");
  }

  const unique = new Map<string, GroundingSource>();
  for (const row of data) {
    if (row.owner_id !== userId) continue;
    const source = {
      sourceKind: row.source_kind,
      sourceId: row.source_id,
      title: row.name,
    };
    const key = sourceKey(source);
    if (!unique.has(key)) unique.set(key, source);
  }
  return [...unique.values()];
}

function pageFor(hit: RagSearchHit): number | undefined {
  const listed = hit.page_numbers?.find(
    (page) => Number.isInteger(page) && page > 0,
  );
  if (listed !== undefined) return listed;
  const raw = hit.metadata["page_number"];
  const parsed =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseInt(raw, 10)
        : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function passageFor(
  hit: RagSearchHit,
  titles: ReadonlyMap<string, string>,
): GroundedPassage {
  const page = pageFor(hit);
  const title =
    titles.get(
      sourceKey({ sourceKind: hit.source_kind, sourceId: hit.source_id }),
    ) ?? "Uploaded study material";
  return {
    chunkId: hit.chunk_id,
    text: hit.snippet,
    title,
    sourceKind: hit.source_kind,
    sourceId: hit.source_id,
    ...(hit.source_ref?.file_id ? { fileId: hit.source_ref.file_id } : {}),
    ...(hit.processed_document_id
      ? { documentId: hit.processed_document_id }
      : {}),
    ...(page !== undefined ? { page } : {}),
    locator: page !== undefined ? `p. ${page}` : "Retrieved passage",
    score: hit.rerank_score ?? hit.score,
  };
}

export function citationForGroundedPassage(
  passage: GroundedPassage,
): SourceCitation {
  return {
    sourceId: passage.chunkId,
    sourceKind: "chunk",
    title: passage.title,
    locator: passage.locator,
    excerpt: passage.text,
    ...(passage.fileId ? { fileId: passage.fileId } : {}),
    ...(passage.documentId ? { documentId: passage.documentId } : {}),
    ...(passage.page !== undefined ? { page: passage.page } : {}),
  };
}

/**
 * Retrieve passages from exactly the requested corpus. Empty source inventory
 * fails closed; search errors are returned as `failed` so interactive callers
 * can preserve drafts while batch callers can persist the outcome.
 */
export async function retrieveGroundedPassages(
  request: GroundingRequest,
  actor: GroundingActor = {},
): Promise<GroundingResult> {
  const query = request.query.trim();
  if (!query) return { status: "empty", passages: [], trust: EMPTY_TRUST };

  try {
    const sources =
      request.corpus.mode === "explicit"
        ? request.corpus.sources
        : await listLearnerOwnedGroundingSources(actor.userId ?? "");
    if (sources.length === 0) {
      return { status: "empty", passages: [], trust: EMPTY_TRUST };
    }

    const titles = new Map(
      sources.map((source) => [sourceKey(source), source.title]),
    );
    const response = await ragSearch({
      query,
      limit: Math.min(Math.max(request.limit ?? 6, 1), 12),
      rerank: true,
      only_children: true,
      multi_query: 1,
      use_mmr: true,
      include_sources: sources.map((source) => ({
        source_kind: source.sourceKind,
        source_id: source.sourceId,
      })),
    });
    const passages = response.hits.map((hit) => passageFor(hit, titles));
    if (passages.length === 0) {
      return { status: "empty", passages: [], trust: EMPTY_TRUST };
    }

    return {
      status: "retrieved",
      passages,
      trust: {
        citations: passages.map(citationForGroundedPassage),
        // Retrieval happened, but the answer has not cited a passage yet.
        confidence: "inferred",
        groundedIn: "your uploaded study materials",
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Study-material search failed.";
    return {
      status: "failed",
      passages: [],
      trust: EMPTY_TRUST,
      error: message,
    };
  }
}

function markerValue(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

function unescapeMarkerValue(value: string): string {
  return value.replaceAll("&quot;", '"').replaceAll("&amp;", "&");
}

const GROUNDING_BLOCK_RE =
  /\[GROUNDING_PASSAGE\s+([^\]]+)]\n([\s\S]*?)\n\[\/GROUNDING_PASSAGE]/g;
const GROUNDING_ATTRIBUTE_RE = /([a-z_]+)="([^"]*)"/g;

/**
 * Recover canonical citations from the exact serialized evidence attached to a
 * completed turn. The backend persists this value on the user message's
 * `model_context`, so reloads can still validate the assistant's trust envelope
 * against what the model actually received instead of re-running today's search.
 */
export function parseGroundedPassageCitations(
  serialized: string,
): SourceCitation[] {
  const citations: SourceCitation[] = [];
  GROUNDING_BLOCK_RE.lastIndex = 0;
  for (
    let block = GROUNDING_BLOCK_RE.exec(serialized);
    block;
    block = GROUNDING_BLOCK_RE.exec(serialized)
  ) {
    const attributes: Record<string, string> = {};
    GROUNDING_ATTRIBUTE_RE.lastIndex = 0;
    for (
      let attribute = GROUNDING_ATTRIBUTE_RE.exec(block[1]);
      attribute;
      attribute = GROUNDING_ATTRIBUTE_RE.exec(block[1])
    ) {
      attributes[attribute[1]] = unescapeMarkerValue(attribute[2]);
    }
    const chunkId = attributes.chunk_id;
    if (!chunkId) continue;
    const page = attributes.page
      ? Number.parseInt(attributes.page, 10)
      : undefined;
    citations.push({
      sourceId: chunkId,
      sourceKind: "chunk",
      title: attributes.title || "Uploaded study material",
      excerpt: block[2],
      locator:
        page !== undefined && Number.isInteger(page)
          ? `p. ${page}`
          : "Retrieved passage",
      ...(attributes.file_id ? { fileId: attributes.file_id } : {}),
      ...(attributes.document_id
        ? { documentId: attributes.document_id }
        : {}),
      ...(page !== undefined && Number.isInteger(page) ? { page } : {}),
    });
  }
  return citations;
}

/** Serialize canonical passages for a text-valued agent context policy. */
export function serializeGroundedPassages(
  passages: readonly GroundedPassage[],
): string {
  if (passages.length === 0) return "";
  const blocks = passages.map((passage) => {
    const attributes = [
      `chunk_id="${markerValue(passage.chunkId)}"`,
      `title="${markerValue(passage.title)}"`,
      `source_kind="${markerValue(passage.sourceKind)}"`,
      `source_id="${markerValue(passage.sourceId)}"`,
      passage.documentId
        ? `document_id="${markerValue(passage.documentId)}"`
        : null,
      passage.fileId ? `file_id="${markerValue(passage.fileId)}"` : null,
      passage.page !== undefined ? `page="${passage.page}"` : null,
    ].filter((attribute): attribute is string => attribute !== null);
    return `[GROUNDING_PASSAGE ${attributes.join(" ")}]
${passage.text}
[/GROUNDING_PASSAGE]`;
  });
  return [
    "Retrieved from the learner's uploaded materials for this exact question.",
    "Use only supported passages; cite their chunk_id exactly in MATRX_TRUST_V1.",
    ...blocks,
  ].join("\n\n");
}
