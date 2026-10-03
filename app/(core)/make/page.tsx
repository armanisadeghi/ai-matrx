// record-view: none — the make hub, nothing but creation doors
// app/(core)/make/page.tsx — THE MOUNT for /make (lane MAKE-HOME). The page is
// `features/make/MakeHome.tsx`. Nothing is read here: the page must be on screen and interactive
// before any database answers (A4), so every read — kits included — happens in the browser.

import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { loginHref } from "@/utils/auth/auth-destination";
import MakeHome from "@/features/make/MakeHome";

export default async function MakePage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect(loginHref("/make"));
  return <MakeHome />;
}
