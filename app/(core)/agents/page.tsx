// app/(core)/agents/page.tsx
//
// `/agents` is the public-facing marketing surface for the Agents module.
// The real gallery lives at `/agents/all`. Guests get the marketing landing;
// authenticated visitors are bounced server-side to the gallery (same
// `getServerAuth()` convention every other core landing page uses) so a
// logged-in user is never shown the marketing pitch.

import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import AgentsLanding from "@/features/auth/components/module-landing/landings/AgentsLanding";

export default async function AgentsPage() {
  const { isAuthenticated } = await getServerAuth();
  if (isAuthenticated) {
    redirect("/agents/all");
  }
  return <AgentsLanding />;
}
