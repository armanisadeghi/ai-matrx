/**
 * KEYWORD TAGS — the data layer.
 *
 * A tag is a value of the site's ONE Tags dimension (`site_tags_<site8>`), a
 * multi-cardinality stamp dimension, so a keyword holds any number of them.
 * Every call is an existing `seo` function, run as the person:
 *
 *   • `keyword_tag_dimension_slug`   — the site's Tags dimension, or null.
 *   • `keyword_tag_dimension_ensure` — create it on the first tag write.
 *   • `facet_value_upsert`           — a new tag name becomes a value.
 *   • `keyword_facet_set`            — add a tag (`p_value`), or remove ONE
 *                                      tag and keep the others (`p_remove`).
 *
 * The agent tool writes tags through the same functions
 * (`aidream/services/seo/keyword_data.py` → `write_tags`), so a tag made in
 * chat and a tag made in the table are the same row.
 *
 * The rows a tag write lands are owned by the site's organization (the
 * database stamps it); this module never picks an organization.
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { extractErrorMessage } from "@/utils/errors";
import { upsertFacetValue } from "@/features/marketing/seo/value-system/dimensions/data";

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

/** The RPCs answer with `code: sentence`; keep the sentence. */
function rpcError(error: unknown, action: string): Error {
  const message = extractErrorMessage(error).split(" · ")[0] ?? "";
  const sentence = message.replace(/^(seo_[a-z_]+|gsc_[a-z_]+):\s*/, "");
  return new Error(sentence || `Could not ${action}.`, { cause: error });
}

export const SITE_TAG_DIMENSION_KEY = ["marketing", "seo", "tag-dimension"] as const;

/**
 * A tag name → its value key. The SAME rule as the agent tool's `tag_value`:
 * lowercase, non-alphanumerics to `_`, trimmed; a key that does not start with
 * a letter gets `t_`. Null when nothing usable is left.
 */
export function tagValueKey(label: string): string | null {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!slug) return null;
  return /^[a-z]/.test(slug) ? slug : `t_${slug}`;
}

/** The site's Tags dimension slug, or null when the site has no tags yet. */
export async function getSiteTagDimensionSlug(
  siteId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const response = await (await seoDb())
    .rpc("keyword_tag_dimension_slug", { p_site_id: siteId })
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) throw rpcError(response.error, "read this site's tags");
  return typeof response.data === "string" && response.data ? response.data : null;
}

/** Create the site's Tags dimension if it is missing; answers its slug. */
export async function ensureSiteTagDimension(siteId: string): Promise<string> {
  const db = await seoDb();
  const ensured = await db.rpc("keyword_tag_dimension_ensure", { p_site_id: siteId });
  if (ensured.error) throw rpcError(ensured.error, "set up tags for this site");
  const slug = await getSiteTagDimensionSlug(siteId);
  if (!slug) throw new Error("This site's tag list could not be read after it was created.");
  return slug;
}

/** One tag the person chose: an existing value, or a new name to create. */
export interface TagChoice {
  /** The value key (`priority`). */
  value: string;
  label: string;
  /** True when the site has no such tag yet — it is created before the write. */
  isNew: boolean;
}

export interface TagWriteInput {
  siteId: string;
  keywordIds: string[];
  tags: TagChoice[];
  /** Remove these tags instead of adding them. */
  remove?: boolean;
}

export interface TagWriteResult {
  dimensionSlug: string;
  /** Keyword × tag pairs written. */
  changed: number;
  created: string[];
}

/**
 * Add or remove tags on keywords. Adding keeps every tag a keyword already has;
 * removing takes off only the named tags.
 */
export async function writeKeywordTags(input: TagWriteInput): Promise<TagWriteResult> {
  const { siteId, keywordIds, tags, remove = false } = input;
  if (keywordIds.length === 0) throw new Error("Choose at least one keyword.");
  if (tags.length === 0) throw new Error("Choose at least one tag.");
  const dimensionSlug = await ensureSiteTagDimension(siteId);
  const created: string[] = [];
  if (!remove) {
    for (const tag of tags.filter((t) => t.isNew)) {
      await upsertFacetValue({
        dimension: dimensionSlug,
        value: tag.value,
        label: tag.label,
        description: null,
        siteId,
      });
      created.push(tag.label);
    }
  }
  const db = await seoDb();
  let changed = 0;
  for (const tag of tags) {
    if (remove && tag.isNew) continue; // nothing carries a tag that does not exist
    const response = await db.rpc("keyword_facet_set", {
      p_keyword_ids: keywordIds,
      p_dimension: dimensionSlug,
      p_value: tag.value,
      p_source: "human",
      p_site_id: siteId,
      ...(remove ? { p_remove: true } : {}),
    });
    if (response.error) {
      throw rpcError(response.error, remove ? "remove that tag" : "save that tag");
    }
    changed += keywordIds.length;
  }
  return { dimensionSlug, changed, created };
}
