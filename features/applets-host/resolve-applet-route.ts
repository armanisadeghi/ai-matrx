// features/applets-host/resolve-applet-route.ts — which Applet `/applets/<slug>` names, and what THIS viewer gets there.
//
// Shared by the route's layout (which keeps the Applet mounted across its pages) and its page (which owns the
// introductory page, the sign-in redirect and the not-found answer), so both decide the same way:
//   - a template's address is always its introductory page ("Use this template" installs a copy);
//   - a signed-in viewer runs it when row security lets their own client read the slug;
//   - a signed-out visitor RUNS a published, public Applet on the guest lane (its jobs ride the guest
//     identity; it has no reach into anyone's data) — the one address a shared Applet has;
//   - a signed-out visitor of any other Applet gets the introductory page when the owner published one,
//     else is sent to sign in.
import "server-only";
import { cache } from "react";
import { isUuidShape } from "@ai-matrx/kit/uuid";

import { readAppletIntro } from "@/features/marketing/applets/publicApplets.server";
import type { AppletIntro } from "@/features/marketing/applets/types";
import type { Database } from "@/types/database.types";
import { getScriptSupabaseClient } from "@/utils/supabase/getScriptClient";
import { createClient } from "@/utils/supabase/server";

/** The Applet `slug` names for THIS viewer (their own server client: row security decides). */
export const resolveAppletRoute = cache(async (slug: string): Promise<{ id: string; slug: string; name: string; entry: string | null } | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("app").from("definition").select("id, slug, name, entry").eq("slug", slug).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(`Could not read the Applet "${slug}": ${error.message}`);
  if (data || !isUuidShape(slug)) return data ?? null;
  // An id-shaped address (older links, the owner pages' ids) names the same Applet; the page redirects it to the slug.
  const byId = await supabase.schema("app").from("definition").select("id, slug, name, entry").eq("id", slug).is("deleted_at", null).maybeSingle();
  if (byId.error) throw new Error(`Could not read the Applet "${slug}": ${byId.error.message}`);
  return byId.data ?? null;
});

export type PublicApplet = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  preview_image_url: string | null;
  favicon_url: string | null;
  publisher_name: string | null;
};

/**
 * A published, public Applet a signed-out visitor may run (`get_aga_public_data`: status published +
 * visibility public), asked with the publishable key and no session. A UUID-shaped address is tried as
 * the slug and then as the id (Applets whose slug was minted from a uuid — feedback c59b2e74).
 */
export const readPublicApplet = cache(async (key: string): Promise<PublicApplet | null> => {
  const sb = getScriptSupabaseClient();
  const ask = async (args: { p_slug?: string; p_app_id?: string }) => {
    const { data, error } = await sb.rpc("get_aga_public_data", args);
    if (error) throw new Error(`The public Applet "${key}" could not be read: ${error.message}`);
    const rows = data as Database["public"]["Functions"]["get_aga_public_data"]["Returns"] | null;
    return rows?.[0] ?? null;
  };
  const row = (await ask({ p_slug: key })) ?? (isUuidShape(key) ? await ask({ p_app_id: key }) : null);
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    preview_image_url: row.preview_image_url,
    favicon_url: row.favicon_url,
    publisher_name: row.publisher_name,
  };
});

export type AppletView =
  | { kind: "intro"; intro: AppletIntro }
  | { kind: "run"; id: string; slug: string; guest: PublicApplet | null }
  /** A build still being made (born empty at Build, no app saved yet): it opens as its build. */
  | { kind: "unbuilt"; id: string }
  | { kind: "sign-in" }
  | { kind: "missing" };

/** What `/applets/<key>` shows this viewer. */
export async function resolveAppletView(key: string, signedIn: boolean): Promise<AppletView> {
  const intro = await readAppletIntro(key);
  if (intro?.template) return { kind: "intro", intro };
  if (signedIn) {
    const applet = await resolveAppletRoute(key);
    if (!applet) return { kind: "missing" };
    return applet.entry ? { kind: "run", id: applet.id, slug: applet.slug, guest: null } : { kind: "unbuilt", id: applet.id };
  }
  const guest = await readPublicApplet(key);
  if (guest) return { kind: "run", id: guest.id, slug: guest.slug, guest };
  return intro ? { kind: "intro", intro } : { kind: "sign-in" };
}
