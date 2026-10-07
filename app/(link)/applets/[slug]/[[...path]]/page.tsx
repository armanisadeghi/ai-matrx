// app/(link)/applets/[slug]/[[...path]]/page.tsx — AN APPLET, AT aimatrx.com/applets/<slug>/<page…>.
//
// In `(link)`: the Applet is the whole screen, no product shell. Signed-in only — it reads and writes
// the viewer's own tables as the viewer, so a signed-out visitor is sent to sign in and brought back.
// The slug resolves against `app.definition` through the viewer's own client: row security decides
// whether this person can open it. The Applet itself is mounted by `../layout.tsx`, so it is NOT
// remounted when its page changes; this page renders nothing of its own.
import { notFound, redirect } from "next/navigation";

import { resolveAppletRoute } from "@/features/applets-host/resolve-applet-route";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";

export default async function AppletRoute({ params }: { params: Promise<{ app: string; path?: string[] }> }) {
  const { app, path = [] } = await params;
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect(`/login?redirectTo=${encodeURIComponent(`/applets/${app}${path.length ? `/${path.join("/")}` : ""}`)}`);
  if (!(await resolveAppletRoute(app))) notFound();
  return null;
}
