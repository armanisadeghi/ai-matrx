import React from "react";

import { createRouteMetadata } from "@/utils/route-metadata";
import DocumentsLanding from "@/features/auth/components/module-landing/landings/DocumentsLanding";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

export const metadata = createRouteMetadata("/documents", {
  title: "Documents",
  description: "Cloud documents with realtime collaboration",
});

/**
 * Server-side auth branch — keeps the `"use client"` documents page
 * (Univer docs engine + service calls) from shipping to guests. Guests see
 * the marketing landing; authed users get the workspace wrapper. Mirrors
 * the workbooks layout — the cloud-document twin of the cloud-workbook surface.
 */
export default async function DocumentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) return <DocumentsLanding />;
  return (
    <div className="w-full h-full bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-200 scrollbar-none">
      {children}
    </div>
  );
}
