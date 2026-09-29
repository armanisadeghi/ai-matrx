"use client";

// One meeting, seen from the platform Meetings admin page. Wraps the canonical
// meeting home (`MeetingDetail`, chrome="embedded") — never a second renderer —
// under a one-row admin strip with the way back. Mounted under
// /administration/** so every read carries the admin lane.

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MeetingDetail } from "@/features/meet/components/manage/MeetingDetail";

export function AdminMeetingDetail({ meetingId }: { meetingId: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <Link href="/administration/users/meetings?tab=history" className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs hover:bg-muted">
          <ArrowLeft className="h-3.5 w-3.5" /> All meetings
        </Link>
        <span className="text-xs text-muted-foreground">Viewing as platform admin — any change here acts on the meeting&apos;s own organization.</span>
      </div>
      <div className="min-h-0 flex-1">
        <MeetingDetail meetingId={meetingId} at={null} section={null} chrome="embedded" />
      </div>
    </div>
  );
}
