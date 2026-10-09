// app/(link)/applets/[slug]/[[...path]]/page.tsx — AN APPLET, AT aimatrx.com/applets/<slug>/<page…>.
//
// In `(link)`: the Applet is the whole screen, no product shell. This is the ONE address an Applet has —
// the owner's, a teammate's, and the one a stranger is sent. What a viewer gets is `resolveAppletView`,
// shared with `../layout.tsx` (which mounts the running Applet, so it is NOT remounted when its page
// changes; for a running Applet this page renders nothing of its own but the guest attribution row):
//   - a template: its introductory page ("Use this template" installs a copy);
//   - signed in: the running Applet, read through the viewer's own client — row security decides;
//   - signed out, a published public Applet: the running Applet on the guest lane, with the one
//     attribution row a shared link carries (`?embed=widget` drops it for an iframe);
//   - signed out, anything else: the introductory page when the owner published one, else sign in.
// `build` and `manage` are owner-tool routes in `(core)/applets`, never an Applet's address
// (`features/applets/reserved-slugs.ts`).

import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";

import { MadeWithAiMatrx } from "@/components/matrx/MadeWithAiMatrx";
import { readPublicApplet, resolveAppletRoute, resolveAppletView } from "@/features/applets-host/resolve-applet-route";
import { getAppletIconsMetadata } from "@/features/applets/utils/favicon-metadata";
import { AppletIntroPage } from "@/features/marketing/applets/AppletIntroPage";
import { readAppletIntro, readPublicApplets } from "@/features/marketing/applets/publicApplets.server";
import { appletHref } from "@/features/marketing/applets/types";
import { searchEngineRobots } from "@/lib/seo/search-engine-indexed.server";
import { loginHref } from "@/utils/auth/auth-destination";
import { createRouteMetadata } from "@/utils/route-metadata";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";

type Props = { params: Promise<{ slug: string; path?: string[] }>; searchParams: Promise<{ embed?: string }> };

const RELATED = 6;
/** Owner-tool segments the retired `/agent-apps/<id>/…` routes carried after the id. */
const OWNER_TOOL_SEGMENTS = new Set(["run", "code", "settings", "versions", "v"]);

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { slug, path = [] } = await params;
  const key = decodeURIComponent(slug);
  const applet = path.length ? null : await readAppletIntro(key);
  if (!applet) {
    // A public Applet with no introductory page still names itself to a link preview.
    const shared = path.length ? null : await readPublicApplet(key);
    if (!shared) {
      // Anything else (a draft its owner is previewing, a private Applet) names itself only to whoever can read it.
      const own = path.length ? null : await resolveAppletRoute(key);
      return { title: own ? `${own.name} | Applet` : "Applet", robots: { index: false, follow: true } };
    }
    const description = shared.tagline || shared.description || undefined;
    return {
      ...createRouteMetadata(appletHref(shared.slug), { title: "Applet", titlePrefix: shared.name, description, canonicalPath: appletHref(shared.slug) }),
      robots: await searchEngineRobots([{ type: "app", key: shared.slug }]),
      icons: getAppletIconsMetadata(shared.favicon_url, shared.name),
      ...(shared.preview_image_url
        ? { openGraph: { title: shared.name, description, images: [shared.preview_image_url] }, twitter: { card: "summary_large_image", title: shared.name, description, images: [shared.preview_image_url] } }
        : {}),
    };
  }
  const href = appletHref(applet.slug);
  const meta = createRouteMetadata(href, {
    // Most specific first, like every Applet tab: "<Name> | Applet — AI Matrx".
    title: applet.template ? "Applet template" : "Applet",
    titlePrefix: applet.name,
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

export default async function AppletRoute({ params, searchParams }: Props) {
  const { slug, path = [] } = await params;
  const { embed } = await searchParams;
  const here = `/applets/${slug}${path.length ? `/${path.join("/")}` : ""}`;
  const { isAuthenticated } = await getSessionVerdict();
  const key = decodeURIComponent(slug);
  const view = await resolveAppletView(key, isAuthenticated);
  if (view.kind === "sign-in") redirect(loginHref(here));
  if (view.kind === "missing") notFound();
  // A build that has not saved an app yet is still being built: open the build, never a broken Applet.
  if (view.kind === "unbuilt") redirect(`/applets/build/${view.id}`);
  if (view.kind === "intro") {
    const { intro } = view;
    if (intro.slug !== key || path.length) permanentRedirect(appletHref(intro.slug));
    const related = (await readPublicApplets(true)).filter((c) => c.id !== intro.id).slice(0, RELATED);
    return (
      <main className="min-h-dvh overflow-y-auto">
        <AppletIntroPage applet={intro} related={related} />
      </main>
    );
  }
  // An old owner link (`/applets/<id>/run|code|settings|versions…`, from the retired /agent-apps routes) opens what it
  // meant: `run` is the Applet itself; the owner tools live under /applets/manage/<id>.
  if (view.slug !== key && OWNER_TOOL_SEGMENTS.has(path[0] ?? "")) {
    if (path[0] === "run") permanentRedirect(appletHref(view.slug));
    redirect(`/applets/manage/${view.id}/${path.map(encodeURIComponent).join("/")}`);
  }
  // An id-shaped address answers at the Applet's slug, so it has one address.
  if (view.slug !== key) permanentRedirect(`${appletHref(view.slug)}${path.length ? `/${path.map(encodeURIComponent).join("/")}` : ""}`);
  if (view.guest && embed !== "widget") return <MadeWithAiMatrx publisherName={view.guest.publisher_name} />;
  return null;
}
