import type { Database } from "@/types/database.types";
import { supabase } from "@/utils/supabase/client";
import type {
  CompetitorTrackingStatus,
  OpportunityStatus,
} from "./autopsy-controls";

export type CompetitorRow = Database["seo"]["Tables"]["competitor"]["Row"];
export type CompetitorOpportunityRow =
  Database["seo"]["Tables"]["competitor_opportunity"]["Row"];
export type CompetitorRunRow =
  Database["seo"]["Tables"]["collection_run"]["Row"];
export type CompetitorSite = Pick<
  Database["web"]["Tables"]["site"]["Row"],
  "id" | "name" | "domain" | "root_url" | "brand_id"
>;

function requireData<T>(data: T | null, error: unknown): T {
  if (error) throw error;
  if (data === null) throw new Error("Supabase returned no competitor data.");
  return data;
}

export async function listCompetitorSites(): Promise<CompetitorSite[]> {
  const { data, error } = await supabase
    .schema("web")
    .from("site")
    .select("id,name,domain,root_url,brand_id")
    .is("deleted_at", null)
    .eq("status", "active")
    .order("name")
    .limit(250);
  return requireData(data, error);
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
