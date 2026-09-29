// Users & Access › Meetings › one meeting — the meeting's own home
// (`MeetingDetail`, the same component /meetings/<id> renders) mounted INSIDE
// the admin section so its reads ride the admin lane. The user-side route runs
// lane-less and refuses a meeting the admin is not invited to.

import { AdminMeetingDetail } from "@/features/admin/meetings/components/AdminMeetingDetail";

export const dynamic = "force-dynamic";

export default async function AdminMeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminMeetingDetail meetingId={id} />;
}
