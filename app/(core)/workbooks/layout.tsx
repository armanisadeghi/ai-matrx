import React from "react";

import { createRouteMetadata } from "@/utils/route-metadata";
import WorkbooksLanding from "@/features/auth/components/module-landing/landings/WorkbooksLanding";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

export const metadata = createRouteMetadata("/workbooks", {
  title: "Workbooks",
  description: "Lossless spreadsheet workbooks",
  letter: "B",
});

/**
 * Server-side auth branch — keeps the `"use client"` workbooks page
 * (Univer engine + spreadsheet runtime + service calls) from shipping
 * to guests. Guests see the marketing landing; authed users get the
 * existing background-styled workspace wrapper.
 */
export default async function WorkbooksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) return <WorkbooksLanding />;
  return (
    <div className="w-full h-full bg-background text-foreground scrollbar-none">
      {children}
    </div>
  );
}
