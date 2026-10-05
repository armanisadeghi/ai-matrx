// features/make/gallery/publicCatalogue.server.ts — LANE MAKE-HOME (v6), wave 4b.
//
// The signed-out read of the catalogue for /templates, its pages and the sitemap, through the public door
// `public.templates_public` (platform cards only, the same card shape as `custom.templates`; v7 TEMPLATES). It asks with the
// publishable key and no session (never a secret key, never a cookie), so the page shows exactly what
// a crawler may see. Shared by a page and its metadata in one request.

import "server-only";
import { cache } from "react";

import { getScriptSupabaseClient } from "@/utils/supabase/getScriptClient";

import { platformFilter, readPublicCatalogueWith, type PublicRead } from "./publicGallery";

async function readOnce(): Promise<PublicRead> {
  const sb = getScriptSupabaseClient();
  return readPublicCatalogueWith((offset) => sb.schema("public").rpc("templates_public", { p_filter: platformFilter(offset) }));
}

export const readPublicCatalogue = cache(async (): Promise<PublicRead> => {
  const read = await readOnce();
  if (read.state === "closed") {
    console.warn(
      `[templates] the public gallery is empty because public.templates_public is ${read.reason === "absent" ? "not on this database" : "refused to a signed-out caller"}. ` +
        "Remedy: apply migrations/campaign/templates7_a_anyone_can_browse_the_platform_templates.sql.",
    );
  }
  return read;
});
