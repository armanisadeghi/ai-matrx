/**
 * Condensed authoritativeness export.
 *
 * Strips fields that duplicate the URL (id, site, type), folds in Brave AI
 * snippets when present, and orders sources by Priority (pre-read score,
 * descending) — the same default as the Sources table. Ties fall through
 * quality → authority → search rank.
 */

import type { Json } from "@/types/database.types";
import type { CurationRow } from "../service";
import { compareSourcesForExport } from "../components/sources/sourceScoreDisplay";

export interface CondensedAuthoritySourceRecord {
  url: string;
  title: string | null;
  description: string | null;
  /** Page age from the search provider when available. */
  age?: string;
  /** Brave AI extra snippets when available. */
  snippets?: string[];
}

export interface CondensedAuthorityExport {
  topicId: string;
  topicName: string | null;
  generatedAt: string;
  instructions: string;
  returnSchema: Record<string, unknown>;
  sourceCount: number;
  sources: CondensedAuthoritySourceRecord[];
}

export interface CondensedAuthorityChunk extends CondensedAuthorityExport {
  chunkIndex: number;
  chunkCount: number;
  totalSourceCount: number;
}

const AGENT_INSTRUCTIONS =
  "Sources are ordered by Priority (pre-read score, highest first), then Quality, Auth, and search rank. Prefer higher-priority sources when they fit the task, but still judge relevance to the task itself.";

const RETURN_SCHEMA: Record<string, unknown> = {
  rankings: [
    {
      url: "<echo the source url exactly>",
      authority_score: "<integer 0-100, higher = more authoritative>",
      tier: "<one of: high | medium | low>",
      reasoning: "<one concise sentence>",
    },
  ],
};

export interface CondensedExportOptions {
  /** Max characters per snippet; 0 or omitted = no truncation. */
  snippetMaxChars?: number;
}

/** Per-snippet length presets for the Condensed export menu (`"0"` = off). */
export const CONDENSED_EXPORT_SNIPPET_LIMITS = [
  { value: "0", label: "Off" },
  { value: "250", label: "250" },
  { value: "500", label: "500" },
  { value: "1000", label: "1000" },
  { value: "2000", label: "2000" },
] as const;

/** Truncate one snippet; no-op when `maxChars` is 0 or text is already shorter. */
export function truncateSnippetText(text: string, maxChars: number): string {
  if (maxChars <= 0 || text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function applySnippetLengthLimit(
  snippets: string[],
  maxChars: number,
): string[] {
  if (maxChars <= 0) return snippets;
  return snippets.map((s) => truncateSnippetText(s, maxChars));
}

/** Priority-first ordering — matches Sources table default sort. */
export function sortRowsForExport(rows: CurationRow[]): CurationRow[] {
  return [...rows].sort((a, b) => compareSourcesForExport(a.source, b.source));
}

/** Normalize `extra_snippets` whether stored as strings or {text|snippet} objects. */
export function normalizeSearchSnippets(raw: Json | unknown): string[] {
  if (raw == null) return [];
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed ? [trimmed] : [];
  }
  if (!Array.isArray(raw)) return stringArrayFromJson(raw as Json);

  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (trimmed) out.push(trimmed);
      continue;
    }
    if (isRecord(item)) {
      const text = item.text ?? item.snippet;
      if (typeof text === "string") {
        const trimmed = text.trim();
        if (trimmed) out.push(trimmed);
      }
    }
  }
  return out;
}

function snippetsFromRow(row: CurationRow): string[] {
  const fromColumn = normalizeSearchSnippets(row.source.extra_snippets);
  if (fromColumn.length > 0) return fromColumn;
  if (!isRecord(row.source.raw_search_result)) return [];
  return normalizeSearchSnippets(row.source.raw_search_result.extra_snippets);
}

function ageFromRow(
  row: CurationRow,
  raw: Record<string, unknown> | null,
): string | undefined {
  const direct = row.source.page_age?.trim();
  if (direct) return direct;
  if (!raw) return undefined;
  const age = raw.age ?? raw.page_age;
  return typeof age === "string" && age.trim() ? age.trim() : undefined;
}

function toRecord(
  row: CurationRow,
  options?: CondensedExportOptions,
): CondensedAuthoritySourceRecord {
  const raw = isRecord(row.source.raw_search_result)
    ? row.source.raw_search_result
    : null;
  const age = ageFromRow(row, raw);
  const maxChars = options?.snippetMaxChars ?? 0;
  const snippets = applySnippetLengthLimit(snippetsFromRow(row), maxChars);

  const record: CondensedAuthoritySourceRecord = {
    url: row.source.url,
    title: row.source.title,
    description: row.source.description,
  };
  if (age) record.age = age;
  if (snippets.length > 0) record.snippets = snippets;
  return record;
}

export function buildCondensedAuthorityExport(
  topicId: string,
  topicName: string | null,
  rows: CurationRow[],
  options?: CondensedExportOptions,
): CondensedAuthorityExport {
  const seen = new Set<string>();
  const sources: CondensedAuthoritySourceRecord[] = [];
  for (const row of sortRowsForExport(rows)) {
    const url = row.source.url.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    sources.push(toRecord(row, options));
  }

  return {
    topicId,
    topicName,
    generatedAt: new Date().toISOString(),
    instructions: AGENT_INSTRUCTIONS,
    returnSchema: RETURN_SCHEMA,
    sourceCount: sources.length,
    sources,
  };
}

export function chunkCondensedAuthorityExport(
  payload: CondensedAuthorityExport,
  size: number,
): CondensedAuthorityChunk[] {
  const total = payload.sources.length;
  const effective = size > 0 ? size : total;
  const chunkCount = Math.max(1, Math.ceil(total / effective));

  const chunks: CondensedAuthorityChunk[] = [];
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

export function condensedAuthorityExportToJson(
  payload: CondensedAuthorityExport | CondensedAuthorityChunk,
): string {
  return JSON.stringify(payload, null, 2);
}

export function condensedAuthorityExportFilename(
  payload: CondensedAuthorityExport | CondensedAuthorityChunk,
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
  return `authority-ranking-condensed-${slug || "topic"}${part}-${date}.json`;
}
