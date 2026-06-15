import ContextLayoutClient from "./ContextLayoutClient";
import { createRouteMetadata } from "@/utils/route-metadata";
import ContextLanding from "@/features/auth/components/module-landing/landings/ContextLanding";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

export const metadata = createRouteMetadata("/agent-context", {
  title: "Agent Context",
  description: "Browse and manage agent context items and hierarchy.",
  letter: "X",
});

/**
 * Server-side auth branch keeps the `"use client"` Context shell (and
 * its scope-resolution Redux bundle) from shipping to guests. Guests
 * see the marketing landing; authed users get the live client shell.
 */
export default async function ContextLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) return <ContextLanding />;
  return <ContextLayoutClient>{children}</ContextLayoutClient>;
}
