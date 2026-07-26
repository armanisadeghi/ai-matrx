// app/(authenticated)/apps/custom/[slug]/page.tsx

import React from "react";
import { getAppData } from "@/utils/server/appDataCache";
import CustomAppHomePageClient from "./CustomAppHomePageClient";
import AppNotFoundPage from "./AppNotFoundPage";

export default async function CustomAppHomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolvedParams = await params;
  const { slug } = resolvedParams;

  // Check if app exists
  const data = await getAppData(slug);

  if (!data || !data.app_config) {
    return <AppNotFoundPage />;
  }

  return <CustomAppHomePageClient slug={slug} />;
}
