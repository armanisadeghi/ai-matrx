import type { Json } from "@/types/database.types";
import type { MarketingSite } from "@/features/marketing/types";
import { createClient } from "@/utils/supabase/client";
import { webDb } from "@/utils/supabase/webDb";

export interface SiteSettingsInput {
  siteId: string;
  expectedVersion: number;
  name: string;
  status: MarketingSite["status"];
  visibility: MarketingSite["visibility"];
  settings: Json;
}

export async function updateSiteSettings(
  input: SiteSettingsInput,
): Promise<MarketingSite> {
  const supabase = createClient();
  const response = await webDb(supabase)
    .from("site")
    .update({
      name: input.name,
      status: input.status,
      visibility: input.visibility,
      settings: input.settings,
    })
    .eq("id", input.siteId)
    .eq("version", input.expectedVersion)
    .is("deleted_at", null)
    .select(
      "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, name, root_url, domain, status, visibility, integrations, homepage_screenshot_id, settings",
    )
    .maybeSingle();
  if (response.error) throw new Error(response.error.message);
  if (!response.data) {
    throw new Error(
      "This site changed while you were editing. Reload its settings and try again.",
    );
  }
  return response.data;
}
