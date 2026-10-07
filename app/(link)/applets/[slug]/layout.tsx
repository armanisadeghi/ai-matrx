// app/(link)/applets/[slug]/layout.tsx — THE APPLET STAYS MOUNTED WHILE ITS PAGES CHANGE.
//
// An Applet's pages are `/applets/<slug>/<page…>`, the `[[...path]]` segment below. A Next page REMOUNTS when
// that segment changes, so mounting the Applet in the page rebuilt its host, recompiled its files and
// re-read every row on each page change and on browser Back (2026-10-06: Back showed the old page, then an
// empty shell, then content at ~10 s). Mounted here, the Applet survives every page change; its frame
// follows the URL through the host's nav port. The page keeps the sign-in redirect and the not-found answer.
import type { ReactNode } from "react";

import { AppletHostMount } from "@/features/applets-host/AppletHostMount";
import { resolveAppletRoute } from "@/features/applets-host/resolve-applet-route";
import { showsAppletIntro } from "@/features/marketing/applets/publicApplets.server";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";

export default async function AppletLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { isAuthenticated } = await getSessionVerdict();
  // A template's address is its introductory page (the page renders it), never a running copy.
  const intro = isAuthenticated ? await showsAppletIntro(decodeURIComponent(slug), true) : null;
  const applet = isAuthenticated && !intro ? await resolveAppletRoute(slug) : null;
  if (!applet) return <>{children}</>;
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <AppletHostMount appletId={applet.id} slug={applet.slug} />
      {children}
    </main>
  );
}
