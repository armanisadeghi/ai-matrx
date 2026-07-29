// Server Component layout. Auth branch happens server-side via
// `getServerAuth()` (request-cached — no extra round-trip). Guests get the
// full `<MessagesLanding />` marketing page for /messages AND every
// sub-route (e.g. /messages/[conversationId]); authed users get the
// messaging workspace shell. Neither tree leaks into the other's bundle.

import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import MessagesLanding from "@/features/auth/components/module-landing/landings/MessagesLanding";
import MessagesLayoutClient from "./MessagesLayoutClient";

export const metadata = createRouteMetadata("/messages", {
  title: "Messages",
  description: "Direct messages and conversations",
  letter: "V",
});

export default async function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getServerAuth();

  if (!isAuthenticated) {
    // Guests: full marketing landing, fully server-rendered — never the
    // workspace shell (empty sidebar + Redux-driven thread would render a
    // broken half-workspace for a logged-out visitor).
    return <MessagesLanding />;
  }

  return <MessagesLayoutClient>{children}</MessagesLayoutClient>;
}
