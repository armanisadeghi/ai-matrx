import "server-only";

/**
 * SERVER reads for the keyword-research report permalink
 * (`/shapes/instances/[id]`). A Server Component owns the whole page in one
 * pass — the artifact under the viewer's own JWT (RLS decides owner vs grantee
 * vs no-access) plus the keyword-plane join — so the report is real HTML, not
 * a client waterfall.
 *
 * The browser twin lives in `./queries.ts`; both speak the same shapes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeKeywordPhrase } from "@/features/marketing/seo/keyword/normalize";
import type { KeywordResearchArtifact } from "@/types/python-generated/stream-events";

import { keywordResearchPhrases, readKeywordResearchArtifact } from "./artifact";
import type { KeywordReportRow } from "./report";

export interface KindInstanceRecord {
  id: string;
  title: string | null;
  createdAt: string;
  kind: string;
  /** Non-null only when the instance IS keyword research. */
  keywordResearch: KeywordResearchArtifact | null;
}

/**
 * One kind instance with its kind resolved. Returns `null` when RLS hides it,
 * it is deleted, or it does not exist — the caller renders `<AccessGate>`,
 * which resolves the TRUE reason instead of guessing.
 */
export async function loadKindInstance(
  supabase: SupabaseClient,
  id: string,
): Promise<{ record: KindInstanceRecord | null; error: unknown }> {
  const { data, error } = await supabase
    .schema("content_ir")
    .from("kind_instance")
    .select("id, title, created_at, data, kind_definition:kind_definition_id(kind)")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return { record: null, error: error ?? null };

  const definition = data.kind_definition as { kind?: string } | null;
  const kind = definition?.kind ?? "";
  return {
    record: {
      id: data.id as string,
      title: (data.title as string | null) ?? null,
      createdAt: data.created_at as string,
      kind,
      keywordResearch:
        kind === "keyword_relationship_research"
          ? readKeywordResearchArtifact(data.data)
          : null,
    },
    error: null,
  };
}

/**
 * Keyword-plane rows for an artifact's phrases, read with the caller's JWT.
 * `seo.keyword` / `seo.keyword_market` are world-readable to authenticated
 * users, so a grantee who can open the artifact can always see its metrics.
 * Never throws the page down: metrics are enrichment, so a failure renders the
 * report without the market table rather than an error screen.
 */
export async function loadKeywordMetricsForArtifact(
  supabase: SupabaseClient,
  artifact: KeywordResearchArtifact,
): Promise<KeywordReportRow[]> {
  const normalized = Array.from(
    new Set(keywordResearchPhrases(artifact).map(normalizeKeywordPhrase)),
  ).filter(Boolean);
  if (normalized.length === 0) return [];
  const { data, error } = await supabase
    .schema("seo")
    .from("keyword")
    .select("*, keyword_market(*)")
    .in("normalized_phrase", normalized)
    .is("deleted_at", null);
  if (error) {
    console.error("[keyword-research] metrics join failed", error);
    return [];
  }
  return (data ?? []) as unknown as KeywordReportRow[];
}
