/**
 * Shared CMS Supabase client + ownership checks for the `/api/cms/*` action-dispatch routes.
 *
 * Project: viyklljfdhtidwecakwx (separate Auth domain, separate RLS from the main
 * txzxabzwovsujtloxrus project). API keys: ONLY sb_secret_* — legacy JWT keys
 * (SUPABASE_HTML_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_HTML_ANON_KEY) are DEPRECATED and BANNED.
 * https://supabase.com/dashboard/project/viyklljfdhtidwecakwx/settings/api-keys
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const HTML_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_HTML_URL ?? "";
const HTML_SUPABASE_SECRET_KEY = process.env.SUPABASE_HTML_SECRET_KEY ?? "";

export function getCmsClient(): SupabaseClient {
  if (!HTML_SUPABASE_URL || !HTML_SUPABASE_SECRET_KEY) {
    throw new Error(
      "Missing CMS Supabase env vars (NEXT_PUBLIC_SUPABASE_HTML_URL, SUPABASE_HTML_SECRET_KEY). " +
        "See https://supabase.com/docs/guides/getting-started/api-keys",
    );
  }
  return createClient(HTML_SUPABASE_URL, HTML_SUPABASE_SECRET_KEY, {
    auth: { persistSession: false },
  });
}

/** Verify the user owns the given site. */
export async function verifySiteOwnership(
  db: SupabaseClient,
  siteId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await db
    .from("client_sites")
    .select("id")
    .eq("id", siteId)
    .eq("owner_user_id", userId)
    .single();
  return !!data;
}

/** Verify the user owns the site that a page belongs to. */
export async function verifyPageOwnership(
  db: SupabaseClient,
  pageId: string,
  userId: string,
): Promise<boolean> {
  const { data: page } = await db
    .from("client_pages")
    .select("client_id")
    .eq("id", pageId)
    .single();
  if (!page) return false;
  return verifySiteOwnership(db, page.client_id, userId);
}

/** Verify the user owns the site that a component belongs to. */
export async function verifyComponentOwnership(
  db: SupabaseClient,
  componentId: string,
  userId: string,
): Promise<{ ok: boolean; clientId: string | null }> {
  const { data: comp } = await db
    .from("client_components")
    .select("client_id")
    .eq("id", componentId)
    .single();
  if (!comp) return { ok: false, clientId: null };
  const ok = await verifySiteOwnership(db, comp.client_id, userId);
  return { ok, clientId: comp.client_id };
}

/** Verify the user owns the site that an asset belongs to. */
export async function verifyAssetOwnership(
  db: SupabaseClient,
  assetId: string,
  userId: string,
): Promise<boolean> {
  const { data: asset } = await db
    .from("client_assets")
    .select("client_id")
    .eq("id", assetId)
    .single();
  if (!asset) return false;
  return verifySiteOwnership(db, asset.client_id, userId);
}

/** Verify the user owns the site that a collection belongs to (W2-C). */
export async function verifyCollectionOwnership(
  db: SupabaseClient,
  collectionId: string,
  userId: string,
): Promise<boolean> {
  const { data: collection } = await db
    .from("site_collections")
    .select("client_id")
    .eq("id", collectionId)
    .single();
  if (!collection) return false;
  return verifySiteOwnership(db, collection.client_id, userId);
}

/**
 * Verify the user owns an `html_pages` row. These have no site — ownership is the
 * direct `user_id` column (same rule aidream's `services/cms/access.py` applies).
 */
export async function verifyHtmlPageOwnership(
  db: SupabaseClient,
  pageId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await db
    .from("html_pages")
    .select("id")
    .eq("id", pageId)
    .eq("user_id", userId)
    .single();
  return !!data;
}
