/**
 * Shared CMS Supabase client + ownership checks for the `/api/cms/*` action-dispatch routes.
 *
 * Project: viyklljfdhtidwecakwx (separate Auth domain, separate RLS from the main
 * txzxabzwovsujtloxrus project). API keys: ONLY sb_secret_* — legacy JWT keys
 * (SUPABASE_HTML_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_HTML_ANON_KEY) are DEPRECATED and BANNED.
 * https://supabase.com/dashboard/project/viyklljfdhtidwecakwx/settings/api-keys
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  canAccessCmsSite,
  type CmsSiteAccessRow,
  type CmsAccessLevel,
  type CmsCaller,
} from "./cmsAccess";

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

export interface CmsSiteAccessRecord extends CmsSiteAccessRow {
  id: string;
  name: string | null;
}

export interface CmsPageAccessRecord {
  id: string;
  client_id: string;
  title: string | null;
}

export type CmsSiteAccessLookup =
  | { status: "ok" | "denied"; site: CmsSiteAccessRecord }
  | { status: "not_found" }
  | { status: "error"; error: unknown };

export type CmsPageAccessLookup =
  | {
      status: "ok" | "denied";
      page: CmsPageAccessRecord;
      site: CmsSiteAccessRecord;
    }
  | { status: "not_found" }
  | { status: "error"; error: unknown };

/**
 * Resolve existence and access separately for one CMS site.
 *
 * The service-role CMS client can see the row even when the caller cannot,
 * so collapsing these two facts into a boolean throws away the exact truth the
 * Access Gate needs. Mutation helpers may still consume the boolean wrapper
 * below; single-record reads use this discriminated result.
 */
export async function lookupCmsSiteAccess(
  db: SupabaseClient,
  siteId: string,
  caller: CmsCaller,
  level: CmsAccessLevel = "editor",
): Promise<CmsSiteAccessLookup> {
  const { data, error } = await db
    .from("client_sites")
    .select("id, name, owner_user_id, organization_id, visibility")
    .eq("id", siteId)
    .maybeSingle();
  if (error) return { status: "error", error };
  if (!data) return { status: "not_found" };
  return canAccessCmsSite(caller, data, level)
    ? { status: "ok", site: data }
    : { status: "denied", site: data };
}

/** Resolve a page first, then the access state of its owning site. */
export async function lookupCmsPageAccess(
  db: SupabaseClient,
  pageId: string,
  caller: CmsCaller,
  level: CmsAccessLevel = "editor",
): Promise<CmsPageAccessLookup> {
  const { data: page, error } = await db
    .from("client_pages")
    .select("id, client_id, title")
    .eq("id", pageId)
    .maybeSingle();
  if (error) return { status: "error", error };
  if (!page) return { status: "not_found" };

  const site = await lookupCmsSiteAccess(db, page.client_id, caller, level);
  if (site.status === "error" || site.status === "not_found") return site;
  return { status: site.status, page, site: site.site };
}

/**
 * Verify the caller may act on the given site at `level`.
 *
 * These take a resolved `CmsCaller`, NOT a bare user id, on purpose: a site is
 * org-scoped and shareable now (Arman, 2026-08-15), so a check that sees only
 * a user id cannot answer the question. Making that impossible to express is
 * the point — every callsite must go through `resolveCmsCaller` first, and
 * TypeScript refuses the old `user.id` argument.
 *
 * `level` defaults to `"editor"`, the level org members hold. Reserve
 * `"admin"` for destroying the shared thing itself (see the site `delete`
 * action) — per the platform's share levels, edit has never meant delete.
 *
 * The predicate is `canAccessCmsSite` in `./cmsAccess`; these helpers only
 * fetch the row it reads.
 */
export async function verifySiteOwnership(
  db: SupabaseClient,
  siteId: string,
  caller: CmsCaller,
  level: CmsAccessLevel = "editor",
): Promise<boolean> {
  return (await lookupCmsSiteAccess(db, siteId, caller, level)).status === "ok";
}

/** Verify the caller may act on the site that a page belongs to. */
export async function verifyPageOwnership(
  db: SupabaseClient,
  pageId: string,
  caller: CmsCaller,
  level: CmsAccessLevel = "editor",
): Promise<boolean> {
  return (await lookupCmsPageAccess(db, pageId, caller, level)).status === "ok";
}

/** Verify the caller may act on the site that a component belongs to. */
export async function verifyComponentOwnership(
  db: SupabaseClient,
  componentId: string,
  caller: CmsCaller,
  level: CmsAccessLevel = "editor",
): Promise<{ ok: boolean; clientId: string | null }> {
  const { data: comp } = await db
    .from("client_components")
    .select("client_id")
    .eq("id", componentId)
    .single();
  if (!comp) return { ok: false, clientId: null };
  const ok = await verifySiteOwnership(db, comp.client_id, caller, level);
  return { ok, clientId: comp.client_id };
}

/** Verify the caller may act on the site that an asset belongs to. */
export async function verifyAssetOwnership(
  db: SupabaseClient,
  assetId: string,
  caller: CmsCaller,
  level: CmsAccessLevel = "editor",
): Promise<boolean> {
  const { data: asset } = await db
    .from("client_assets")
    .select("client_id")
    .eq("id", assetId)
    .single();
  if (!asset) return false;
  return verifySiteOwnership(db, asset.client_id, caller, level);
}

/** Verify the caller may act on the site that a collection belongs to (W2-C). */
export async function verifyCollectionOwnership(
  db: SupabaseClient,
  collectionId: string,
  caller: CmsCaller,
  level: CmsAccessLevel = "editor",
): Promise<boolean> {
  const { data: collection } = await db
    .from("site_collections")
    .select("client_id")
    .eq("id", collectionId)
    .single();
  if (!collection) return false;
  return verifySiteOwnership(db, collection.client_id, caller, level);
}

/**
 * Verify the user owns an `html_pages` row. These have no site and no org —
 * ownership is the direct `user_id` column (same rule aidream's
 * `services/cms/access.py` applies). Deliberately still a bare user id: the
 * standalone quick-publish system has no org scoping, and pretending otherwise
 * by taking a `CmsCaller` would imply a sharing model that does not exist.
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
