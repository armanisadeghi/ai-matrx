// app/(public)/applets/[slug]/page.tsx — ONE APPLET'S INTRODUCTORY PAGE (AP-0 item 9, lane E).
// Server-rendered from the public door (only what the owner published to the web), indexable when
// the owner's search-engine switch allows it. The Applet itself runs at /apps/<slug>.

import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { createRouteMetadata } from "@/utils/route-metadata";
import { searchEngineRobots } from "@/lib/seo/search-engine-indexed.server";
import { AppletIntroPage } from "@/features/marketing/applets/AppletIntroPage";
import { readAppletIntro, readPublicApplets } from "@/features/marketing/applets/publicApplets.server";
import { appletIntroHref } from "@/features/marketing/applets/types";

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };

const RELATED = 6;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const applet = await readAppletIntro(decodeURIComponent(slug));
  if (!applet) return { title: "App", robots: { index: false, follow: true } };
  const path = appletIntroHref(applet.slug);
  const meta = createRouteMetadata(path, {
    title: applet.name,
    titlePrefix: applet.template ? "App template" : "App",
    description: applet.tagline ? `${applet.tagline}. ${applet.description ?? ""}`.trim() : (applet.description ?? undefined),
    canonicalPath: path,
    keywords: [...applet.tags, applet.category ?? "", applet.template ? "app template" : "custom app", "no-code app"].filter(Boolean),
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

export default async function AppletIntroRoute({ params }: Props) {
  const { slug } = await params;
  const key = decodeURIComponent(slug);
  const applet = await readAppletIntro(key);
  if (!applet) notFound();
  if (applet.slug !== key) permanentRedirect(appletIntroHref(applet.slug));
  const related = (await readPublicApplets(true)).filter((c) => c.id !== applet.id).slice(0, RELATED);
  return <AppletIntroPage applet={applet} related={related} />;
}
