// Every Rulebook detail and working-mode route reads private Rulebook/chat
// data. Keep the authentication boundary above every `[id]` child so a stale
// tab never mounts those client readers as the anonymous Supabase role.

import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { loginHref } from "@/utils/auth/auth-destination";

export default async function RulebookLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect(loginHref("/masterwork"));
  return children;
}
