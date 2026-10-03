// features/make/gallery/publicCatalogue.server.ts — LANE MAKE-HOME (v6), wave 4b.
//
// The signed-out read of the catalogue door for /templates, its pages and the sitemap. It asks with the
// publishable key and no session (never a secret key, never a cookie), so the page shows exactly what
// a crawler may see. Shared by a page and its metadata in one request.

import "server-only";
import { cache } from "react";

import { getScriptSupabaseClient } from "@/utils/supabase/getScriptClient";

import { platformFilter, readPublicCatalogueWith, type PublicRead } from "./publicGallery";

async function readOnce(): Promise<PublicRead> {
  const sb = getScriptSupabaseClient();
  return readPublicCatalogueWith((offset) => sb.schema("custom").rpc("templates", { p_filter: platformFilter(offset) }));
}

export const readPublicCatalogue = cache(async (): Promise<PublicRead> => {
  const read = await readOnce();
  if (read.state === "closed") {
    console.warn(
      `[templates] the public gallery is empty because custom.templates is ${read.reason === "absent" ? "not on this database" : "refused to a signed-out caller"}. ` +
        "Remedy: the chair lets the anonymous caller read platform cards through custom.templates.",
    );
  }
  return read;
});
