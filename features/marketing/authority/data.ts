import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { normalizePlanUrl } from "@/features/marketing/data/page-links";
import type { AuthorityRouterResult } from "./types";

function isAuthorityResult(value: unknown): value is AuthorityRouterResult {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Partial<AuthorityRouterResult>;
  return (
    result.result_kind === "authority.route" &&
    typeof result.site_id === "string" &&
    Array.isArray(result.pages) &&
    Array.isArray(result.candidates) &&
    Array.isArray(result.recommendations)
  );
}

export async function getLatestAuthorityResult(
  siteId: string,
  signal?: AbortSignal,
): Promise<AuthorityRouterResult | null> {
  await requireAuthenticatedSupabaseSession(supabase);
  const response = await supabase
    .schema("seo")
    .from("collection_run")
    .select("result")
    .eq("site_id", siteId)
    .eq("provider", "aidream")
    .eq("operation", "authority.route")
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) throw response.error;
  const result = response.data[0]?.result;
  if (!isAuthorityResult(result)) return null;

  const sourceIds = Array.from(
    new Set(result.recommendations.map((item) => item.source_page_id)),
  );
  if (sourceIds.length === 0) return result;
  const dismissedResponse = await supabase
    .schema("web")
    .from("page")
    .select("id, desired_values")
    .in("id", sourceIds)
    .abortSignal(signal ?? new AbortController().signal);
  if (dismissedResponse.error) throw dismissedResponse.error;
  const dismissed = new Set<string>();
  const planned = new Set<string>();
  for (const row of dismissedResponse.data) {
    const values = row.desired_values;
    if (
      typeof values !== "object" ||
      values === null ||
      Array.isArray(values)
    ) {
      continue;
    }
    const keys = (values as Record<string, unknown>).authority_router_dismissed;
    if (Array.isArray(keys)) {
      for (const key of keys) if (typeof key === "string") dismissed.add(key);
    }
    const outbound = (values as Record<string, unknown>).outbound_links;
    if (!Array.isArray(outbound)) continue;
    const plannedTargets = new Set(
      outbound.flatMap((entry) => {
        if (
          typeof entry !== "object" ||
          entry === null ||
          Array.isArray(entry)
        ) {
          return [];
        }
        const url = (entry as Record<string, unknown>).url;
        return typeof url === "string" ? [normalizePlanUrl(url)] : [];
      }),
    );
    for (const recommendation of result.recommendations) {
      if (
        recommendation.source_page_id === row.id &&
        plannedTargets.has(normalizePlanUrl(recommendation.target_url))
      ) {
        planned.add(recommendation.candidate_key);
      }
    }
  }
  if (dismissed.size === 0 && planned.size === 0) return result;
  const hidden = new Set([...dismissed, ...planned]);
  return {
    ...result,
    candidates: result.candidates.filter(
      (item) => !hidden.has(item.candidate_key),
    ),
    recommendations: result.recommendations.filter(
      (item) => !hidden.has(item.candidate_key),
    ),
  };
}
