// app/(core)/camera/page.tsx
//
// Server Component page. Auth gate happens server-side via `getServerAuth()`
// (request-scoped cache). Guests are redirected to /login; authed users get
// the client Capture Studio + recent-captures lens.

import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import CameraPage from "@/features/media-capture/components/CameraPage";
import { loginHref } from "@/utils/auth/auth-destination";

export default async function CameraRoutePage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect(loginHref("/camera"));

  return <CameraPage />;
}
