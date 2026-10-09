// features/applets-host/resolve-applet-route.ts — which Applet `/applets/<slug>` names, and what THIS viewer gets there.
//
// Shared by the route's layout (which keeps the Applet mounted across its pages) and its page (which owns the
// introductory page, the sign-in redirect and the not-found answer), so both decide the same way:
//   - a template's address is always its introductory page ("Use this template" installs a copy);
//   - a signed-in viewer runs it when row security lets their own client read the slug;
//   - a signed-out visitor RUNS a published, public Applet on the guest lane (its jobs ride the guest
//     identity; it has no reach into anyone's data) — the one address a shared Applet has;
//   - a signed-out visitor of any other Applet gets the introductory page when the owner published one,
//     else is sent to sign in — unless the address names an ARCHIVED Applet, which says it is no longer
//     available, or names nothing at all, which is not found (live audit 2026-10-09, A2: both sent a
//     stranger to sign in, so every broken public link read as "you need an account").
import "server-only";
import { cache } from "react";
import { isUuidShape } from "@ai-matrx/kit/uuid";
import { DEFINITION_COLUMNS } from "@ai-matrx/applets/platform";

import { readAppletIntro } from "@/features/marketing/applets/publicApplets.server";
import type { AppletIntro } from "@/features/marketing/applets/types";
import type { Database } from "@/types/database.types";
import { getScriptSupabaseClient } from "@/utils/supabase/getScriptClient";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { createClient } from "@/utils/supabase/server";

/** The Applet `slug` (or, UUID-shaped, its id) names for THIS viewer (their own server client: row security decides). */
export const resolveAppletRoute = cache(async (slug: string): Promise<{ id: string; slug: string; name: string; entry: string | null; created_by: string | null } | null> => {
  const supabase = await createClient();
  const read = async (column: "slug" | "id") => {
    const { data, error } = await supabase.schema("app").from("definition").select("id, slug, name, entry, created_by").eq(column, slug).is("deleted_at", null).maybeSingle();
    if (error) throw new Error(`Could not read the Applet "${slug}": ${error.message}`);
    return data ?? null;
  };
  // A UUID-shaped address is the slug first, then the Applet's id (links built from the id, old owner links).
  return (await read("slug")) ?? (isUuidShape(slug) ? await read("id") : null);
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
  /** The address named an Applet that has been archived: it is no longer available (never "sign in"). */
  | { kind: "gone" }
  | { kind: "missing" };

/**
 * What an address names when the visitor cannot read it: an archived Applet, a live one they may not
 * open, or nothing. Asked with the server's own key and answering only that one word — never the name,
 * the owner or any field — so a stranger learns no more than the link itself said.
 */
export const appletAddressFate = cache(async (key: string): Promise<"archived" | "exists" | "none"> => {
  const admin = createAdminClient();
  const read = async (column: "slug" | "id") => {
    const { data, error } = await admin.schema("app").from("definition").select("deleted_at").eq(column, key).maybeSingle();
    if (error) throw new Error(`Could not check the Applet address "${key}": ${error.message}`);
    return data ?? null;
  };
  const row = (await read("slug")) ?? (isUuidShape(key) ? await read("id") : null);
  if (!row) return "none";
  return row.deleted_at ? "archived" : "exists";
});

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
  if (intro) return { kind: "intro", intro };
  const fate = await appletAddressFate(key);
  if (fate === "archived") return { kind: "gone" };
  if (fate === "none") return { kind: "missing" };
  return { kind: "sign-in" };
}

/**
 * The Applet's `app.definition` row, read while the page renders, through THIS viewer's own server client
 * (row security decides: a signed-out visitor reads only a published public Applet — the same rows the
 * browser's guest read answers). Handed to the host as `definition`, so the Applet's first `record()` never
 * waits for hydration to ask again. Null when the read is refused or empty: the browser then reads, and says
 * why when it cannot.
 */
export const readAppletDefinition = cache(async (id: string): Promise<Record<string, unknown> | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("app").from("definition").select(DEFINITION_COLUMNS).eq("id", id).is("deleted_at", null).maybeSingle();
  if (error || !data) return null;
  return data as Record<string, unknown>;
});
