import { SITE_COLUMNS } from "@/features/marketing/data/service";
import type { Json } from "@/types/database.types";
import type { MarketingSite } from "@/features/marketing/types";
import { createClient } from "@/utils/supabase/client";
import { authenticatedWebDb } from "@/utils/supabase/webDb";

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
  const response = await (
    await authenticatedWebDb(supabase)
  )
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
      SITE_COLUMNS,
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
