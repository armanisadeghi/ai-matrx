"use client";

// features/meet/components/MeetingHomeAndRoom.tsx
//
// ONE MEETING, ONE BOX — the meeting's home and its live room in the same
// place. A host that embeds a meeting (a meeting tile on the Board) renders
// this instead of `MeetingDetail` alone: Join / Start / Rejoin switches the box
// to the room (`MeetingSurface`, the same component /meet/[slug] renders, in
// its embedded chrome), and Leave — or Details before joining — switches back.
//
// The home stays MOUNTED (hidden) while the room is up, so its agent surface
// (`MeetingSurfaceHost`, mounted by `MeetingDetail`) keeps answering for this
// meeting during the call and coming back is instant. Nothing here joins on
// its own: the room opens on its pre-join screen and the person's own click
// starts the call (camera and microphone need a person's action).

import { useState } from "react";
import type { MeetingRecord } from "@ai-matrx/meet/react";
import { cn } from "@/lib/utils";
import { MeetingDetail } from "@/features/meet/components/manage/MeetingDetail";
import { MeetingSurface } from "@/features/meet/components/MeetingSurface";

export function MeetingHomeAndRoom({
  meetingId,
  onMeeting,
  onRoomChange,
}: {
  meetingId: string;
  /** Told the meeting each time the home (re)reads or saves it. */
  onMeeting?: (meeting: MeetingRecord) => void;
  /** The box switched to the room (true) or back to the home (false). */
  onRoomChange?: (inRoom: boolean) => void;
}) {
  const [room, setRoom] = useState<MeetingRecord | null>(null);
  const enter = (meeting: MeetingRecord) => {
    setRoom(meeting);
    onRoomChange?.(true);
  };
  const leave = () => {
    setRoom(null);
    onRoomChange?.(false);
  };
  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div
        className={cn("flex h-full min-h-0 flex-col", room && "hidden")}
        data-meeting-home=""
      >
        <MeetingDetail
          meetingId={meetingId}
          at={null}
          section={null}
          chrome="embedded"
          onMeeting={onMeeting}
          onJoin={enter}
        />
      </div>
      {room ? (
        <div className="h-full min-h-0" data-meeting-room="">
          <MeetingSurface
            slug={room.slug}
            isAuthenticated
            chrome="embedded"
            onLeave={leave}
          />
        </div>
      ) : null}
    </div>
  );
}
