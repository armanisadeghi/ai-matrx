import { supabase } from "@/utils/supabase/client";
import type { Database } from "@/types/database.types";
import type {
  ResearchTopic,
  ResearchProgress,
  ResearchKeyword,
  ResearchSource,
  ResearchContent,
  ResearchAnalysis,
  ResearchSynthesis,
  ResearchTag,
  SourceTag,
  ResearchDocument,
  ResearchMedia,
  ResearchTemplate,
  SourceFilters,
  TopicUpdate,
  TagCreate,
  TagUpdate,
  SourceUpdate,
  SourceBulkAction,
  SourceTagRequest,
  MediaUpdate,
} from "./types";
import {
  summarizeImportance,
  type KeywordRank,
  type SourceImportance,
} from "./ranking";

// ============================================================================
// Topic Overview (lightweight RPC for counts)
// ============================================================================

export async function getTopicOverview(
  topicId: string,
): Promise<ResearchProgress | null> {
  const { data, error } = await supabase.rpc("get_topic_overview", {
    p_topic_id: topicId,
  });
  if (error) throw error;
  return (data as unknown as ResearchProgress) ?? null;
}

// ============================================================================
// Topics
// ============================================================================

export async function getTopicsForProject(
  projectId: string,
): Promise<ResearchTopic[]> {
  const { data, error } = await supabase
    .from("rs_topic")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ResearchTopic[];
}

