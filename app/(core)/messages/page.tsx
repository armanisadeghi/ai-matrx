// app/(core)/messages/page.tsx
//
// Server Component. Auth branch happens server-side via `getServerAuth()` —
// guests are served the full `<MessagesLanding />` directly, authed users get
// the messaging client island. Guests don't ship the Redux / messaging /
// conversation-list code; authed users don't ship the marketing landing code.

import { getServerAuth } from "@/utils/supabase/getServerAuth";
import MessagesLanding from "@/features/auth/components/module-landing/landings/MessagesLanding";
import MessagesPageClient from "./MessagesPageClient";

export default async function MessagesPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) return <MessagesLanding />;
  return <MessagesPageClient />;
}
