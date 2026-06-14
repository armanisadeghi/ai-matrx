// app/(core)/war-room/page.tsx
//
// `/war-room` is the public-facing marketing surface for the War Room module.
// The real workspace lives one URL down at `/war-room/all`. Guests get the
// marketing landing; authenticated visitors are bounced server-side straight
// to their rooms (same `getServerAuth()` convention every other core landing
// page uses) so a logged-in user is never shown the marketing pitch.

import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import WarRoomLanding from "@/features/auth/components/module-landing/landings/WarRoomLanding";

export default async function WarRoomPage() {
  const { isAuthenticated } = await getServerAuth();
  if (isAuthenticated) {
    redirect("/war-room/all");
  }
  return <WarRoomLanding />;
}
