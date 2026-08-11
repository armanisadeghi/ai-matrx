import type { Json } from "@/types/database.types";
import { supabase } from "@/utils/supabase/client";
import type {
  ReputationBrief,
  ReputationCaseRow,
  ReputationCaseStatus,
  ReputationWorkspaceData,
} from "./reputation-types";

const REPUTATION_KIND = "digital_pr_reputation_brief_v1";

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseReputationBrief(value: Json | null): ReputationBrief | null {
  if (!isRecord(value)) return null;
  if (value.__kind !== REPUTATION_KIND) return null;
  if (
    typeof value.site_id !== "string" ||
    typeof value.executive_verdict !== "string" ||
    !Array.isArray(value.cases) ||
    !Array.isArray(value.publication_opportunities) ||
    !Array.isArray(value.narratives)
  ) {
    return null;
  }
  return value as unknown as ReputationBrief;
}

async function latestBrief(
  siteId: string,
  signal: AbortSignal,
): Promise<{ brief: ReputationBrief | null; instanceId: string | null }> {
  const definitions = await supabase
    .schema("content_ir")
    .from("kind_definition")
    .select("id")
    .eq("kind", REPUTATION_KIND)
    .eq("is_active", true)
    .is("deleted_at", null)
    .limit(1)
    .abortSignal(signal);
  throwIfError(definitions.error);
  const definitionId = definitions.data?.[0]?.id;
  if (!definitionId) return { brief: null, instanceId: null };
  const instances = await supabase
    .schema("content_ir")
    .from("kind_instance")
    .select("id,data,created_at")
    .eq("kind_definition_id", definitionId)
    .contains("data", { site_id: siteId })
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .abortSignal(signal);
  throwIfError(instances.error);
  const row = instances.data?.[0];
  return {
    brief: parseReputationBrief(row?.data ?? null),
    instanceId: row?.id ?? null,
  };
}

export async function getReputationWorkspace(
  siteId: string,
  brandId: string,
  signal: AbortSignal,
): Promise<ReputationWorkspaceData> {
  const casesPromise = supabase
    .schema("seo")
    .from("reputation_case")
    .select("*")
    .eq("site_id", siteId)
    .order("priority", { ascending: false })
    .order("analyzed_at", { ascending: false })
    .limit(500)
    .abortSignal(signal);
  const seo = supabase.schema("seo");
  const web = supabase.schema("web");
  const [
    casesResponse,
    storedBrief,
    enrichedBacklinks,
    referringDomains,
    competitorOpportunities,
    aiCitations,
    aiClaims,
    businessFacts,
  ] = await Promise.all([
    casesPromise,
    latestBrief(siteId, signal),
    seo
      .from("backlink")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .eq("enrichment_status", "completed")
      .abortSignal(signal),
    seo
      .from("referring_domain_profile")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .abortSignal(signal),
    seo
      .from("competitor_opportunity")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .abortSignal(signal),
    seo
      .from("ai_visibility_citation")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .abortSignal(signal),
    seo
      .from("ai_visibility_claim")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .abortSignal(signal),
    web
      .from("business_fact")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brandId)
      .is("deleted_at", null)
      .abortSignal(signal),
  ]);
  throwIfError(casesResponse.error);
  for (const response of [
    enrichedBacklinks,
    referringDomains,
    competitorOpportunities,
    aiCitations,
    aiClaims,
    businessFacts,
  ]) {
    throwIfError(response.error);
  }
  return {
    cases: (casesResponse.data ?? []) as ReputationCaseRow[],
    latestBrief: storedBrief.brief,
    latestKindInstanceId: storedBrief.instanceId,
    inventory: {
      enrichedBacklinks: enrichedBacklinks.count ?? 0,
      referringDomains: referringDomains.count ?? 0,
      competitorOpportunities: competitorOpportunities.count ?? 0,
      aiCitations: aiCitations.count ?? 0,
      aiClaims: aiClaims.count ?? 0,
      businessFacts: businessFacts.count ?? 0,
    },
  };
}

export async function updateReputationCase(input: {
  caseId: string;
  status: ReputationCaseStatus;
  ruling?: Record<string, Json>;
}): Promise<ReputationCaseRow> {
  const response = await supabase.schema("seo").rpc("update_reputation_case", {
    p_case_id: input.caseId,
    p_status: input.status,
    p_human_ruling: input.ruling ?? {},
  });
  throwIfError(response.error);
  if (!response.data) throw new Error("The case action returned no updated record.");
  return response.data as ReputationCaseRow;
}
