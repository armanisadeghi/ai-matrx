// app/(core)/files/page.tsx
//
// `/files` is the public-facing marketing surface for the Files module.
// The real browser lives at `/files/all`. Guests get the marketing landing;
// authenticated visitors are bounced server-side to the browser (same
// `getServerAuth()` convention every other core landing page uses) so a
// logged-in user is never shown the marketing pitch.

import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import FilesLanding from "@/features/auth/components/module-landing/landings/FilesLanding";

export default async function FilesPage() {
  const { isAuthenticated } = await getServerAuth();
  if (isAuthenticated) {
    redirect("/files/all");
  }
  return <FilesLanding />;
}
