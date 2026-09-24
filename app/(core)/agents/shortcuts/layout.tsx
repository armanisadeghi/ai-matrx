import React from "react";
import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agents", {
  titlePrefix: "Shortcuts",
  title: "Agents",
  description: "Manage your personal agent shortcuts",
  letter: "SX",
});

export default async function UserAgentShortcutsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Guests never see the shortcuts workspace — bounce to the /agents landing
  // (same server-side convention as /agents/all).
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect("/agents");

  return <>{children}</>;
}
