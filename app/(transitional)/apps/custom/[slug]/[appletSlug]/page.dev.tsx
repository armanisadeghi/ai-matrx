// app/(authenticated)/apps/custom/[slug]/[appletSlug]/page.tsx

import React from "react";
import { redirect } from "next/navigation";
import { getAppData } from "@/utils/server/appDataCache";
import AppletPageClient from "./AppletPageClient";

export default async function AppletPage({
  params,
}: {
  params: Promise<{ slug: string; appletSlug: string }>;
}) {
  const resolvedParams = await params;
  const { slug, appletSlug } = resolvedParams;

  // Check if applet exists
  const data = await getAppData(slug);

  // If app doesn't exist, redirect will happen at the app page level
  // If applet doesn't exist but app does, redirect to app page
  if (data && data.app_config) {
    const applet = data.applets.find((a) => a.slug === appletSlug);
    if (!applet) {
      redirect(`/apps/custom/${slug}`);
    }
  }

  return <AppletPageClient slug={slug} appletSlug={appletSlug} />;
}