export async function getTopicsForProjects(
  projectIds: string[],
): Promise<ResearchTopic[]> {
  if (projectIds.length === 0) return [];
  const { data, error } = await supabase
    .from("rs_topic")
    .select("*")
    .in("project_id", projectIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ResearchTopic[];
}

/**
 * Fetch every topic the caller can read. RLS is the only filter — no
 * client-side narrowing. Used when no hierarchy filter is selected so that
 * "All" really means "All".
 */
export async function getAllTopics(): Promise<ResearchTopic[]> {
  const { data, error } = await supabase
    .from("rs_topic")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ResearchTopic[];
}

export async function getTopic(topicId: string): Promise<ResearchTopic | null> {
  const { data, error } = await supabase
    .from("rs_topic")
    .select("*")
    .eq("id", topicId)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as ResearchTopic;
}

export async function updateTopic(
  topicId: string,
  updates: TopicUpdate,
): Promise<ResearchTopic> {
  // Cast: TopicUpdate includes quota ladder fields (migration 0013) which
  // Supabase's generated `Update` type hasn't picked up yet. The columns
  // exist on the row; the cast is safe and only narrows back when types regen.
  const { data, error } = await supabase
    .from("rs_topic")
    .update(updates as Database["public"]["Tables"]["rs_topic"]["Update"])
    .eq("id", topicId)
    .select()
    .single();
  if (error) throw error;
  return data as ResearchTopic;
}

/**
 * Atomically append an asset into `rs_topic.outputs[kind].assets` (newest
 * first, de-duped by asset id) via a row-locked server-side RPC. Use this
 * instead of read-modify-writing the whole `outputs` column — a long-running
 * generator (podcast: 8–12 min) that persists with a stale client snapshot
 * would otherwise clobber assets generated during its wait. Returns the new
 * full `outputs` object.
 */
export async function appendTopicOutput(
  topicId: string,
  kind: string,
  asset: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc("rs_topic_append_output", {
    p_topic_id: topicId,
    p_kind: kind,
    p_asset:
      asset as Database["public"]["Tables"]["rs_topic"]["Row"]["outputs"],
  });
  if (error) throw error;
  return (data ?? {}) as Record<string, unknown>;
}

// ============================================================================
// Keywords
// ============================================================================

export async function getKeywords(topicId: string): Promise<ResearchKeyword[]> {
  // Order by user-controlled priority (position ASC). created_at is only a
  // tiebreaker for the rare case where two rows share a position transiently
  // (the unique constraint is DEFERRABLE, so this can happen mid-transaction
  // but never at SELECT time).
  const { data, error } = await supabase
    .from("rs_keyword")
    .select("*")
    .eq("topic_id", topicId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Atomically rewrite the priority order of every keyword in a topic. The
 * order of `keywordIds` becomes the new 1-indexed `position` for each row.
 * Server work (search/scrape/analysis) MUST honor this order — see
 * `rs_keyword.position` column comment.
 */
export async function reorderKeywords(
  topicId: string,
  keywordIds: string[],
): Promise<void> {
  if (keywordIds.length === 0) return;
  const { error } = await supabase.rpc("reorder_keywords", {
    p_topic_id: topicId,
    p_keyword_ids: keywordIds,
  });
  if (error) throw error;
}

export async function deleteKeyword(keywordId: string): Promise<void> {
  const { error } = await supabase
    .from("rs_keyword")
    .delete()
    .eq("id", keywordId);
  if (error) throw error;
}

export async function updateKeywordText(
  keywordId: string,
  keyword: string,
): Promise<void> {
  const trimmed = keyword.trim();
  if (!trimmed) throw new Error("Keyword cannot be empty");
  const { error } = await supabase
    .from("rs_keyword")
    .update({ keyword: trimmed })
    .eq("id", keywordId);
  if (error) throw error;
}

// ============================================================================
// Topic
// ============================================================================

export async function updateTopicMeta(
  topicId: string,
  patch: { name?: string | null; description?: string | null },
): Promise<void> {
  const update: { name?: string; description?: string | null } = {};
  if (patch.name !== undefined) {
    const trimmed = (patch.name ?? "").trim();
    if (!trimmed) throw new Error("Topic name cannot be empty");
    update.name = trimmed;
  }
  if (patch.description !== undefined) {
    const trimmed = (patch.description ?? "").trim();
    update.description = trimmed.length > 0 ? trimmed : null;
  }
  if (Object.keys(update).length === 0) return;
  const { error } = await supabase
    .from("rs_topic")
    .update(update)
    .eq("id", topicId);
  if (error) throw error;
}

// ============================================================================
// Sources
// ============================================================================

export async function getSource(
  sourceId: string,
): Promise<ResearchSource | null> {
  const { data, error } = await supabase
    .from("rs_source")
    .select("*")
    .eq("id", sourceId)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  // `page_analysis` is raw JSONB on the row but typed `PageAnalysis` on
  // `ResearchSource`; consumers narrow it via `pageAnalysisFromJson`. Cast
  // through `unknown` at this single boundary (mirrors the topic path).
  return data as unknown as ResearchSource;
}

export async function getSources(
  topicId: string,
  filters?: Partial<SourceFilters>,
): Promise<ResearchSource[]> {
  // When filtering by a single keyword, source order MUST be the search
  // engine rank for THAT keyword (e.g. Google position 1 vs 60). The same
  // source can appear under multiple keywords with different ranks, so
  // rs_source.rank is ambiguous and must not be used here. Instead, pull
  // ranks from rs_keyword_source.rank_for_keyword and order client-side.
  if (filters?.keyword_id) {
    const { data: links, error: linkErr } = await supabase
      .from("rs_keyword_source")
      .select("source_id, rank_for_keyword")
      .eq("keyword_id", filters.keyword_id)
      .order("rank_for_keyword", { ascending: true, nullsFirst: false });
    if (linkErr) throw linkErr;
    const orderedIds: string[] = [];
    const rankBySourceId = new Map<string, number | null>();
    for (const r of links ?? []) {
      if (!rankBySourceId.has(r.source_id)) {
        orderedIds.push(r.source_id);
        rankBySourceId.set(r.source_id, r.rank_for_keyword);
      }
    }
    if (orderedIds.length === 0) return [];

    let query = supabase
      .from("rs_source")
      .select("*")
      .eq("topic_id", topicId)
      .in("id", orderedIds);

    if (filters?.scrape_status)
      query = query.eq("scrape_status", filters.scrape_status);
    if (filters?.source_type)
      query = query.eq("source_type", filters.source_type);
    if (filters?.hostname) query = query.eq("hostname", filters.hostname);
    if (filters?.is_included !== undefined)
      query = query.eq("is_included", filters.is_included);
    if (filters?.origin) query = query.eq("origin", filters.origin);

    const { data, error } = await query;
    if (error) throw error;

    // If the caller supplied an explicit sort, honor it; otherwise restore
    // the per-keyword search rank order by reordering by `orderedIds`.
    let rows = data ?? [];
    if (filters?.sort_by) {
      const dir = filters.sort_dir === "desc" ? -1 : 1;
      const key = filters.sort_by as keyof ResearchSource;
      rows = [...rows].sort((a, b) => {
        const av = a[key];
        const bv = b[key];
        if (av === bv) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return av < bv ? -1 * dir : 1 * dir;
      });
    } else {
      const idIndex = new Map(orderedIds.map((id, i) => [id, i]));
      rows = [...rows].sort(
        (a, b) =>
          (idIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (idIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER),
      );
    }

    const offset = filters?.offset ?? 0;
    const limit = filters?.limit ?? 50;
    // `page_analysis` raw JSONB → `PageAnalysis` on `ResearchSource`; narrowed
    // by consumers via `pageAnalysisFromJson`. Cast through `unknown` here.
    return rows.slice(offset, offset + limit) as unknown as ResearchSource[];
  }

  // Topic-wide source list: no keyword filter, so use the global search
  // rank as a coarse default. Server still owes us a "best rank across all
  // keywords" if we want true cross-keyword priority — see server-team spec.
  let query = supabase.from("rs_source").select("*").eq("topic_id", topicId);

  if (filters?.scrape_status)
    query = query.eq("scrape_status", filters.scrape_status);
  if (filters?.source_type)
    query = query.eq("source_type", filters.source_type);
  if (filters?.hostname) query = query.eq("hostname", filters.hostname);
  if (filters?.is_included !== undefined)
    query = query.eq("is_included", filters.is_included);
  if (filters?.origin) query = query.eq("origin", filters.origin);

  if (filters?.sort_by) {
    query = query
      .order(filters.sort_by, {
        ascending: filters.sort_dir !== "desc",
        nullsFirst: false,
      })
      .order("rank", { ascending: true, nullsFirst: false });
  } else {
    query = query
      .order("rank", { ascending: true, nullsFirst: false })
      .order("discovered_at", { ascending: false });
  }
  query = query.range(
    filters?.offset ?? 0,
    (filters?.offset ?? 0) + (filters?.limit ?? 50) - 1,
  );

  const { data, error } = await query;
  if (error) throw error;
  // See note above: cast the raw rows (JSONB `page_analysis`) to ResearchSource.
  return (data ?? []) as unknown as ResearchSource[];
}

export async function updateSource(
  sourceId: string,
  updates: SourceUpdate,
): Promise<ResearchSource> {
  const { data, error } = await supabase
    .from("rs_source")
    .update(updates)
    .eq("id", sourceId)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as ResearchSource;
}

export async function bulkUpdateSources(
  topicId: string,
  action: SourceBulkAction,
): Promise<void> {
  const sourceIds = action.source_ids;
  const updates: Record<string, unknown> = {};

  if (action.action === "include") updates.is_included = true;
  else if (action.action === "exclude") updates.is_included = false;
  else if (action.action === "mark_stale") updates.is_stale = true;
  else if (action.action === "mark_complete")
    updates.scrape_status = "complete";

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from("rs_source")
      .update(updates)
      .eq("topic_id", topicId)
      .in("id", sourceIds);
    if (error) throw error;
  }
}

// ============================================================================
// Content
// ============================================================================

export async function getSourceContent(
  sourceId: string,
): Promise<ResearchContent[]> {
  const { data, error } = await supabase
    .from("rs_content")
    .select("*")
    .eq("source_id", sourceId)
    .order("version", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ============================================================================
// Analysis
// ============================================================================

export async function getSourceAnalysis(
  contentId: string,
): Promise<ResearchAnalysis[]> {
  const { data, error } = await supabase
    .from("rs_analysis")
    .select("*")
    .eq("content_id", contentId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getAnalysisForSource(
  sourceId: string,
): Promise<ResearchAnalysis[]> {
  const { data, error } = await supabase
    .from("rs_analysis")
    .select("*")
    .eq("source_id", sourceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getAnalysesForTopic(
  topicId: string,
): Promise<ResearchAnalysis[]> {
  const { data, error } = await supabase
    .from("rs_analysis")
    .select("*")
    .eq("topic_id", topicId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ============================================================================
// Synthesis
// ============================================================================

export async function getSynthesis(
  topicId: string,
  params?: { scope?: string; keyword_id?: string },
): Promise<ResearchSynthesis[]> {
  let query = supabase
    .from("rs_synthesis")
    .select("*")
    .eq("topic_id", topicId)
    .eq("is_current", true);

  if (params?.scope) query = query.eq("scope", params.scope);
  if (params?.keyword_id) query = query.eq("keyword_id", params.keyword_id);

  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ============================================================================
// Tags
// ============================================================================

export async function getTags(topicId: string): Promise<ResearchTag[]> {
  const { data, error } = await supabase
    .from("rs_tag")
    .select("*")
    .eq("topic_id", topicId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * All source⇄tag assignments for a topic in one query, keyed by source_id.
 * Lets the Sources list show each source's tag chips + a per-row picker without
 * firing one `getSourceTags` per row. Mirrors `getCurationData`'s tag join, but
 * standalone so the list doesn't pay for the heavier curation aggregate.
 */
export async function getTopicSourceTags(
  topicId: string,
): Promise<Record<string, { id: string; name: string }[]>> {
  const { data: tagRows, error: tagErr } = await supabase
    .from("rs_tag")
    .select("id, name")
    .eq("topic_id", topicId);
  if (tagErr) throw tagErr;
  const tags = (tagRows ?? []) as { id: string; name: string }[];
  if (tags.length === 0) return {};
  const tagName = new Map(tags.map((t) => [t.id, t.name]));

  const { data: stRows, error: stErr } = await supabase
    .from("rs_source_tag")
    .select("source_id, tag_id")
    .in(
      "tag_id",
      tags.map((t) => t.id),
    );
  if (stErr) throw stErr;

  const out: Record<string, { id: string; name: string }[]> = {};
  for (const st of stRows ?? []) {
    (out[st.source_id] ??= []).push({
      id: st.tag_id,
      name: tagName.get(st.tag_id) ?? "Tag",
    });
  }
  return out;
}

export async function createTag(
  topicId: string,
  tag: TagCreate,
): Promise<ResearchTag> {
  const { data, error } = await supabase
    .from("rs_tag")
    .insert({ ...tag, topic_id: topicId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTag(
  tagId: string,
  updates: TagUpdate,
): Promise<ResearchTag> {
  const { data, error } = await supabase
    .from("rs_tag")
    .update(updates)
    .eq("id", tagId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTag(tagId: string): Promise<void> {
  const { error } = await supabase.from("rs_tag").delete().eq("id", tagId);
  if (error) throw error;
}

export async function assignTagsToSource(
  sourceId: string,
  body: SourceTagRequest,
): Promise<SourceTag[]> {
  const rows = body.tag_ids.map((tagId) => ({
    source_id: sourceId,
    tag_id: tagId,
    assigned_by: "manual" as const,
  }));
  const { data, error } = await supabase
    .from("rs_source_tag")
    .upsert(rows, { onConflict: "source_id,tag_id" })
    .select();
  if (error) throw error;
  return data ?? [];
}

/** Current tag assignments for a source (so a picker can show what's on). */
export async function getSourceTags(sourceId: string): Promise<SourceTag[]> {
  const { data, error } = await supabase
    .from("rs_source_tag")
    .select("*")
    .eq("source_id", sourceId);
  if (error) throw error;
  return data ?? [];
}

/** Remove one tag assignment from a source (the un-toggle side of assignment). */
export async function removeSourceTag(
  sourceId: string,
  tagId: string,
): Promise<void> {
  const { error } = await supabase
    .from("rs_source_tag")
    .delete()
    .eq("source_id", sourceId)
    .eq("tag_id", tagId);
  if (error) throw error;
}

/** Assign one tag to many sources at once (batch tagging in the curation table). */
export async function addTagToSources(
  tagId: string,
  sourceIds: string[],
): Promise<void> {
  if (sourceIds.length === 0) return;
  const rows = sourceIds.map((source_id) => ({
    source_id,
    tag_id: tagId,
    assigned_by: "manual" as const,
  }));
  const { error } = await supabase
    .from("rs_source_tag")
    .upsert(rows, { onConflict: "source_id,tag_id" });
  if (error) throw error;
}

/**
 * Per-source importance for a topic, keyed by source_id. Both the total score
 * and the per-keyword ranks come from `rs_keyword_source.rank_for_keyword` (the
 * real per-keyword search rank — `rs_source.rank` is ambiguous and unused).
 * Computed client-side via the shared `summarizeImportance`.
 */
export async function getSourceImportance(
  topicId: string,
): Promise<Map<string, SourceImportance>> {
  const { data: kws, error: kwErr } = await supabase
    .from("rs_keyword")
    .select("id, keyword")
    .eq("topic_id", topicId);
  if (kwErr) throw kwErr;
  const kwText = new Map<string, string>(
    (kws ?? []).map((k) => [k.id, k.keyword]),
  );
  if (kwText.size === 0) return new Map();

  const { data: links, error: linkErr } = await supabase
    .from("rs_keyword_source")
    .select("source_id, keyword_id, rank_for_keyword")
    .in("keyword_id", Array.from(kwText.keys()));
  if (linkErr) throw linkErr;

  const bySource = new Map<string, KeywordRank[]>();
  for (const l of links ?? []) {
    const arr = bySource.get(l.source_id) ?? [];
    arr.push({
      keyword_id: l.keyword_id,
      keyword: kwText.get(l.keyword_id) ?? "Keyword",
      rank: l.rank_for_keyword,
    });
    bySource.set(l.source_id, arr);
  }

  const out = new Map<string, SourceImportance>();
  for (const [sid, perKw] of bySource) {
    out.set(sid, summarizeImportance(perKw));
  }
  return out;
}

// ============================================================================
// Curation workbench — one aggregate the power table consumes
// ============================================================================

export type CurationAnalysisState = "content" | "empty" | "failed" | "none";

export interface CurationRow {
  source: ResearchSource;
  /** Cross-keyword importance + per-keyword ranks (null if it ranks for none). */
  importance: SourceImportance | null;
  /** Scraped content size (chars) for the current content version. */
  charCount: number | null;
  /** Analysis outcome for this source (best of any analyses it has). */
  analysis: CurationAnalysisState;
  /** Tags assigned to this source. */
  tags: { id: string; name: string }[];
}

export interface CurationData {
  rows: CurationRow[];
  keywords: { id: string; keyword: string }[];
  tags: { id: string; name: string }[];
}

const ANALYSIS_RANK: Record<Exclude<CurationAnalysisState, "none">, number> = {
  content: 3,
  empty: 2,
  failed: 1,
};

/**
 * Everything the curation table needs for a topic, joined into one shape:
 * each source with its importance + per-keyword ranks, scraped content size,
 * analysis outcome, and tags — plus the keyword/tag lists for filter/group.
 * Reuses the canonical `summarizeImportance`; the raw selects are simple.
 */
export async function getCurationData(topicId: string): Promise<CurationData> {
  const { data: kwRows, error: kwErr } = await supabase
    .from("rs_keyword")
    .select("id, keyword")
    .eq("topic_id", topicId);
  if (kwErr) throw kwErr;
  const keywords = (kwRows ?? []) as { id: string; keyword: string }[];
  const kwText = new Map(keywords.map((k) => [k.id, k.keyword]));

  const { data: srcRows, error: srcErr } = await supabase
    .from("rs_source")
    .select("*")
    .eq("topic_id", topicId);
  if (srcErr) throw srcErr;
  // Raw rows carry JSONB `page_analysis`; ResearchSource types it as
  // PageAnalysis (narrowed by consumers). Cast through `unknown` at the boundary.
  const sources = (srcRows ?? []) as unknown as ResearchSource[];

  // Tags + source⇄tag links
  const { data: tagRows } = await supabase
    .from("rs_tag")
    .select("id, name")
    .eq("topic_id", topicId);
  const tags = (tagRows ?? []) as { id: string; name: string }[];
  const tagName = new Map(tags.map((t) => [t.id, t.name]));
  const tagsBySource = new Map<string, { id: string; name: string }[]>();
  if (tags.length > 0) {
    const { data: stRows } = await supabase
      .from("rs_source_tag")
      .select("source_id, tag_id")
      .in(
        "tag_id",
        tags.map((t) => t.id),
      );
    for (const st of stRows ?? []) {
      const arr = tagsBySource.get(st.source_id) ?? [];
      arr.push({ id: st.tag_id, name: tagName.get(st.tag_id) ?? "Tag" });
      tagsBySource.set(st.source_id, arr);
    }
  }

  // Importance from per-keyword ranks
  const importanceBySource = new Map<string, SourceImportance>();
  if (keywords.length > 0) {
    const { data: links } = await supabase
      .from("rs_keyword_source")
      .select("source_id, keyword_id, rank_for_keyword")
      .in(
        "keyword_id",
        keywords.map((k) => k.id),
      );
    const perSource = new Map<string, KeywordRank[]>();
    for (const l of links ?? []) {
      const arr = perSource.get(l.source_id) ?? [];
      arr.push({
        keyword_id: l.keyword_id,
        keyword: kwText.get(l.keyword_id) ?? "Keyword",
        rank: l.rank_for_keyword,
      });
      perSource.set(l.source_id, arr);
    }
    for (const [sid, pk] of perSource) {
      importanceBySource.set(sid, summarizeImportance(pk));
    }
  }

  // Content size (current version)
  const charBySource = new Map<string, number>();
  const { data: contentRows } = await supabase
    .from("rs_content")
    .select("source_id, char_count, is_current")
    .eq("topic_id", topicId);
  for (const c of contentRows ?? []) {
    if (c.is_current !== true || c.char_count == null) continue;
    charBySource.set(
      c.source_id,
      Math.max(charBySource.get(c.source_id) ?? 0, c.char_count),
    );
  }

  // Analysis outcome (best across a source's analyses)
  const analysisBySource = new Map<string, CurationAnalysisState>();
  const { data: anRows } = await supabase
    .from("rs_analysis")
    .select("source_id, status, result")
    .eq("topic_id", topicId);
  for (const a of anRows ?? []) {
    const state: CurationAnalysisState =
      a.status === "failed"
        ? "failed"
        : a.result && a.result.trim().length > 0
          ? "content"
          : "empty";
    const cur = analysisBySource.get(a.source_id);
    if (
      !cur ||
      cur === "none" ||
      ANALYSIS_RANK[state] >
        ANALYSIS_RANK[cur as Exclude<CurationAnalysisState, "none">]
    ) {
      analysisBySource.set(a.source_id, state);
    }
  }

  const rows: CurationRow[] = sources.map((s) => ({
    source: s,
    importance: importanceBySource.get(s.id) ?? null,
    charCount: charBySource.get(s.id) ?? null,
    analysis: analysisBySource.get(s.id) ?? "none",
    tags: tagsBySource.get(s.id) ?? [],
  }));

  return { rows, keywords, tags };
}

/**
 * Save user-curated content (the trimmed/edited text the model will analyze),
 * backing up the original scrape ONCE on the first edit so it stays
 * recoverable. Reads go straight to Supabase, so there is no FE cache to bust.
 */
export async function updateContentCurated(
  content: ResearchContent,
  newText: string,
): Promise<void> {
  const updates: Record<string, unknown> = {
    content: newText,
    char_count: newText.length,
  };
  if (!content.original_content && content.content) {
    // First edit of real content — preserve the pre-edit scrape. (Nothing to
    // back up if the scrape was empty/null.)
    updates.original_content = content.content;
  }
  const { error } = await supabase
    .from("rs_content")
    .update(updates)
    .eq("id", content.id);
  if (error) throw error;
}

/** Restore the backed-up original scrape (undo curation). */
export async function restoreOriginalContent(
  content: ResearchContent,
): Promise<void> {
  if (!content.original_content) return;
  const { error } = await supabase
    .from("rs_content")
    .update({
      content: content.original_content,
      char_count: content.original_content.length,
    })
    .eq("id", content.id);
  if (error) throw error;
}

// ============================================================================
// Documents
// ============================================================================

export async function getDocument(
  topicId: string,
): Promise<ResearchDocument | null> {
  const { data, error } = await supabase
    .from("rs_document")
    .select("*")
    .eq("topic_id", topicId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getDocumentVersions(
  topicId: string,
): Promise<ResearchDocument[]> {
  const { data, error } = await supabase
    .from("rs_document")
    .select("*")
    .eq("topic_id", topicId)
    .order("version", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ============================================================================
// Media
// ============================================================================

export async function getMedia(topicId: string): Promise<ResearchMedia[]> {
  const { data, error } = await supabase
    .from("rs_media")
    .select("*")
    .eq("topic_id", topicId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function updateMedia(
  mediaId: string,
  updates: MediaUpdate,
): Promise<ResearchMedia> {
  const { data, error } = await supabase
    .from("rs_media")
    .update(updates)
    .eq("id", mediaId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ============================================================================
// Templates
// ============================================================================

export async function getTemplates(): Promise<ResearchTemplate[]> {
  const { data, error } = await supabase
    .from("rs_template")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getTemplate(
  templateId: string,
): Promise<ResearchTemplate | null> {
  const { data, error } = await supabase
    .from("rs_template")
    .select("*")
    .eq("id", templateId)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data;
}
