/**
 * The ONE watch/unwatch chokepoint for Search Console entities — thin
 * composition over the canonical per-user entity-state primitive
 * (`platform.user_entity_state` via `favoritesService`; war-room precedent:
 * call the service directly, never the 50-cap sidebar `PinButton` path).
 *
 * Watch = `is_favorite` on entity tokens `web_page` / `seo_keyword`.
 * A GSC query row may have no `keyword_id` yet (facts predate the keyword) —
 * `watchQueryRow` bridges through `seo.fn_upsert_keyword` (SECURITY DEFINER
 * find-or-create by normalized phrase) and favorites the resulting keyword.
 */

import { ensureKeywordId } from "@/features/marketing/seo/keyword/data";
import { favoritesService } from "@/features/scopes/service/favoritesService";
import { isScopesRpcErr } from "@/features/scopes/types";

export const WATCH_PAGE_TOKEN = "web_page";
export const WATCH_QUERY_TOKEN = "seo_keyword";

export interface WatchedIds {
  pageIds: string[];
  keywordIds: string[];
}

export async function watchPage(pageId: string): Promise<void> {
  const result = await favoritesService.setFavorite(
    WATCH_PAGE_TOKEN,
    pageId,
    true,
  );
  if (isScopesRpcErr(result)) throw new Error(result.error.message);
}

export async function unwatchPage(pageId: string): Promise<void> {
  const result = await favoritesService.setFavorite(
    WATCH_PAGE_TOKEN,
    pageId,
    false,
  );
  if (isScopesRpcErr(result)) throw new Error(result.error.message);
}

export async function watchKeyword(keywordId: string): Promise<void> {
  const result = await favoritesService.setFavorite(
    WATCH_QUERY_TOKEN,
    keywordId,
    true,
  );
  if (isScopesRpcErr(result)) throw new Error(result.error.message);
}

export async function unwatchKeyword(keywordId: string): Promise<void> {
  const result = await favoritesService.setFavorite(
    WATCH_QUERY_TOKEN,
    keywordId,
    false,
  );
  if (isScopesRpcErr(result)) throw new Error(result.error.message);
}

/**
 * Watch a query row: use its keyword link when present, else mint one via
 * the canonical keyword-library upsert (`ensureKeywordId` in
 * `features/marketing/data/page-keywords.ts` — handles normalized-phrase
 * dedupe AND restores an archived row, since a user watching the phrase IS
 * intent to use it). Returns the watched keyword id (callers cache it so
 * the row's watch state paints immediately).
 */
export async function watchQueryRow(row: {
  key: string;
  keyword_id: string | null;
}): Promise<string> {
  const keywordId = row.keyword_id ?? (await ensureKeywordId(row.key));
  await watchKeyword(keywordId);
  return keywordId;
}

/** Every watched page/keyword id for the caller (both tokens, one read). */
export async function listWatchedIds(): Promise<WatchedIds> {
  const result = await favoritesService.list("favorite");
  if (isScopesRpcErr(result)) throw new Error(result.error.message);
  const pageIds: string[] = [];
  const keywordIds: string[] = [];
  for (const item of result.data.items) {
    if (!item.isFavorite) continue;
    if (item.entityType === WATCH_PAGE_TOKEN) pageIds.push(item.entityId);
    else if (item.entityType === WATCH_QUERY_TOKEN)
      keywordIds.push(item.entityId);
  }
  return { pageIds, keywordIds };
}
