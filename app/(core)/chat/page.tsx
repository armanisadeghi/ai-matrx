// app/(core)/chat/page.tsx
//
// `/chat` IS the product for everyone — signed in or not. Guests chat via
// fingerprint identity (aidream resolves an anonymous user per fingerprint).
// Every feature is free for guests; only AI actions are counted, and the
// SERVER counts them — past the allowance it answers `guest_ai_allowance_used`
// and the one reminder (lib/guest/guest-ai-allowance.ts) invites a free
// account. Never gate this route for guests in the proxy again.

import { redirect } from "next/navigation";

export default function ChatPage() {
  redirect("/chat/new");
}
