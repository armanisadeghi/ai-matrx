// app/(core)/meetings/[id]/page.tsx
//
// A meeting's own page — before, during and after it. `?tab=` picks the
// section, `?at=<original start>` names the occurrence of a series the person
// came from. The body is `MeetingDetail` (features/meet/components/manage).

import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { MeetingDetail } from "@/features/meet/components/manage/MeetingDetail";
import { SignedOutMeetings } from "@/features/meet/components/SignedOutMeetings";

export default async function MeetingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[]; at?: string | string[] }>;
}) {
  const [{ id }, query, { isAuthenticated }] = await Promise.all([
    params,
    searchParams,
    getSessionVerdict(),
  ]);
  if (!isAuthenticated)
    return <SignedOutMeetings destination={`/meetings/${id}`} />;
  const one = (value: string | string[] | undefined) =>
    typeof value === "string" ? value : null;
  return (
    <MeetingDetail meetingId={id} at={one(query.at)} section={one(query.tab)} />
  );
}
