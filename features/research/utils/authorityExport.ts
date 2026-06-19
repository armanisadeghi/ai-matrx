/**
 * Authoritativeness ranking export.
 *
 * Builds a compact, token-efficient payload describing every source in a topic
 * so an AI agent can rank how authoritative each page/site is. The whole point
 * is a round-trip: the model receives a stable `id` per source and returns a
 * score keyed by that same `id`, so the result can be re-imported and applied.
 *
 * Authoritativeness is mostly a property of the DOMAIN (a .gov/.edu/established
 * publisher vs a personal blog or forum) and secondarily the page. The fields
 * below are the strongest authority signals that stay cheap to ship for many
 * pages — we deliberately exclude scraped body content, raw search blobs, and
 * thumbnails.
 */

import type { CurationRow } from "../service";
import { sourceTypeFromDb } from "../types";

/**
 * One source, reduced to the fields a model needs to judge authority.
 *
 * We deliberately EXCLUDE search rankings, keyword hit counts, discovery
 * origin, page age, and tags: those either bias the judge (a high search rank
 * pre-decides the answer) or are mostly empty noise that only bloats context.
 * Authority is judged from the domain + what the page says it is.
 */
export interface AuthoritySourceRecord {
  /** Stable unique id — the model MUST echo this back for re-import. */
  id: string;
  url: string;
  /** Hostname/domain — the single biggest authority signal. */
  site: string | null;
  title: string | null;
  description: string | null;
  /** article | pdf | forum | video | … */
  type: string;
}

export interface AuthorityExport {
  topicId: string;
  topicName: string | null;
  generatedAt: string;
  /** Plain-language task the receiving agent should perform. */
  instructions: string;
  /** Exact JSON shape the agent must return so results re-import cleanly. */
  returnSchema: Record<string, unknown>;
  sourceCount: number;
  sources: AuthoritySourceRecord[];
}

/**
 * One batch of sources to hand to a single model call. Models get unreliable
 * past ~50 items at once (dropped/duplicated ids near the tail), so a large
 * topic is split into chunks the user processes one call at a time. Each chunk
 * is self-contained: same instructions + return schema, just a slice of the
 * sources plus 1-indexed batch coordinates.
 */
export interface AuthorityChunk extends AuthorityExport {
  /** 1-indexed batch number. */
  chunkIndex: number;
  /** Total number of batches for the full topic. */
  chunkCount: number;
  /** Total sources across all batches (sourceCount is this chunk's size). */
  totalSourceCount: number;
}

const RANKING_INSTRUCTIONS =
  "Rank the authoritativeness of each source below. Authoritativeness = how " +
  "trustworthy, credible, and expert the page and its hosting site are for " +
  "research — weigh the domain heavily (government, academic, standards " +
  "bodies, and established publishers rank high; personal blogs, forums, " +
  "content farms, and SEO spam rank low), then the page itself (depth, " +
  "primary vs secondary source). Judge each source independently on its own " +
  "merits. Return a score for EVERY source, keyed by its exact `id`.";

/** The return contract handed to the model alongside the data. */
const RETURN_SCHEMA: Record<string, unknown> = {
  rankings: [
    {
      id: "<echo the source id exactly>",
      authority_score: "<integer 0-100, higher = more authoritative>",
      tier: "<one of: high | medium | low>",
      reasoning: "<one concise sentence>",
    },
  ],
};

/** Reduce a curation row to its authority-relevant fields. */
function toRecord(row: CurationRow): AuthoritySourceRecord {
  const s = row.source;
  return {
    id: s.id,
    url: s.url,
    site: s.hostname,
    title: s.title,
    description: s.description,
    type: sourceTypeFromDb(s.source_type),
  };
}

/**
 * Build the full authority-ranking export from a topic's curation rows.
 * `rows` should be the WHOLE topic, not just the current page of the list.
 */
export function buildAuthorityExport(
  topicId: string,
  topicName: string | null,
  rows: CurationRow[],
): AuthorityExport {
  const sources = rows.map(toRecord);
  return {
    topicId,
    topicName,
    generatedAt: new Date().toISOString(),
    instructions: RANKING_INSTRUCTIONS,
    returnSchema: RETURN_SCHEMA,
    sourceCount: sources.length,
    sources,
  };
}

/**
 * Split a full export into batches of at most `size` sources. A non-positive
 * size (or one >= the source count) yields a single chunk containing everything.
 * Every chunk shares the parent's instructions/return schema and carries its own
 * batch coordinates so the model knows it's scoring "part X of N".
 */
export function chunkAuthorityExport(
  payload: AuthorityExport,
  size: number,
): AuthorityChunk[] {
  const total = payload.sources.length;
  const effective = size > 0 ? size : total;
  const chunkCount = Math.max(1, Math.ceil(total / effective));

  const chunks: AuthorityChunk[] = [];
  for (let i = 0; i < chunkCount; i++) {
    const slice = payload.sources.slice(i * effective, (i + 1) * effective);
    chunks.push({
      ...payload,
      sources: slice,
      sourceCount: slice.length,
      chunkIndex: i + 1,
      chunkCount,
      totalSourceCount: total,
    });
  }
  return chunks;
}

/** Pretty JSON string for copy / download. */
export function authorityExportToJson(
  payload: AuthorityExport | AuthorityChunk,
): string {
  return JSON.stringify(payload, null, 2);
}

/**
 * Suggested download filename. For a chunk, embeds `part-2-of-5` so the set
 * stays ordered and unambiguous on disk.
 */
export function authorityExportFilename(
  payload: AuthorityExport | AuthorityChunk,
): string {
  const slug = (payload.topicName ?? payload.topicId)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const date = payload.generatedAt.slice(0, 10);
  const part =
    "chunkIndex" in payload && payload.chunkCount > 1
      ? `-part-${payload.chunkIndex}-of-${payload.chunkCount}`
      : "";
  return `authority-ranking-${slug || "topic"}${part}-${date}.json`;
}
