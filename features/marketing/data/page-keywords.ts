/**
 * features/marketing/data/page-keywords.ts
 *
 * The keyword batch attached to a canonical page — thin typed wrappers over
 * the CANONICAL association chokepoint (`associationsService`), modeled on
 * `features/marketing/content-plan/data/associations.ts`.
 *
 * Model (registered pair `seo_keyword → web_page`, roles `primary` |
 * `supporting`, written both here and by the matrx-seo server artifact
 * writers — the page analyzer's edges appear in the same board):
 *   - the PRIMARY keyword remains `web.page.target_keyword` (the column) and
 *     is saved via updatePageIntent; a `primary`-role edge may also exist
 *     when the server writers add one — the board treats the column as truth.
 *   - the BATCH is `supporting`-role edges, one per library keyword.
 * A phrase not yet in the library is ensured through the ONE canonical
 * upsert `seo.fn_upsert_keyword` (SECURITY DEFINER, dedupes by normalized
 * phrase) — never a second insert path.
 */
import { associationsService } from "@/features/scopes/service/associationsService";
import type { AssociationEdge, ScopesRpcResult } from "@/features/scopes/types";
import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { SEO_KEYWORD_TOKEN } from "@/features/marketing/content-plan/types";
import type { KeywordWithMarket } from "@/features/marketing/seo/keyword-research/types";
import {
  normalizeKeywordPhrase,
  pickKeywordMarket,
} from "@/features/marketing/seo/keyword/data";
import { extractErrorMessage } from "@/utils/errors";

export const WEB_PAGE_TOKEN = "web_page";
export const PAGE_KEYWORD_SUPPORTING_ROLE = "supporting";
export const PAGE_KEYWORD_PRIMARY_ROLE = "primary";
export const pageKeywordsQueryKey = (pageId: string) =>
  ["marketing", "page-keywords", pageId] as const;

