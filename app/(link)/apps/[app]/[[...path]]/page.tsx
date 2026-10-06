// app/(link)/apps/[app]/[[...path]]/page.tsx — AN APPLET, AT aimatrx.com/apps/<slug>/<page…>.
//
// In `(link)`: the Applet is the whole screen, no product shell. Signed-in only — it reads and writes
// the viewer's own tables as the viewer, so a signed-out visitor is sent to sign in and brought back.
// The slug resolves against `app.definition` through the viewer's own client: row security decides
// whether this person can open it. The Applet's code, pages, sources and jobs are its database
// record; `features/applets-host` builds its host and renders it.
import { notFound, redirect } from "next/navigation";

import { AppletHostMount } from "@/features/applets-host/AppletHostMount";
import { createClient } from "@/utils/supabase/server";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";

export default async function AppletRoute({ params }: { params: Promise<{ app: string; path?: string[] }> }) {
  const { app, path = [] } = await params;
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect(`/login?redirectTo=${encodeURIComponent(`/apps/${app}${path.length ? `/${path.join("/")}` : ""}`)}`);
  const supabase = await createClient();
  const { data, error } = await supabase.schema("app").from("definition").select("id, slug").eq("slug", app).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(`Could not read the app "${app}": ${error.message}`);
  if (!data) notFound();
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <AppletHostMount appletId={data.id} slug={data.slug} />
    </main>
  );
}
