// features/marketing/seo/domain-research/data.ts — the domain page's stored
// reads, direct from Supabase (the server is only for the tool's paid work).
// Sites come from the competitor workspace's own reader; nothing is re-read
// two ways.

import { readAllRows } from "@ai-matrx/data/db";
import { supabase } from "@/utils/supabase/client";
import type { Database } from "@/types/database.types";

export type TrackedCompetitor = Pick<
  Database["seo"]["Tables"]["competitor"]["Row"],
  "id" | "site_id" | "tracking_status" | "display_name"
>;

/** Every `seo.competitor` row naming this domain that the person can see. */
export async function listCompetitorRowsForDomain(host: string): Promise<TrackedCompetitor[]> {
  return readAllRows<TrackedCompetitor>(
    ({ from, to }) =>
      supabase
        .schema("seo")
        .from("competitor")
        .select("id,site_id,tracking_status,display_name", { count: "exact" })
        .eq("normalized_domain", host)
        .order("id", { ascending: true })
        .range(from, to),
    { label: "seo.competitor rows for one researched domain" },
  );
}

/**
 * A typed domain or URL to the bare host the tool researches:
 * "https://www.Example.com/path?q" → "example.com". Null when nothing usable.
 */
export function normalizeDomainInput(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim().toLowerCase();
  if (!text) return null;
  const withoutScheme = text.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  const host = withoutScheme.split(/[/?#]/)[0].replace(/:\d+$/, "").replace(/^www\./, "");
  if (!host || !host.includes(".") || /\s/.test(host)) return null;
  return host;
}
