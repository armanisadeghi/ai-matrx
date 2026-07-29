// app/(core)/chat/page.tsx
//
// `/chat` IS the product for everyone — authed or not. The platform is
// public: guests chat via fingerprint identity (server-side anonymous user;
// see aidream's guest registry) and their conversations survive signup.
// NEVER branch guests to a marketing landing or login here — that exact
// regression (commit 716b965cc) blocked anonymous users from the core
// product for two months before being ripped out on 2026-07-28.

import { redirect } from "next/navigation";

export default function ChatPage() {
  redirect("/chat/new");
}
