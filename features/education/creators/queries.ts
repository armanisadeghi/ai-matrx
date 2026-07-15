// features/education/creators/queries.ts
//
// Server-side PUBLIC reads for creator landing pages (/c/[handle]). The page is
// id/handle-addressed and SEO-indexable; the read is the anon-safe SECURITY
// DEFINER RPC `creator_public_page` (returns only creator_public=true rows and
// enriches featured items, dropping any non-public resource). Cookie-free
// script client so it works in any render path.
//
// Loud recovery: a read error THROWS rather than silently 404-ing — a broken DB
// is indistinguishable from "no such creator" otherwise.

import "server-only";
import { getScriptSupabaseClient } from "@/utils/supabase/getScriptClient";
import type {
  CreatorLink,
  CreatorPublicPage,
  FeaturedItem,
} from "./types";

interface RawPage {
  handle?: string;
  displayName?: string;
  avatarUrl?: string | null;
  tagline?: string | null;
  bio?: string | null;
  links?: unknown;
  featured?: unknown;
  publishedAt?: string | null;
  updatedAt?: string | null;
}

function asLinks(v: unknown): CreatorLink[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((raw) => {
    if (raw && typeof raw === "object") {
      const o = raw as Record<string, unknown>;
      const url = typeof o.url === "string" ? o.url : "";
      const label = typeof o.label === "string" ? o.label : url;
      if (url) return [{ label, url }];
    }
    return [];
  });
}

function asFeatured(v: unknown): FeaturedItem[] {
  if (!Array.isArray(v)) return [];
  // The RPC already validated/enriched each item; trust its shape at the boundary.
  return v.filter(
    (i): i is FeaturedItem =>
      !!i && typeof i === "object" && typeof (i as { kind?: unknown }).kind === "string",
  );
}

/**
 * The public landing page for a handle, or null (→ notFound) when the handle is
 * unknown or its page is not published. Anon-safe.
 */
export async function getCreatorPublicPage(
  handle: string,
): Promise<CreatorPublicPage | null> {
  const sb = getScriptSupabaseClient();
  const { data, error } = await sb.rpc("creator_public_page", { p_handle: handle });
  if (error) {
    throw new Error(`[creator_public_page] read failed for "${handle}": ${error.message}`);
  }
  if (!data) return null;
  const raw = data as RawPage;
  if (!raw.handle) return null;
  return {
    handle: raw.handle,
    displayName: raw.displayName ?? "Creator",
    avatarUrl: raw.avatarUrl ?? null,
    tagline: raw.tagline ?? null,
    bio: raw.bio ?? null,
    links: asLinks(raw.links),
    featured: asFeatured(raw.featured),
    publishedAt: raw.publishedAt ?? null,
    updatedAt: raw.updatedAt ?? null,
  };
}

/**
 * Every published creator handle — for the sitemap. Reads via the anon-safe
 * `creator_public_handles` RPC so it never depends on the `users` schema being
 * PostgREST-exposed.
 */
export async function listPublicCreatorHandles(): Promise<
  { handle: string; updatedAt: string | null }[]
> {
  const sb = getScriptSupabaseClient();
  const { data, error } = await sb.rpc("creator_public_handles");
  if (error) {
    throw new Error(`[creators] handle list failed: ${error.message}`);
  }
  const rows = (data ?? []) as { handle: string | null; updated_at: string | null }[];
  return rows.flatMap((row) =>
    row.handle ? [{ handle: row.handle, updatedAt: row.updated_at }] : [],
  );
}
