// app/(core)/files/page.tsx
//
// `/files` is the public-facing marketing surface for the Files module.
// The real browser lives at `/files/all`. Guests get the marketing landing;
// authenticated visitors are bounced server-side to the browser (same
// `getServerAuth()` convention every other core landing page uses) so a
// logged-in user is never shown the marketing pitch.

import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import FilesLanding from "@/features/auth/components/module-landing/landings/FilesLanding";

export default async function FilesPage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (isAuthenticated) {
    redirect("/files/all");
  }
  return <FilesLanding />;
}
