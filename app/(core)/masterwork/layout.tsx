import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createRouteMetadata } from "@/utils/route-metadata";
import { currentRequestLoginHref } from "@/utils/auth/server-login-href";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

export const metadata = createRouteMetadata("/masterwork", {
  title: "Masterwork",
  description:
    "Your expertise as rules you approve — built into a system that works exactly your way, proven against plain AI.",
  letter: "M",
});

/**
 * `/masterwork` is the public module landing. Every other Masterwork route is
 * a private workspace, except Vision Interview which owns its intentional
 * server-rendered guest gate below. Keeping this boundary at the route root
 * means a new private sibling cannot accidentally bypass it by sitting beside
 * the Rulebook `[id]` tree (as Encore previously did).
 */
export default async function MasterworkLayout({
  children,
}: {
  children: ReactNode;
}) {
  const requestHeaders = await headers();
  const pathname = requestHeaders.get("x-pathname") || "/masterwork";
  const hasGuestLanding =
    pathname === "/masterwork" ||
    pathname.startsWith("/masterwork/vision-interview");

  if (hasGuestLanding) return children;

  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    redirect(await currentRequestLoginHref("/masterwork"));
  }

  return children;
}
