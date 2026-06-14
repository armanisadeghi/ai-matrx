// app/(core)/chat/page.tsx
//
// `/chat` is the public-facing marketing surface for the Chat module. The
// real workspace lives at `/chat/new`. Guests get the full marketing
// experience (hero, capabilities, conversion nudges); authenticated visitors
// are bounced server-side straight into a fresh chat (same `getServerAuth()`
// convention every other core landing page uses) so a logged-in user is
// never shown the marketing pitch.

import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import ChatLanding from "@/features/auth/components/module-landing/landings/ChatLanding";

export default async function ChatPage() {
  const { isAuthenticated } = await getServerAuth();
  if (isAuthenticated) {
    redirect("/chat/new");
  }
  return <ChatLanding />;
}
