// File: app/(core)/data/layout.tsx

import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import TablesLanding from "@/features/auth/components/module-landing/landings/TablesLanding";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

// Generate metadata with automatic favicon for the Data/Tables route
export const metadata = createRouteMetadata("/data", {
  title: "Tables",
  description: "Manage your data tables",
  letter: "L",
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
    <div className="h-full w-full overflow-y-auto overflow-x-hidden bg-muted/40 text-foreground scrollbar-none">
      {children}
    </div>
  );
}
