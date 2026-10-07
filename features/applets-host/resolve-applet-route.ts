// features/applets-host/resolve-applet-route.ts — which Applet `/applets/<slug>` names, for THIS viewer.
//
// Read through the viewer's own server client: row security decides whether the slug resolves. Shared by
// the route's layout (which keeps the Applet mounted across its pages) and its page (which owns the
// sign-in redirect and the not-found answer), so both read the slug the same way.
import { createClient } from "@/utils/supabase/server";

export async function resolveAppletRoute(slug: string): Promise<{ id: string; slug: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("app").from("definition").select("id, slug").eq("slug", slug).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(`Could not read the app "${slug}": ${error.message}`);
  return data ?? null;
}