function unwrap<T>(result: ScopesRpcResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.message} (${result.error.code})`);
  }
  return result.data;
}

/** Every keyword edge pointing at the page (analyzer- and user-written). */
export async function listPageKeywordEdges(
  pageId: string,
): Promise<AssociationEdge[]> {
  const data = unwrap(
    await associationsService.listForEntity(WEB_PAGE_TOKEN, pageId),
  );
  return data.edges.filter(
    (edge) => edge.direction === "incoming" && edge.otherType === SEO_KEYWORD_TOKEN,
  );
}

/** Bulk-resolve library rows (+ freshest market data) for edge keyword ids. */
export async function fetchKeywordsByIds(
  ids: string[],
  signal?: AbortSignal,
): Promise<KeywordWithMarket[]> {
  if (ids.length === 0) return [];
  await requireAuthenticatedSupabaseSession(supabase);
  const response = await supabase
    .schema("seo")
    .from("keyword")
    .select("*, keyword_market(*)")
    .in("id", ids)
    .is("deleted_at", null)
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) throw response.error;
  return (response.data ?? []) as KeywordWithMarket[];
}

/**
 * Ensure a library row exists for a phrase → its id. Idempotent; reuses the
 * canonical server-side upsert (normalized-phrase dedupe lives THERE).
 */
export async function ensureKeywordId(phrase: string): Promise<string> {
  const trimmed = phrase.trim();
  if (!trimmed) throw new Error("Cannot attach an empty keyword phrase.");
  await requireAuthenticatedSupabaseSession(supabase);
  const response = await supabase
    .schema("seo")
    .rpc("fn_upsert_keyword", { p_phrase: trimmed, p_language: "en" });
  if (response.error) throw response.error;
  const row = response.data as {
    o_id?: string | null;
    o_created?: boolean | null;
  } | null;
  if (!row?.o_id) {
    throw new Error(`Keyword upsert returned no id for "${trimmed}".`);
  }
  if (!row.o_created) {
    // Explicit hand-entry resurrects an archived library row: archive is
    // durable against pipeline re-saves (fn_upsert_keyword returns the
    // archived identity row without reviving it), but a user typing the
    // phrase IS the intent to use it. fn_restore_keywords is idempotent —
    // it only touches rows whose deleted_at is set.
    const restore = await supabase
      .schema("seo")
      .rpc("fn_restore_keywords", { p_keyword_ids: [row.o_id] });
    if (restore.error) throw restore.error;
  }
  return row.o_id;
}

export async function addPageSupportingKeyword(
  pageId: string,
  keywordId: string,
  orgId?: string,
): Promise<void> {
  unwrap(
    await associationsService.add({
      sourceType: SEO_KEYWORD_TOKEN,
      sourceId: keywordId,
      targetType: WEB_PAGE_TOKEN,
      targetId: pageId,
      role: PAGE_KEYWORD_SUPPORTING_ROLE,
      ...(orgId ? { orgId } : {}),
    }),
  );
}

/** One keyword on the page's board — the cached shape under
 * `pageKeywordsQueryKey` (PageKeywordsCard renders it; the surface scope and
 * the `page_keywords` UI-state publisher read the same cache entry). */
export interface PageKeywordBoardEntry {
  keywordId: string;
  phrase: string;
  role: string;
  volume: number | null;
  competition: string | null;
}

/** The ONE queryFn for `pageKeywordsQueryKey(pageId)` — every subscriber uses
 * this so the cache holds a single, consistent shape. */
export async function fetchPageKeywordBoard(
  pageId: string,
): Promise<PageKeywordBoardEntry[]> {
  const edges = await listPageKeywordEdges(pageId);
  const rows = await fetchKeywordsByIds(edges.map((edge) => edge.otherId));
  const byId = new Map(rows.map((row) => [row.id, row]));
  return edges
    .map((edge): PageKeywordBoardEntry | null => {
      const row = byId.get(edge.otherId);
      if (!row) return null;
      const market = pickKeywordMarket(row.keyword_market);
      return {
        keywordId: row.id,
        phrase: row.phrase,
        role: edge.role ?? PAGE_KEYWORD_SUPPORTING_ROLE,
        volume: market?.search_volume ?? null,
        competition: market?.competition ?? null,
      };
    })
    .filter((entry): entry is PageKeywordBoardEntry => entry !== null);
}

export interface PageKeywordBatchAddResult {
  attached: string[];
  failed: { phrase: string; error: string }[];
}

/** Attach a deduplicated phrase batch through the same canonical keyword
 * upsert + association chokepoint used by single-entry UI. */
export async function addPageSupportingKeywords(
  pageId: string,
  phrases: string[],
  orgId?: string,
): Promise<PageKeywordBatchAddResult> {
  const unique = new Map<string, string>();
  for (const phrase of phrases) {
    const trimmed = phrase.trim();
    const normalized = normalizeKeywordPhrase(trimmed);
    if (normalized && !unique.has(normalized)) unique.set(normalized, trimmed);
  }
  const outcomes = await Promise.allSettled(
    [...unique.values()].map(async (phrase) => {
      const keywordId = await ensureKeywordId(phrase);
      await addPageSupportingKeyword(pageId, keywordId, orgId);
      return phrase;
    }),
  );
  const attached: string[] = [];
  const failed: PageKeywordBatchAddResult["failed"] = [];
  outcomes.forEach((outcome, index) => {
    const phrase = [...unique.values()][index];
    if (outcome.status === "fulfilled") {
      attached.push(outcome.value);
    } else {
      failed.push({ phrase, error: extractErrorMessage(outcome.reason) });
    }
  });
  return { attached, failed };
}

export async function removePageKeyword(
  pageId: string,
  keywordId: string,
  role: string,
): Promise<void> {
  unwrap(
    await associationsService.remove({
      sourceType: SEO_KEYWORD_TOKEN,
      sourceId: keywordId,
      targetType: WEB_PAGE_TOKEN,
      targetId: pageId,
      role,
    }),
  );
}
