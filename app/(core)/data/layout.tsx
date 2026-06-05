// File: app/(core)/data/layout.tsx

import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import TablesLanding from "@/features/auth/components/module-landing/landings/TablesLanding";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

// Generate metadata with automatic favicon for the Data/Tables route
export const metadata = createRouteMetadata("/data", {
  title: "Tables",
  description: "Manage your data tables",
});

/**
 * Server-side auth branch — guests get the marketing landing without
 * the `"use client"` table-editor bundle loading; authed users get the
 * existing background-styled workspace wrapper.
 */
export default async function DataLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) return <TablesLanding />;
  return (
    <div className="w-full h-full bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-200 scrollbar-none">
      {children}
      <div className="h-24 bg-inherit" aria-hidden="true"></div>
    </div>
  );
}
