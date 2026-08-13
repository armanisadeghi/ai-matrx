/**
 * The ANONYMOUS lane for keyword-plane metrics on a share link.
 *
 * The shared artifact carries phrases only; volume / CPC / trend / intent live
 * in `seo.keyword` + `seo.keyword_market`, which anon deliberately cannot read
 * (no schema grant — that plane is paid provider data). `share_token_keyword_
 * metrics` is the bounded SECURITY DEFINER lane: a valid token returns exactly
 * the rows for the phrases inside THAT artifact, and nothing else. The token is
 * the authorization, exactly like `resolve_share_token`.
 *
 * Never widen this into a general keyword lookup, and never grant anon the
 * keyword tables to avoid it.
 */

import { supabase } from "@/utils/supabase/client";
import type { KeywordReportRow } from "./report";

export function sharedKeywordMetricsQueryKey(token: string) {
  return ["seo", "keyword-research", "share-metrics", token] as const;
}

export async function fetchSharedKeywordMetrics(
  token: string,
): Promise<KeywordReportRow[]> {
  const response = await supabase.rpc("share_token_keyword_metrics", {
    p_token: token,
  });
  if (response.error) throw response.error;
  return Array.isArray(response.data)
    ? (response.data as unknown as KeywordReportRow[])
    : [];
}
