// app/(core)/chat/page.tsx
//
// `/chat` is an account workspace. The proxy gates this entire route family
// before mandate or conversation data can resolve, preserving the exact
// destination for sign-in. Public acquisition lives on marketing surfaces.

import { redirect } from "next/navigation";

export default function ChatPage() {
  redirect("/chat/new");
}
