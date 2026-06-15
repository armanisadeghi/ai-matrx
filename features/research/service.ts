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
  return data;
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
    return rows.slice(offset, offset + limit);
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
  return data ?? [];
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
  return data;
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
