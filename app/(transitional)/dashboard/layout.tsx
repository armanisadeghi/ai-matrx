import React from "react";
import { redirect } from "next/navigation";
import { createRouteMetadata } from "@/utils/route-metadata";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { isNewUser, WELCOME_ROUTE } from "@/utils/onboarding";

export const metadata = createRouteMetadata("/dashboard", {
  title: "Dashboard",
  description: "Your central hub for all activities and insights",
});

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // First-login funnel: new users (onboarding not yet completed) get the
  // simpler /welcome screen instead of the full dashboard. The flag lives on
  // user_metadata, so this reuses the request-cached getUser() — no extra
  // query. Once the flag flips, this falls through and the dashboard renders.
  const { user } = await getServerAuth();
  if (user && isNewUser(user)) {
    redirect(WELCOME_ROUTE);
  }

  return children;
}
