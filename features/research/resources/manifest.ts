/**
 * MANIFEST PARSING — the boundary between the RPC payload and typed resources.
 *
 * `public.research_topic_resource_manifest` returns one terse row per
 * selectable item plus two graphs (source⇄keyword ranks, source⇄tag edges).
 * This module turns that into `ResourceManifest`, and while doing so enriches
 * every source-derived item with the three axes the picker sorts by:
 *
 *   importance — search-position salience across ALL keywords a source ranks
 *                for, via the canonical `ranking.ts` (breadth beats a lone #1)
 *   authority  — the AI ranker's trustworthiness score, read straight through
 *   reachability — which keywords and tags an item can be reached from, so a
 *                selector can say "every page tagged Leadership"
 *
 * Those three are NOT interchangeable (see features/research/FEATURE.md —
 * authority ≠ importance), and nothing downstream re-derives them.
 *
 * Unknown kinds are collected, never dropped silently: a backend that starts
 * emitting a kind this client does not know about is a real drift signal.
 */

import { isJsonObject, type JsonObject } from "@/types/json";
import { summarizeImportance, type KeywordRank } from "../ranking";
import type {
  KindRollup,
  ManifestItemRaw,
  ManifestKeyword,
  ManifestTag,
  ManifestTopic,
  ResourceItem,
  ResourceKey,
  ResourceManifest,
} from "./types";

/** Every kind the RPC can emit. Kept in lockstep with the migration. */
const RPC_KINDS = new Set<string>([
  "search.result",
  "search.raw",
  "search.keyword_serp",
  "page.content",
  "page.analysis",
  "page.scoring",
  "page.links",
  "page.images",
  "synthesis.keyword",
  "synthesis.tag",
  "synthesis.topic",
  "document.report",
  "media.items",
]);

/** Kinds whose items belong to a source (so they inherit its ranking axes). */
const SOURCE_GRANULAR = new Set<string>([
  "search.result",
  "search.raw",
  "page.content",
  "page.analysis",
  "page.scoring",
  "page.links",
  "page.images",
  "media.items",
]);

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function bool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function asItemRaw(v: unknown): ManifestItemRaw | null {
  if (!isJsonObject(v)) return null;
  const kind = str(v.k);
  const id = str(v.id);
  if (!kind || !id) return null;
  return {
    k: kind,
    id,
    p: str(v.p),
    l: str(v.l),
    s: str(v.s),
    c: num(v.c) ?? 0,
    st: str(v.st),
    t: str(v.t),
    f: isJsonObject(v.f) ? v.f : {},
  };
}

function asKeyword(v: unknown): ManifestKeyword | null {
  if (!isJsonObject(v)) return null;
  const id = str(v.id);
  if (!id) return null;
  return {
    id,
    keyword: str(v.keyword) ?? "",
    position: num(v.position),
    searched_at: str(v.searched_at),
    stale: bool(v.stale),
    result_count: num(v.result_count),
  };
}

function asTag(v: unknown): ManifestTag | null {
  if (!isJsonObject(v)) return null;
  const id = str(v.id);
  if (!id) return null;
  return {
    id,
    name: str(v.name) ?? "",
    description: str(v.description),
    sort_order: num(v.sort_order),
  };
}

/** `[source_id, keyword_id, rank]` triples → per-source keyword ranks. */
function readEdges(
  raw: unknown,
  keywordName: Map<string, string>,
): Map<string, KeywordRank[]> {
  const out = new Map<string, KeywordRank[]>();
  if (!Array.isArray(raw)) return out;
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const sourceId = typeof row[0] === "string" ? row[0] : null;
    const keywordId = typeof row[1] === "string" ? row[1] : null;
    if (!sourceId || !keywordId) continue;
    const rank = typeof row[2] === "number" ? row[2] : null;
    const list = out.get(sourceId) ?? [];
    list.push({
      keyword_id: keywordId,
      keyword: keywordName.get(keywordId) ?? "",
      rank,
    });
    out.set(sourceId, list);
  }
  return out;
}

/** `[tag_id, source_id]` pairs → per-source tag ids. */
function readTagSources(raw: unknown): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!Array.isArray(raw)) return out;
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const tagId = typeof row[0] === "string" ? row[0] : null;
    const sourceId = typeof row[1] === "string" ? row[1] : null;
    if (!tagId || !sourceId) continue;
    const list = out.get(sourceId) ?? [];
    if (!list.includes(tagId)) list.push(tagId);
    out.set(sourceId, list);
  }
  return out;
}

/**
 * The source a raw item belongs to.
 *
 * `p` carries source_id for the page/media kinds. For `search.result` /
 * `search.raw` / `page.scoring` the item id IS the source id (the row is the
 * source), which is also how the URL — stored once, on `search.result` — is
 * found again for the other kinds.
 */
function sourceIdOf(raw: ManifestItemRaw): string | null {
  if (!SOURCE_GRANULAR.has(raw.k)) return null;
  if (raw.k === "search.result" || raw.k === "search.raw") return raw.id;
  return raw.p;
}

