import { SITE_COLUMNS } from "@/features/marketing/data/service";
import type { Json } from "@/types/database.types";
import type { MarketingSite } from "@/features/marketing/types";
import { createClient } from "@/utils/supabase/client";
import { authenticatedWebDb } from "@/utils/supabase/webDb";
import { guardedUpdate } from "@ai-matrx/data/db";
import type { publishedToWebPatch } from "@/lib/row-access";

export interface SiteSettingsInput {
  siteId: string;
  expectedVersion: number;
  name: string;
  status: MarketingSite["status"];
  shownTo: MarketingSite["shown_to"];
  /** Present only when the owner flipped "Published to the web" in this save. */
  publishedToWeb?: ReturnType<typeof publishedToWebPatch>;
  settings: Json;
}

export async function updateSiteSettings(
  input: SiteSettingsInput,
): Promise<MarketingSite> {
  const supabase = createClient();
  const db = await authenticatedWebDb(supabase);
  const result = await guardedUpdate<MarketingSite & { version: number }>({
    expectedVersion: input.expectedVersion,
    applyUpdate: ({ expectedVersion, nextVersion }) =>
      db
        .from("site")
        .update({
          name: input.name,
          status: input.status,
          shown_to: input.shownTo,
          ...(input.publishedToWeb ?? {}),
          settings: input.settings,
          version: nextVersion,
        })
        .eq("id", input.siteId)
        .eq("version", expectedVersion)
        .is("deleted_at", null)
        .select(SITE_COLUMNS)
        .maybeSingle(),
    fetchCurrent: () =>
      db
        .from("site")
        .select(SITE_COLUMNS)
        .eq("id", input.siteId)
        .is("deleted_at", null)
        .maybeSingle(),
  });
  if (result.status !== "saved") {
    throw new Error(
      "This site changed while you were editing. Reload its settings and try again.",
    );
  }
  return result.row;
}
