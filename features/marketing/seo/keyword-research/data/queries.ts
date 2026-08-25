/**
 * Direct Supabase reads for the keyword plane (world-readable universal
 * tables: seo.keyword + seo.keyword_market + seo.keyword_edge). Reads go
 * DIRECT to Supabase — never through the Python server (CLAUDE.md data-flow
 * rule); the Python endpoints are only for the compute paths (agent research,
 * provider volume fetches).
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";

import type {
  KeywordEdgeRow,
  KeywordEdgeView,
  KeywordWithMarket,
} from "../types";
import type { KeywordResearchArtifact } from "@/types/python-generated/stream-events";
import { normalizeKeywordPhrase } from "@/features/marketing/seo/keyword/data";
import { parseKeywordResearchArtifact } from "./artifact";
import { isJsonObject } from "@/types/json";

/**
 * The `content_ir_kind_instance` source ids attached (via
 * `platform.associations`) to this site — MSR-26: a saved keyword-research
 * artifact belongs to the SITE it was researched for, never the
 * organization. Returns `[]` for a site with no bound research, never throws
 * on an empty result (an association read that finds nothing is not an
 * error).
 *
 * Calls `seo.fn_list_site_research_instance_ids` rather than the generic
 * `associationsService.listForTargets` — that RPC gates reads on
 * `iam.org_readable(edge.organization_id)` (plain ORG membership), which is
 * exactly the permissions-follow-the-org shape Arman's ruling rejected
 * ("permissions need to follow the site... automatically comes from the
 * parent"). This RPC gates on `seo.fn_is_site_editor`, the SAME site-based
 * authorization every other keyword-plane site read/write already uses.
 */
async function savedResearchInstanceIdsForSite(
  siteId: string,
): Promise<string[]> {
  const response = await (
    await seoDb()
  ).rpc("fn_list_site_research_instance_ids", { p_site_id: siteId });
  if (response.error) throw response.error;
  return (response.data ?? []) as string[];
}

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

async function contentIrDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("content_ir");
}

