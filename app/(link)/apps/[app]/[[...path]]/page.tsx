// app/(link)/apps/[app]/[[...path]]/page.tsx — AN APP AN AGENT BUILT FOR A PERSON, AT aimatrx.com/apps/<slug>.
//
// In `(link)`: the app is the whole screen, no product shell. Signed-in only — the app reads and writes
// the person's tables as the viewer, so a signed-out visitor is sent to sign in and brought back.
import { notFound, redirect } from "next/navigation";

import { personApp } from "@/features/person-apps/registry";
import { PersonAppMount } from "@/features/person-apps/PersonAppMount";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";

export default async function PersonAppRoute({ params }: { params: Promise<{ app: string; path?: string[] }> }) {
  const { app, path = [] } = await params;
  if (!personApp(app)) notFound();
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect(`/login?redirectTo=${encodeURIComponent(`/apps/${app}${path.length ? `/${path.join("/")}` : ""}`)}`);
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <PersonAppMount slug={app} path={path} />
    </main>
  );
}
