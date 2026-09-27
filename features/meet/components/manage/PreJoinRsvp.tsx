"use client";

// features/meet/components/manage/PreJoinRsvp.tsx
//
// "GOING?" ON THE PRE-JOIN SCREEN — for a signed-in person on the meeting's
// invitation list, before the meeting has happened. Absent for everyone else
// (the host, an org member who was not invited, a guest), for a cancelled or
// ended meeting, and until the list is read — never a control that would refuse.

import { useEffect, useState } from "react";
import {
  useMeetHost,
  type MeetingInvitee,
  type MeetingRecord,
} from "@ai-matrx/meet/react";
import { RsvpControl } from "@/features/meet/components/manage/RsvpControl";

export function PreJoinRsvp({ meeting }: { meeting: MeetingRecord }) {
  const host = useMeetHost();
  const repository = host?.repository ?? null;
  const userId = host?.identity.userId ?? null;
  const [mine, setMine] = useState<MeetingInvitee | null>(null);
  const closed =
    !!meeting.cancelledAt || !!meeting.deletedAt || meeting.endedAt !== null;

  useEffect(() => {
    if (repository === null || userId === null || closed) return undefined;
    let live = true;
    repository
      .invitees(meeting.id)
      .then((rows) => {
        if (live) setMine(rows.find((row) => row.userId === userId) ?? null);
      })
      .catch((thrown: unknown) => {
        // Not on the list, or not readable: the control stays absent, and we say why here.
        console.warn(
          `[meet] pre-join RSVP hidden: ${(thrown as Error)?.message ?? thrown}`,
        );
      });
    return () => {
      live = false;
    };
  }, [repository, userId, meeting.id, closed]);

  if (mine === null || closed) return null;
  return (
    <RsvpControl
      meetingId={meeting.id}
      value={mine.rsvpState === "needs_action" ? null : mine.rsvpState}
      tone="stage"
      className="rounded-full bg-black/30 py-1 pl-3 pr-1 backdrop-blur"
    />
  );
}
