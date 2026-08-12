import { supabase } from "@/utils/supabase/client";

import type { AiVisibilityEvidence } from "./types";
import { makeAssertData } from "@/utils/errors";

const assertData = makeAssertData("reach this site's AI visibility evidence");

export function aiVisibilityEvidenceKey(siteId: string) {
  return ["marketing", "ai-visibility", siteId] as const;
}

/** Read one site's durable answer evidence directly from the shared database. */
export async function listAiVisibilityEvidence(
  siteId: string,
  signal?: AbortSignal,
): Promise<AiVisibilityEvidence> {
  const abortSignal = signal ?? new AbortController().signal;
  const responseQuery = await supabase
    .schema("seo")
    .from("ai_visibility_response")
    .select("*")
    .eq("site_id", siteId)
    .order("observed_at", { ascending: false })
    .order("engine", { ascending: true })
    .limit(200)
    .abortSignal(abortSignal);
  const responses = assertData(responseQuery.data, responseQuery.error);
  const responseIds = responses.map((row) => row.id);
  if (responseIds.length === 0) {
    return { responses: [], claims: [], citations: [], signals: [] };
  }
  const [claimQuery, citationQuery, signalQuery] = await Promise.all([
    supabase
      .schema("seo")
      .from("ai_visibility_claim")
      .select("*")
      .in("response_id", responseIds)
      .order("influential_unverified", { ascending: false })
      .order("significance", { ascending: false })
      .abortSignal(abortSignal),
    supabase
      .schema("seo")
      .from("ai_visibility_citation")
      .select("*")
      .in("response_id", responseIds)
      .order("ordinal", { ascending: true })
      .abortSignal(abortSignal),
    supabase
      .schema("seo")
      .from("ai_visibility_signal")
      .select("*")
      .in("response_id", responseIds)
      .order("influence", { ascending: false })
      .abortSignal(abortSignal),
  ]);
  return {
    responses,
    claims: assertData(claimQuery.data, claimQuery.error),
    citations: assertData(citationQuery.data, citationQuery.error),
    signals: assertData(signalQuery.data, signalQuery.error),
  };
}
