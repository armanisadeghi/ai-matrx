// features/education/publishing/queries.ts
//
// Server-side PUBLIC reads for the /education/learn publishing engine. Anon,
// cookie-free client (works inside cached / statically-generated routes) +
// `unstable_cache` tagged so a publish can bust every consumer at once
// (list page, article pages, sitemap, OG). RLS `pub_read` restricts anon to
// `visibility='public'`, so only published docs are ever returned.
//
// Loud recovery: a read failure THROWS (never a silent empty list) — an empty
// learn index is indistinguishable from a broken DB otherwise.

import "server-only";
import { unstable_cache } from "next/cache";
import { getScriptSupabaseClient } from "@/utils/supabase/getScriptClient";
import { mapRowToLearnDoc } from "./mappers";
import type { LearnDocRecord, LearnDocRow } from "./types";

/** Cache tag busted by every authoring mutation (see actions.ts). */
export const LEARN_DOCS_TAG = "education-learn-docs";

/** Revalidate window for the ISR fallback (a publish busts sooner via the tag). */
const LEARN_REVALIDATE_SECONDS = 3600;

async function fetchPublishedRows(): Promise<LearnDocRow[]> {
  const sb = getScriptSupabaseClient();
  const { data, error } = await sb
    .schema("education")
    .from("learn_doc")
    .select("*")
    .eq("visibility", "public")
    .is("deleted_at", null)
    .order("content_updated_at", { ascending: false, nullsFirst: false });
  if (error) {
    throw new Error(`[learn_doc] published list failed: ${error.message}`);
  }
  return (data ?? []) as LearnDocRow[];
}

/** All published docs, most-recently-updated first. Cached + tagged. */
export const listPublishedLearnDocs = unstable_cache(
  async (): Promise<LearnDocRecord[]> => {
    const rows = await fetchPublishedRows();
    return rows.map(mapRowToLearnDoc);
  },
  ["education-learn-docs:list"],
  { tags: [LEARN_DOCS_TAG], revalidate: LEARN_REVALIDATE_SECONDS },
);

/**
 * One published doc by slug, or null (→ notFound). Derives from the cached
 * list rather than a per-slug `unstable_cache` — a static `keyParts` does NOT
 * fold in the slug argument, so a per-slug cache would collapse every slug onto
 * one entry. Reusing the (small) list keeps one consistent, tag-busted entry.
 */
export async function getPublishedLearnDoc(
  slug: string,
): Promise<LearnDocRecord | null> {
  const docs = await listPublishedLearnDocs();
  return docs.find((d) => d.slug === slug) ?? null;
}

/**
 * slug → title for every published doc — used to label `related.content`
 * cross-links on axis pages without N round-trips. Cached + tagged.
 */
export const getPublishedLearnDocTitles = unstable_cache(
  async (): Promise<Record<string, string>> => {
    const rows = await fetchPublishedRows();
    return Object.fromEntries(rows.map((r) => [r.slug, r.title]));
  },
  ["education-learn-docs:titles"],
  { tags: [LEARN_DOCS_TAG], revalidate: LEARN_REVALIDATE_SECONDS },
);
