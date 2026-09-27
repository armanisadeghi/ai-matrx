// app/(core)/meetings/page.tsx
//
// /meetings — every meeting the signed-in person hosts or is invited to:
// Upcoming (grouped by day in their zone), Past, Cancelled, Archived; schedule,
// start now, and every row action. Server Component; the auth branch happens
// server-side so a signed-out visitor is never shown controls that cannot work.
// The whole surface is `MeetingsHome` (features/meet/components/manage).

import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { MeetingsHome } from "@/features/meet/components/manage/MeetingsHome";
import { SignedOutMeetings } from "@/features/meet/components/SignedOutMeetings";

export default async function MeetingsPage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) return <SignedOutMeetings />;
  return <MeetingsHome />;
}
