// Server Component layout. Guests get the Messages marketing landing (the
// messenger is the same conversations); signed-in people get the shell.

import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import MessagesLanding from "@/features/auth/components/module-landing/landings/MessagesLanding";
import { MESSENGER_HREF, MESSENGER_LABEL } from "@/features/messaging/messenger/messenger-route";

export const metadata = createRouteMetadata(MESSENGER_HREF, {
  title: MESSENGER_LABEL,
  description: "Your conversations in a desktop messenger",
  letter: "MG",
});

export default async function MessengerLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) return <MessagesLanding />;
  return children;
}