function cleanSearch(value: string): string {
  return value.trim().replace(/[(),"'\\%]/g, " ").trim();
}

/**
 * List keywords with their market rows, newest first, optionally filtered by
 * a phrase substring. Sorting by volume happens client-side (the market rows
 * are an embedded resource).
 */
export async function listKeywordsWithMarket(options: {
  search?: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<KeywordWithMarket[]> {
  const { search, limit = 200, signal } = options;
  let query = (await seoDb())
    .from("keyword")
    .select("*, keyword_market(*)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  const cleaned = search ? cleanSearch(search) : "";
  if (cleaned) {
    query = query.ilike("normalized_phrase", `%${cleaned.toLowerCase()}%`);
  }
  const response = await query.abortSignal(
    signal ?? new AbortController().signal,
  );
  if (response.error) throw response.error;
  return (response.data ?? []) as KeywordWithMarket[];
}

/** Resolve a bounded research cluster by exact normalized phrase. */
export async function listKeywordsWithMarketByPhrases(
  phrases: string[],
  signal?: AbortSignal,
): Promise<KeywordWithMarket[]> {
  const normalized = Array.from(
    new Set(phrases.map(normalizeKeywordPhrase).filter(Boolean)),
  );
  if (normalized.length === 0) return [];
  const response = await (await seoDb())
    .from("keyword")
    .select("*, keyword_market(*)")
    .in("normalized_phrase", normalized)
    .is("deleted_at", null)
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) throw response.error;
  return (response.data ?? []) as KeywordWithMarket[];
}

export interface SavedKeywordResearch {
  id: string;
  createdAt: string;
  title: string | null;
  artifact: KeywordResearchArtifact;
}

/** The active `keyword_relationship_research` kind definition id, or null. */
async function keywordResearchDefinitionId(
  db: Awaited<ReturnType<typeof contentIrDb>>,
): Promise<string | null> {
  const definition = await db
    .from("kind_definition")
    .select("id")
    .eq("kind", "keyword_relationship_research")
    .eq("is_active", true)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (definition.error) throw definition.error;
  return definition.data?.id ?? null;
}

/**
 * Every saved research artifact bound to a SITE (MSR-26 — research belongs
 * to the site, never the organization), newest first — the list behind the
 * workbench's saved-research library (each row is a shareable artifact with
 * its own report permalink). Sibling of `getLatestSavedKeywordResearch`,
 * which answers the per-phrase question. The binding lives in
 * `platform.associations` (`content_ir_kind_instance` -> `web_site`),
 * written by the research pipeline the moment the artifact is saved.
 */
export async function listSavedKeywordResearch(
  siteId: string,
  options?: { limit?: number; signal?: AbortSignal },
): Promise<SavedKeywordResearch[]> {
  const [db, instanceIds] = await Promise.all([
    contentIrDb(),
    savedResearchInstanceIdsForSite(siteId),
  ]);
  if (instanceIds.length === 0) return [];
  const definitionId = await keywordResearchDefinitionId(db);
  if (!definitionId) return [];
  const response = await db
    .from("kind_instance")
    .select("id, created_at, title, data")
    .in("id", instanceIds)
    .eq("kind_definition_id", definitionId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 50)
    .abortSignal(options?.signal ?? new AbortController().signal);
  if (response.error) throw response.error;
  return (response.data ?? []).flatMap((row) => {
    const artifact = parseKeywordResearchArtifact(row.data);
    if (!artifact) return [];
    return [
      {
        id: row.id,
        createdAt: row.created_at,
        title: row.title ?? null,
        artifact,
      } satisfies SavedKeywordResearch,
    ];
  });
}

/**
 * Latest durable relationship-research artifact for this SITE + keyword
 * (MSR-26). Reads the canonical internal `content_ir.kind_instance`, not a
 * paid compute endpoint or creator-private command ledger, so every
 * authorized site editor sees the same already-saved result.
 */
export async function getLatestSavedKeywordResearch(
  siteId: string,
  phrase: string,
  signal?: AbortSignal,
): Promise<SavedKeywordResearch | null> {
  const [db, instanceIds] = await Promise.all([
    contentIrDb(),
    savedResearchInstanceIdsForSite(siteId),
  ]);
  if (instanceIds.length === 0) return null;
  const definitionId = await keywordResearchDefinitionId(db);
  if (!definitionId) return null;

  const exact = await db
    .from("kind_instance")
    .select("id, created_at, title, data")
    .in("id", instanceIds)
    .eq("kind_definition_id", definitionId)
    .eq("data->>primary_keyword", phrase.trim())
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .abortSignal(signal ?? new AbortController().signal)
    .maybeSingle();
  if (exact.error) throw exact.error;
  const exactArtifact = parseKeywordResearchArtifact(exact.data?.data);
  if (exact.data && exactArtifact) {
    return {
      id: exact.data.id,
      createdAt: exact.data.created_at,
      title: exact.data.title ?? null,
      artifact: exactArtifact,
    };
  }

  // Case/whitespace-normalized fallback for keywords saved before the current
  // page phrase spelling was settled.
  const response = await db
    .from("kind_instance")
    .select("id, created_at, title, data")
    .in("id", instanceIds)
    .eq("kind_definition_id", definitionId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50)
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) throw response.error;
  const target = normalizeKeywordPhrase(phrase);
  for (const row of response.data ?? []) {
    const artifact = parseKeywordResearchArtifact(row.data);
    if (
      artifact &&
      normalizeKeywordPhrase(artifact.primary_keyword) === target
    ) {
      return {
        id: row.id,
        createdAt: row.created_at,
        title: row.title ?? null,
        artifact,
      };
    }
  }
  return null;
}

/**
 * Soft-archive library keywords (seo.fn_archive_keywords — the ONE sanctioned
 * client-side removal path; authenticated users have SELECT-only on the
 * table). Archive is durable memory: research re-runs do NOT resurrect an
 * archived keyword (the server upsert re-selects the archived identity row).
 * Returns the number of rows archived.
 */
export async function archiveKeywords(
  keywordIds: string[],
  reason?: string,
): Promise<number> {
  if (keywordIds.length === 0) return 0;
  const response = await (await seoDb()).rpc("fn_archive_keywords", {
    p_keyword_ids: keywordIds,
    ...(reason ? { p_reason: reason } : {}),
  });
  if (response.error) throw response.error;
  return response.data ?? 0;
}

/** Undo an archive (seo.fn_restore_keywords). Returns rows restored. */
export async function restoreKeywords(keywordIds: string[]): Promise<number> {
  if (keywordIds.length === 0) return 0;
  const response = await (await seoDb()).rpc("fn_restore_keywords", {
    p_keyword_ids: keywordIds,
  });
  if (response.error) throw response.error;
  return response.data ?? 0;
}

/**
 * Provenance: which of these keywords were discovered by the research
 * pipeline? Derived from live keyword_edge rows with origin 'ai_research'
 * (the ingest function writes every research edge with that origin) — no
 * schema change, one batched read per list render.
 */
export async function fetchResearchDiscoveredKeywordIds(
  keywordIds: string[],
  signal?: AbortSignal,
): Promise<Set<string>> {
  if (keywordIds.length === 0) return new Set();
  const db = await seoDb();
  const abortSignal = signal ?? new AbortController().signal;
  const [asSource, asTarget] = await Promise.all([
    db
      .from("keyword_edge")
      .select("source_keyword_id")
      .eq("origin", "ai_research")
      .is("deleted_at", null)
      .in("source_keyword_id", keywordIds)
      .abortSignal(abortSignal),
    db
      .from("keyword_edge")
      .select("target_keyword_id")
      .eq("origin", "ai_research")
      .is("deleted_at", null)
      .in("target_keyword_id", keywordIds)
      .abortSignal(abortSignal),
  ]);
  if (asSource.error) throw asSource.error;
  if (asTarget.error) throw asTarget.error;
  return new Set([
    ...(asSource.data ?? []).map((row) => row.source_keyword_id),
    ...(asTarget.data ?? []).map((row) => row.target_keyword_id),
  ]);
}

export interface KeywordDossierCompleteness {
  /** Pipeline tab — a saved research run exists with this keyword as the primary. */
  pipeline: boolean;
  /** Keywords tab — at least one live keyword_edge relationship. */
  relationships: boolean;
  /** Site performance tab — the keyword is tracked on at least one site (a prerequisite for that tab to show anything). */
  site: boolean;
  /** Search visibility tab — tracked as a rank target or has an observed SERP snapshot. */
  visibility: boolean;
}

const EMPTY_COMPLETENESS: KeywordDossierCompleteness = {
  pipeline: false,
  relationships: false,
  site: false,
  visibility: false,
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * MSR-15 (Arman): a keyword row opens a dossier with six tabs, "and some of
 * those tabs are completed, and some of them are not, yet our table doesn't
 * know that, but it should." This is the hint — four batched reads total
 * (never one per row) across the visible keyword set, answering "does this
 * tab have real data" per keyword:
 *   - Pipeline: `content_ir.kind_instance` (kind `keyword_relationship_research`)
 *     bound to this SITE (MSR-26 — `platform.associations`, not
 *     `organization_id`) whose `data->>primary_keyword` matches the phrase.
 *   - Keywords (relationships): `seo.keyword_edge`, either side.
 *   - Site performance: `seo.site_keyword_value`, any site (a keyword is
 *     tracked there before it has anything to show on the Site tab; the
 *     GSC-parity `seo.v_site_keyword_performance` VIEW is deliberately NOT
 *     used here — it has no site-agnostic fast path and a bare `.in()` over
 *     it hit the RLS-driven `57014` statement timeout the search-console
 *     FEATURE.md already documents for exactly this shape of read).
 *   - Search visibility: `seo.rank_target` (tracked) or `seo.serp_snapshot`
 *     (observed) for the keyword.
 * Classification is NOT read here — it lives on the keyword row itself
 * (`intent_class` etc.), already in hand wherever this is called from.
 */
export async function getKeywordDossierCompleteness(
  rows: { id: string; phrase: string }[],
  siteId: string | null,
  signal?: AbortSignal,
): Promise<Map<string, KeywordDossierCompleteness>> {
  const result = new Map<string, KeywordDossierCompleteness>();
  for (const row of rows) result.set(row.id, { ...EMPTY_COMPLETENESS });
  if (rows.length === 0) return result;

  const abortSignal = signal ?? new AbortController().signal;
  const ids = Array.from(new Set(rows.map((row) => row.id)));
  const CHUNK = 150;
  const seoDbInstance = await seoDb();

  const relationshipIds = new Set<string>();
  const siteIds = new Set<string>();
  const visibilityIds = new Set<string>();

  await Promise.all([
    ...chunk(ids, CHUNK).flatMap((idChunk) => [
      seoDbInstance
        .from("keyword_edge")
        .select("source_keyword_id")
        .is("deleted_at", null)
        .in("source_keyword_id", idChunk)
        .abortSignal(abortSignal)
        .then((response) => {
          if (response.error) throw response.error;
          for (const row of response.data ?? [])
            relationshipIds.add(row.source_keyword_id);
        }),
      seoDbInstance
        .from("keyword_edge")
        .select("target_keyword_id")
        .is("deleted_at", null)
        .in("target_keyword_id", idChunk)
        .abortSignal(abortSignal)
        .then((response) => {
          if (response.error) throw response.error;
          for (const row of response.data ?? [])
            relationshipIds.add(row.target_keyword_id);
        }),
      seoDbInstance
        .from("site_keyword_value")
        .select("keyword_id")
        .in("keyword_id", idChunk)
        .abortSignal(abortSignal)
        .then((response) => {
          if (response.error) throw response.error;
          for (const row of response.data ?? []) siteIds.add(row.keyword_id);
        }),
      seoDbInstance
        .from("rank_target")
        .select("keyword_id")
        .is("deleted_at", null)
        .in("keyword_id", idChunk)
        .abortSignal(abortSignal)
        .then((response) => {
          if (response.error) throw response.error;
          for (const row of response.data ?? []) visibilityIds.add(row.keyword_id);
        }),
      seoDbInstance
        .from("serp_snapshot")
        .select("keyword_id")
        .in("keyword_id", idChunk)
        .abortSignal(abortSignal)
        .then((response) => {
          if (response.error) throw response.error;
          for (const row of response.data ?? []) visibilityIds.add(row.keyword_id);
        }),
    ]),
  ]);

  const pipelinePhrases = new Set<string>();
  if (siteId) {
    const [contentDb, instanceIds] = await Promise.all([
      contentIrDb(),
      savedResearchInstanceIdsForSite(siteId),
    ]);
    const definitionId = instanceIds.length
      ? await keywordResearchDefinitionId(contentDb)
      : null;
    if (definitionId) {
      const wanted = new Set(
        rows.map((row) => row.phrase.trim()).filter(Boolean),
      );
      // One bounded read of the site's saved primary keywords — filtering by
      // membership client-side avoids PostgREST's `->>` operator on `.in()`,
      // which the generated Supabase types cannot express without exploding
      // into an unresolvable generic instantiation.
      const response = await contentDb
        .from("kind_instance")
        .select("data")
        .in("id", instanceIds)
        .eq("kind_definition_id", definitionId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500)
        .abortSignal(abortSignal);
      if (response.error) throw response.error;
      for (const row of response.data ?? []) {
        const artifact = parseKeywordResearchArtifact(row.data);
        const primary = artifact?.primary_keyword?.trim();
        if (primary && wanted.has(primary)) pipelinePhrases.add(primary);
      }
    }
  }

  for (const row of rows) {
    result.set(row.id, {
      pipeline: pipelinePhrases.has(row.phrase.trim()),
      relationships: relationshipIds.has(row.id),
      site: siteIds.has(row.id),
      visibility: visibilityIds.has(row.id),
    });
  }
  return result;
}

/** All edges touching a keyword, annotated with the partner phrase. */
export async function listKeywordEdges(
  keywordId: string,
  signal?: AbortSignal,
): Promise<KeywordEdgeView[]> {
  const db = await seoDb();
  const edgesResponse = await db
    .from("keyword_edge")
    .select("*")
    .or(`source_keyword_id.eq.${keywordId},target_keyword_id.eq.${keywordId}`)
    .is("deleted_at", null)
    .abortSignal(signal ?? new AbortController().signal);
  if (edgesResponse.error) throw edgesResponse.error;
  const edges = (edgesResponse.data ?? []) as KeywordEdgeRow[];
  if (edges.length === 0) return [];

  const partnerIds = Array.from(
    new Set(
      edges.map((edge) =>
        edge.source_keyword_id === keywordId
          ? edge.target_keyword_id
          : edge.source_keyword_id,
      ),
    ),
  );
  const partnersResponse = await db
    .from("keyword")
    .select("id, phrase")
    .in("id", partnerIds);
  if (partnersResponse.error) throw partnersResponse.error;
  const phraseById = new Map(
    (partnersResponse.data ?? []).map((row) => [row.id, row.phrase]),
  );

  return edges.map((edge) => {
    const outgoing = edge.source_keyword_id === keywordId;
    const partnerId = outgoing ? edge.target_keyword_id : edge.source_keyword_id;
    return {
      id: edge.id,
      edge_type: edge.edge_type,
      status: edge.status,
      origin: edge.origin,
      confidence: edge.confidence,
      direction: outgoing ? "outgoing" : "incoming",
      partner_keyword_id: partnerId,
      partner_phrase: phraseById.get(partnerId) ?? "(unknown keyword)",
    } satisfies KeywordEdgeView;
  });
}

// ── Copying keywords to a sibling site (MSR-26) ─────────────────────────────
// The site<->keyword association (`seo.site_keyword_value`) belongs to the
// site, same as its meaning — copying is additive and on demand, following
// the `seo.site_meaning_copy` precedent exactly (dry-run and the write are
// the identical server call with one flag, so a preview can never disagree
// with what pressing "Copy" actually does).

export interface KeywordCopyResult {
  dry_run: boolean;
  from: { id: string; label: string };
  to: { id: string; label: string };
  copied: number;
  skipped_existing: number;
}

function parseKeywordCopyResult(value: unknown): KeywordCopyResult {
  if (!isJsonObject(value) || !isJsonObject(value.from) || !isJsonObject(value.to)) {
    throw new Error("Keyword copy returned an invalid result.");
  }
  const { dry_run: dryRun, copied, skipped_existing: skippedExisting } = value;
  const fromId = value.from.id;
  const fromLabel = value.from.label;
  const toId = value.to.id;
  const toLabel = value.to.label;
  if (
    typeof dryRun !== "boolean" ||
    typeof copied !== "number" ||
    typeof skippedExisting !== "number" ||
    typeof fromId !== "string" ||
    typeof fromLabel !== "string" ||
    typeof toId !== "string" ||
    typeof toLabel !== "string"
  ) {
    throw new Error("Keyword copy returned an invalid result.");
  }
  return {
    dry_run: dryRun,
    from: { id: fromId, label: fromLabel },
    to: { id: toId, label: toLabel },
    copied,
    skipped_existing: skippedExisting,
  };
}

/**
 * `dryRun` walks the identical server path (`seo.site_keyword_value_copy`)
 * and rolls back, so the preview can never disagree with the write.
 * `keywordIds` omitted copies every keyword the source site tracks.
 */
export async function copySiteKeywords(input: {
  fromSiteId: string;
  toSiteId: string;
  keywordIds?: string[];
  dryRun: boolean;
}): Promise<KeywordCopyResult> {
  const response = await (await seoDb()).rpc("site_keyword_value_copy", {
    p_from_site: input.fromSiteId,
    p_to_site: input.toSiteId,
    p_keyword_ids: input.keywordIds,
    p_dry_run: input.dryRun,
  });
  if (response.error) throw response.error;
  return parseKeywordCopyResult(response.data);
}
