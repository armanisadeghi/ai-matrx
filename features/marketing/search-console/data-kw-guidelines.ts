/**
 * KW business guidelines — the per-site prose document every classification /
 * valuation agent reads before it rules on a keyword (D35).
 *
 * Arman's ruling (2026-08-21): "the agent wouldn't know CRT is a horrible
 * keyword unless there's some document that guides it and we keep these things
 * up to date." Keeping it current is a PRODUCT SURFACE, not chat memory — so
 * it lives on the site row (`web.site.settings.kw_guidelines`) behind ONE
 * write RPC that stamps its own provenance, and it is injected into the
 * classifier call as a named agent variable (never smuggled into user_input —
 * THE USER-INPUT LAW).
 *
 * ONE read path + ONE write path. Never touch `web.site.settings` directly for
 * this key: `gsc_set_site_kw_guidelines` merges the single key server-side, so
 * a guidelines save cannot clobber a concurrent cms / content_plan settings
 * write. RPCs: `migrations/seo_kw_business_guidelines.sql`.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md.
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { makeAssertData } from "@/utils/errors";

const assertData = makeAssertData("reach this site's keyword guidelines");

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

export type KwGuidelines = {
  /** The prose. `null` when the site has never written one. */
  guidelines: string | null;
  /** Bumped by the write RPC on every save; 0 when unwritten. */
  guidelines_version: number;
  updated_at: string | null;
  updated_by: string | null;
  updated_by_name: string | null;
};

const EMPTY: KwGuidelines = {
  guidelines: null,
  guidelines_version: 0,
  updated_at: null,
  updated_by: null,
  updated_by_name: null,
};

export async function getKwGuidelines(
  siteId: string,
  signal?: AbortSignal,
): Promise<KwGuidelines> {
  const response = await (await seoDb())
    .rpc("gsc_site_kw_guidelines", { p_site_id: siteId })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error);
  return rows[0] ?? EMPTY;
}

/** THE one write path. Blank/whitespace text CLEARS the document. */
export async function setKwGuidelines(
  siteId: string,
  guidelines: string | null,
): Promise<KwGuidelines> {
  const response = await (await seoDb()).rpc("gsc_set_site_kw_guidelines", {
    p_site_id: siteId,
    p_guidelines: guidelines ?? "",
  });
  const rows = assertData(response.data, response.error);
  return rows[0] ?? EMPTY;
}

/** The query key both workbenches share, so a save in one refreshes the other. */
export const kwGuidelinesQueryKey = (siteId: string) =>
  ["marketing", "gsc", "kw-guidelines", siteId] as const;
