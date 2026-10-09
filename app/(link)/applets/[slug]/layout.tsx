// app/(link)/applets/[slug]/layout.tsx — THE APPLET STAYS MOUNTED WHILE ITS PAGES CHANGE.
//
// An Applet's pages are `/applets/<slug>/<page…>`, the `[[...path]]` segment below. A Next page REMOUNTS when
// that segment changes, so mounting the Applet in the page rebuilt its host, recompiled its files and
// re-read every row on each page change and on browser Back (2026-10-06: Back showed the old page, then an
// empty shell, then content at ~10 s). Mounted here, the Applet survives every page change; its frame
// follows the URL through the host's nav port. The page keeps the introductory page, the sign-in redirect,
// the not-found answer and the guest attribution row. Both decide through `resolveAppletView`.
import type { ReactNode } from "react";

import { AppletHostMount } from "@/features/applets-host/AppletHostMount";
import { AppletOwnerBar } from "@/features/applets-host/AppletOwnerBar";
import { AppletProviders } from "@/features/applets-host/AppletProviders";
import { ShellCanvasColumn } from "@/features/canvas/host/ShellCanvasColumn";
import { readAppletDefinition, resolveAppletRoute, resolveAppletView } from "@/features/applets-host/resolve-applet-route";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";

// Every view at this address (the running Applet, its introductory page, the not-found answers) renders inside
// `AppletProviders` — the short provider list a running Applet reaches, not the whole app's (see that file),
// plus the ONE canvas front door: agent output on an Applet opens INTO it.
export default async function AppletLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  return (
    <AppletProviders>
      <AppletView params={params}>{children}</AppletView>
      <ShellCanvasColumn />
    </AppletProviders>
  );
}

async function AppletView({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { isAuthenticated, user } = await getSessionVerdict();
  const view = await resolveAppletView(decodeURIComponent(slug), isAuthenticated);
  // An id-shaped address is redirected to the Applet's slug by the page; mount only at the canonical one.
  if (view.kind !== "run" || view.slug !== decodeURIComponent(slug)) return <>{children}</>;
  // Its maker gets a way back (audit R4); `resolveAppletRoute` is the same cached read the view used.
  // The Applet's own row is read HERE, beside the view, so the browser does not ask again after hydration.
  const [own, definition] = await Promise.all([
    isAuthenticated && view.guest === null ? resolveAppletRoute(view.slug) : null,
    readAppletDefinition(view.id),
  ]);
  const isMaker = Boolean(own && user && own.created_by === user.id);
  return (
    <main className="min-h-dvh bg-background text-foreground">
      {isMaker ? <AppletOwnerBar appletId={view.id} /> : null}
      <AppletHostMount appletId={view.id} slug={view.slug} definition={definition} />
      {children}
    </main>
  );
}
