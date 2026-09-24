// app/(core)/voice/page.tsx
//
// `/voice` is the public-facing marketing surface for the Voice module.
// The primary workspace lives at `/voice/playground`. Guests get the full
// marketing experience; authenticated visitors are bounced server-side to
// the playground (same `getServerAuth()` convention every other core landing
// page uses) so a logged-in user is never shown the marketing pitch.

import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import VoiceLanding from "@/features/auth/components/module-landing/landings/VoiceLanding";

export default async function VoicePage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (isAuthenticated) {
    redirect("/voice/playground");
  }
  return <VoiceLanding />;
}
