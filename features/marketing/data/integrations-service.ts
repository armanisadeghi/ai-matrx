import { SITE_COLUMNS } from "@/features/marketing/data/service";
import type { Json } from "@/types/database.types";
import type { MarketingSite } from "@/features/marketing/types";
import { createClient } from "@/utils/supabase/client";
import { authenticatedWebDb } from "@/utils/supabase/webDb";

export interface UpdateSiteIntegrationsInput {
  siteId: string;
  expectedVersion: number;
  integrations: Json;
}

export async function updateSiteIntegrations(
  input: UpdateSiteIntegrationsInput,
): Promise<MarketingSite> {
  const supabase = createClient();
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("site")
    .update({ integrations: input.integrations })
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
      "This site's integrations changed while you were editing. Reload and try again.",
    );
  }
  return response.data;
}
