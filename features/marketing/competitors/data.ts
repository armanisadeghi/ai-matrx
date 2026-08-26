import type { Database } from "@/types/database.types";
import { supabase } from "@/utils/supabase/client";
import { callApi } from "@/lib/api/call-api";
import { readAllRows } from "@/lib/supabase/readAllRows";
import type { AppDispatch } from "@/lib/redux/store";
import type {
  CompetitorTrackingStatus,
  OpportunityStatus,
} from "./autopsy-controls";
import type { CompetitorRuling } from "./groundTruth";

export type CompetitorRow = Database["seo"]["Tables"]["competitor"]["Row"];
export type CompetitorOpportunityRow =
  Database["seo"]["Tables"]["competitor_opportunity"]["Row"];
export type CompetitorRunRow =
  Database["seo"]["Tables"]["collection_run"]["Row"];
type WebSiteRow = Database["web"]["Tables"]["site"]["Row"];
type WebBrandRow = Database["web"]["Tables"]["brand"]["Row"];
export type CompetitorSite = Pick<
  WebSiteRow,
  "id" | "name" | "domain" | "root_url" | "brand_id"
  | "organization_id" | "created_by"
> & {
  brand: Pick<WebBrandRow, "id" | "name"> | null;
};

export interface CompetitorLookupResult {
  title: string;
  url: string;
  domain: string;
  description: string;
}

function requireData<T>(data: T | null, error: unknown): T {
  if (error) throw error;
  if (data === null) throw new Error("Supabase returned no competitor data.");
  return data;
}

export async function listCompetitorSites(): Promise<CompetitorSite[]> {
  return readAllRows<CompetitorSite>(
    ({ from, to }) =>
      supabase
        .schema("web")
        .from("site")
        .select(
          "id,name,domain,root_url,brand_id,organization_id,created_by,brand:brand_id(id,name)",
          { count: "exact" },
        )
        .is("deleted_at", null)
        .eq("status", "active")
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    { label: "web.site competitor workspace options" },
  );
}

export async function lookupCompetitor(
  siteId: string,
  name: string,
  dispatch: AppDispatch,
): Promise<CompetitorLookupResult[]> {
  const result = await dispatch(callApi({
    path: "/seo/sites/{site_id}/competitors/lookup",
    method: "POST",
    pathParams: { site_id: siteId },
    body: { name },
  }));
  if (result.error) throw new Error(result.error.message ?? "Competitor lookup failed");
  const payload = result.data as { results?: CompetitorLookupResult[] } | null;
  return payload?.results ?? [];
}

export async function addCompetitor(
  site: CompetitorSite,
  result: CompetitorLookupResult,
): Promise<CompetitorRow> {
  const now = new Date().toISOString();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sign in to add a competitor.");
  if (!site.organization_id) throw new Error("This site is missing its organization identity.");
  const { data, error } = await supabase
    .schema("seo")
    .from("competitor")
    .upsert({
      site_id: site.id,
      organization_id: site.organization_id,
      created_by: auth.user.id,
      normalized_domain: result.domain,
      display_domain: result.domain,
      display_name: result.title,
      discovery_source: "manual",
      tracking_status: "candidate",
      classification_status: "unclassified",
      provider_evidence: { lookup: result },
      latest_autopsy: {}, human_ruling: {}, resolved_assessment: {},
      custom_labels: [], metadata: {},
      first_observed_at: now, last_observed_at: now,
      created_at: now, updated_at: now,
    }, { onConflict: "site_id,normalized_domain" })
    .select("*")
    .single();
  return requireData(data, error);
}

export async function classifyCompetitor(siteId: string, competitorId: string, dispatch: AppDispatch): Promise<void> {
  const result = await dispatch(callApi({
    path: "/seo/sites/{site_id}/competitors/classify",
    method: "POST",
    pathParams: { site_id: siteId },
    body: { competitor_id: competitorId },
  }));
  if (result.error) throw new Error(result.error.message ?? "Classification failed");
}

export type CompetitorClassificationPatch = Pick<CompetitorRow,
  "business_overlap" | "market_overlap" | "entity_role" | "peer_scale" |
  "posture" | "use_for_link_gap" | "custom_labels"
>;

/**
 * Persist a human decision.
 *
 * `ruling` is the GROUND TRUTH record (see `groundTruth.ts`) and it lands in
 * `human_ruling`, the provenance bucket that always wins. Passing it is what
 * makes a confirmation worth something later: without the frozen proposal and
 * the human's own words, all we ever learn from a click is that somebody
 * clicked. Confirming with no ruling is still allowed — an "I agree" that
 * records only agreement is better than an unreviewed row — but every surface
 * we ship should be asking for the why.
 */
export async function saveCompetitorClassification(
  competitorId: string,
  patch: CompetitorClassificationPatch,
  confirm: boolean,
  ruling?: CompetitorRuling,
): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sign in to classify a competitor.");
  const now = new Date().toISOString();
  const { error } = await supabase.schema("seo").from("competitor").update({
    ...patch,
    classification_status: confirm ? "confirmed" : "proposed",
    classification_confirmed_at: confirm ? now : null,
    classification_confirmed_by: confirm ? auth.user.id : null,
    human_ruling: ruling
      ? { ...ruling, decided_by: auth.user.id, confirmed: confirm }
      : { source: "competitor_workspace", confirmed: confirm, decided_at: now },
    human_reviewed_at: now,
    updated_at: now,
  }).eq("id", competitorId);
  if (error) throw error;
}

export async function loadCompetitorWorkspace(siteId: string): Promise<{
  competitors: CompetitorRow[];
  opportunities: CompetitorOpportunityRow[];
  runs: CompetitorRunRow[];
}> {
  const [competitors, opportunities, runs] = await Promise.all([
    supabase
      .schema("seo")
      .from("competitor")
      .select("*")
      .eq("site_id", siteId)
      .order("relevance_score", { ascending: false, nullsFirst: false })
      .limit(500),
    supabase
      .schema("seo")
      .from("competitor_opportunity")
      .select("*")
      .eq("site_id", siteId)
      .order("priority", { ascending: false })
      .limit(1000),
    supabase
      .schema("seo")
      .from("collection_run")
      .select("*")
      .eq("site_id", siteId)
      .eq("provider", "aidream")
      .eq("operation", "competitors.opportunity_autopsy")
      .order("created_at", { ascending: false })
      .limit(25),
  ]);
  return {
    competitors: requireData(competitors.data, competitors.error),
    opportunities: requireData(opportunities.data, opportunities.error),
    runs: requireData(runs.data, runs.error),
  };
}

export async function updateCompetitorTracking(
  competitorId: string,
  status: CompetitorTrackingStatus,
): Promise<void> {
  const { error } = await supabase.schema("seo").rpc(
    "update_competitor_tracking",
    {
      p_competitor_id: competitorId,
      p_tracking_status: status,
      p_human_ruling: { source: "competitor_workspace" },
    },
  );
  if (error) throw error;
}

export async function updateOpportunityStatus(
  opportunityId: string,
  status: OpportunityStatus,
): Promise<void> {
  const { error } = await supabase.schema("seo").rpc(
    "update_competitor_opportunity_status",
    {
      p_opportunity_id: opportunityId,
      p_status: status,
    },
  );
  if (error) throw error;
}
