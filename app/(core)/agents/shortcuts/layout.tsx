import React from "react";
import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agents", {
  titlePrefix: "Shortcuts",
  title: "Agents",
  description: "Manage your personal agent shortcuts",
  letter: "AG",
});

export default async function UserAgentShortcutsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Guests never see the shortcuts workspace — bounce to the /agents landing
  // (same server-side convention as /agents/all).
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/agents");

  return <>{children}</>;
}
