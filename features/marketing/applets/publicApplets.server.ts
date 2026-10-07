// features/marketing/applets/publicApplets.server.ts — the signed-out reads of the Applet public face.
//
// Asked with the publishable key and no session (never a secret key, never a cookie), so a page shows
// exactly what a crawler may see. Shared by a page and its metadata in one request.

import "server-only";
import { cache } from "react";

import { getScriptSupabaseClient } from "@/utils/supabase/getScriptClient";

import type { AppletCard, AppletIntro } from "./types";

/** One published Applet's introductory face by slug (or id); null when nothing published answers. */
export const readAppletIntro = cache(async (slug: string): Promise<AppletIntro | null> => {
  const sb = getScriptSupabaseClient();
  const { data, error } = await sb.schema("public").rpc("applet_public_intro", { p_slug: slug });
  if (error) throw new Error(`The Applet's public page could not be read: ${error.message}`);
  return (data as AppletIntro | null) ?? null;
});

/** Every published Applet's card, or only the templates. Throws: an empty gallery is never a silent stand-in. */
export const readPublicApplets = cache(async (templatesOnly: boolean): Promise<AppletCard[]> => {
  const sb = getScriptSupabaseClient();
  const { data, error } = await sb.schema("public").rpc("applets_public", { p_templates_only: templatesOnly });
  if (error) throw new Error(`The published Applets could not be read: ${error.message}`);
  return (data as AppletCard[] | null) ?? [];
});
