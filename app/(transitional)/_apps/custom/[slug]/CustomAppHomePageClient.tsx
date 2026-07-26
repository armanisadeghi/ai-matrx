// app/(authenticated)/apps/custom/[slug]/CustomAppHomePageClient.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { HomeApplet } from "@/features/applet/home/HomeApplet";

interface CustomAppHomePageClientProps {
  slug: string;
}

export default function CustomAppHomePageClient({
  slug,
}: CustomAppHomePageClientProps) {
  const router = useRouter();

  // Navigate to applet
  const navigateToApplet = (appletSlug: string) => {
    router.push(`/apps/custom/${slug}/${appletSlug}`);
  };

  // app display variant options: "default" | "banner" | "minimal" | "sideBySide" | "modern" | "QuarterThreeQuarters" | "modernGlass"
  // applet card variant options: "default" | "mx-glass" | "modern" | "simple" | "compact" | "enhanced"
  // main layout variant options: "default" | "grid" | "sidebar"
  return (
    <HomeApplet
      navigateToApplet={navigateToApplet}
      appDisplayVariant="modern"
      appletCardVariant="enhanced"
      mainLayoutVariant="sidebar"
    />
  );
}
