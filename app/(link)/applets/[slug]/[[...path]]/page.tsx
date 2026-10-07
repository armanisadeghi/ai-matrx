// app/(link)/applets/[slug]/[[...path]]/page.tsx — AN APPLET, AT aimatrx.com/applets/<slug>/<page…>.
//
// In `(link)`: the Applet is the whole screen, no product shell. A signed-in viewer gets the running
// Applet — it reads and writes the viewer's own tables as the viewer, and the slug resolves against
// `app.definition` through the viewer's own client, so row security decides whether this person can
// open it. The Applet itself is mounted by `../layout.tsx`, so it is NOT remounted when its page
// changes; for a signed-in viewer this page renders nothing of its own.
//
// A signed-out visitor at the Applet's own address gets its introductory page when the owner
// published one to the web (server-rendered, indexable when the owner's search-engine switch allows
// it); its "Open" sends them to sign in and back here. With nothing published, they go to sign in.
// A template's address is always its introductory page ("Use this template" installs a copy) —
// `showsAppletIntro`, the one rule the layout shares so it never mounts a template.
// `build` and `manage` are owner-tool routes in `(core)/applets`, never an Applet's address
// (`features/applets/reserved-slugs.ts`).

import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";

import { resolveAppletRoute } from "@/features/applets-host/resolve-applet-route";
import { AppletIntroPage } from "@/features/marketing/applets/AppletIntroPage";
import { readAppletIntro, readPublicApplets, showsAppletIntro } from "@/features/marketing/applets/publicApplets.server";
import { appletHref } from "@/features/marketing/applets/types";
import { searchEngineRobots } from "@/lib/seo/search-engine-indexed.server";
import { loginHref } from "@/utils/auth/auth-destination";
import { createRouteMetadata } from "@/utils/route-metadata";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";

type Props = { params: Promise<{ slug: string; path?: string[] }> };

const RELATED = 6;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, path = [] } = await params;
  const applet = path.length ? null : await readAppletIntro(decodeURIComponent(slug));
  if (!applet) return { title: "Applet", robots: { index: false, follow: true } };
  const href = appletHref(applet.slug);
  const meta = createRouteMetadata(href, {
    title: applet.name,
    titlePrefix: applet.template ? "Applet template" : "Applet",
    description: applet.tagline ? `${applet.tagline}. ${applet.description ?? ""}`.trim() : (applet.description ?? undefined),
    canonicalPath: href,
    keywords: [...applet.tags, applet.category ?? "", applet.template ? "applet template" : "custom applet", "no-code applet"].filter(Boolean),
  });
  const shot = applet.screenshots[0]?.url ?? applet.preview_image_url;
  const robots = applet.template ? undefined : await searchEngineRobots([{ type: "app", key: applet.slug }]);
  return {
    ...meta,
    ...(robots ? { robots } : {}),
    ...(shot
      ? {
          openGraph: { ...meta.openGraph, images: [{ url: shot, alt: applet.name }] },
          twitter: { ...meta.twitter, card: "summary_large_image", images: [shot] },
        }
      : {}),
  };
}

export default async function AppletRoute({ params }: Props) {
  const { slug, path = [] } = await params;
  const here = `/applets/${slug}${path.length ? `/${path.join("/")}` : ""}`;
  const { isAuthenticated } = await getSessionVerdict();
  const key = decodeURIComponent(slug);
  const intro = await showsAppletIntro(key, isAuthenticated);
  if (!isAuthenticated && (!intro || path.length)) redirect(loginHref(here));
  if (intro) {
    if (intro.slug !== key || path.length) permanentRedirect(appletHref(intro.slug));
    const related = (await readPublicApplets(true)).filter((c) => c.id !== intro.id).slice(0, RELATED);
    return (
      <main className="min-h-dvh overflow-y-auto">
        <AppletIntroPage applet={intro} related={related} />
      </main>
    );
  }
  if (!(await resolveAppletRoute(slug))) notFound();
  return null;
}
