// File: app/(core)/data/layout.tsx

import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import TablesLanding from "@/features/auth/components/module-landing/landings/TablesLanding";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { ScrollAssistantLauncher } from "@ai-matrx/chat/agents/components/ambient-assistant/ScrollAssistantLauncher";

// The Data home and every table/record page under it (moved from /data, 2026-10-04).
export const metadata = createRouteMetadata("/data", {
  title: "Data",
  description: "Work with your organization's shared records, tables, and assigned actions.",
  letter: "DA",
});

/**
 * Server-side auth branch — guests get the marketing landing without
 * the `"use client"` table-editor bundle loading; authed users get the
 * record-store pages exactly as they mount (no wrapper of their own).
 */
export default async function DataLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) return <TablesLanding />;
  return (
    <>
      {children}
      <ScrollAssistantLauncher
        inputVariant="single-line"
        includePathnames={["/data"]}
      />
    </>
  );
}