function keywordIdsOf(
  raw: ManifestItemRaw,
  sourceId: string | null,
  ranksBySource: Map<string, KeywordRank[]>,
): string[] {
  if (raw.k === "search.keyword_serp" || raw.k === "synthesis.keyword") {
    return raw.p ? [raw.p] : [];
  }
  if (!sourceId) return [];
  return (ranksBySource.get(sourceId) ?? []).map((r) => r.keyword_id);
}

function tagIdsOf(
  raw: ManifestItemRaw,
  sourceId: string | null,
  tagsBySource: Map<string, string[]>,
): string[] {
  if (raw.k === "synthesis.tag") return raw.p ? [raw.p] : [];
  if (!sourceId) return [];
  return tagsBySource.get(sourceId) ?? [];
}

function normalizeItem(
  raw: ManifestItemRaw,
  ranksBySource: Map<string, KeywordRank[]>,
  tagsBySource: Map<string, string[]>,
): ResourceItem {
  const sourceId = sourceIdOf(raw);
  const ranks = sourceId ? ranksBySource.get(sourceId) : undefined;
  const importance = ranks ? summarizeImportance(ranks) : null;
  const flags: JsonObject = raw.f;
  return {
    kind: raw.k as ResourceKey,
    id: raw.id,
    parentId: raw.p,
    label: raw.l ?? "Untitled",
    sublabel: raw.s,
    chars: raw.c,
    status: raw.st,
    createdAt: raw.t,
    flags,
    sourceId,
    importance: importance ? importance.score : null,
    bestRank: importance ? importance.bestRank : null,
    authority: num(flags.authority),
    keywordIds: keywordIdsOf(raw, sourceId, ranksBySource),
    tagIds: tagIdsOf(raw, sourceId, tagsBySource),
    // Absent `included` means the kind has no curation flag (keyword SERPs,
    // syntheses, documents) — those are never excluded by curation.
    included: bool(flags.included) ?? true,
  };
}

function asTopic(v: unknown, topicId: string): ManifestTopic {
  if (!isJsonObject(v)) {
    return {
      id: topicId,
      name: "",
      description: null,
      tone_profile: null,
      status: null,
      created_at: null,
    };
  }
  return {
    id: str(v.id) ?? topicId,
    name: str(v.name) ?? "",
    description: str(v.description),
    tone_profile: str(v.tone_profile),
    status: str(v.status),
    created_at: str(v.created_at),
  };
}

/**
 * Parse the RPC payload. Rollups come from the RPC's own `kinds` aggregate so
 * the totals a user sees are the database's numbers, not a client re-sum.
 */
export function parseManifest(raw: unknown, topicId: string): ResourceManifest {
  const root = isJsonObject(raw) ? raw : {};

  const keywords = Array.isArray(root.keywords)
    ? root.keywords.map(asKeyword).filter((k): k is ManifestKeyword => k !== null)
    : [];
  const tags = Array.isArray(root.tags)
    ? root.tags.map(asTag).filter((t): t is ManifestTag => t !== null)
    : [];

  const keywordName = new Map(keywords.map((k) => [k.id, k.keyword]));
  const ranksBySource = readEdges(root.edges, keywordName);
  const tagsBySource = readTagSources(root.tag_sources);

  const itemsByKind = new Map<ResourceKey, ResourceItem[]>();
  const unknown = new Set<string>();

  const rawItems = Array.isArray(root.items) ? root.items : [];
  for (const entry of rawItems) {
    const item = asItemRaw(entry);
    if (!item) continue;
    if (!RPC_KINDS.has(item.k)) {
      unknown.add(item.k);
      continue;
    }
    const normalized = normalizeItem(item, ranksBySource, tagsBySource);
    const list = itemsByKind.get(normalized.kind);
    if (list) list.push(normalized);
    else itemsByKind.set(normalized.kind, [normalized]);
  }

  const rollups = new Map<ResourceKey, KindRollup>();
  if (Array.isArray(root.kinds)) {
    for (const entry of root.kinds) {
      if (!isJsonObject(entry)) continue;
      const kind = str(entry.kind);
      if (!kind || !RPC_KINDS.has(kind)) {
        if (kind) unknown.add(kind);
        continue;
      }
      rollups.set(kind as ResourceKey, {
        kind: kind as ResourceKey,
        itemCount: num(entry.item_count) ?? 0,
        chars: num(entry.chars) ?? 0,
      });
    }
  }

  return {
    topicId,
    generatedAt: str(root.generated_at) ?? new Date().toISOString(),
    topic: asTopic(root.topic, topicId),
    keywords,
    tags,
    itemsByKind,
    rollups,
    unknownKinds: Array.from(unknown),
  };
}

/** Items of one kind, or an empty array. */
export function itemsOf(
  manifest: ResourceManifest,
  kind: ResourceKey,
): ResourceItem[] {
  return manifest.itemsByKind.get(kind) ?? [];
}
