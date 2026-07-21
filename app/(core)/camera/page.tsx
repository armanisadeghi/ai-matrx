// app/(core)/camera/page.tsx
//
// Server Component page. Auth gate happens server-side via `getServerAuth()`
// (request-scoped cache). Guests are redirected to /login; authed users get
// the client Capture Studio + recent-captures lens.

import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import CameraPage from "@/features/media-capture/components/CameraPage";

export default async function CameraRoutePage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/login");

  return <CameraPage />;
}
