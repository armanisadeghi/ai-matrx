"use client";

// features/meet/hooks/useMeetingById.ts
//
// ONE meeting by id, with its invitees and upcoming occurrences — the shared
// per-meeting load (`meetingsSlice`): one read per meeting per tab, shared by
// the meeting's home (`MeetingDetail`), a meeting tile, every "Meeting notes"
// part of it and the meeting's agent surface (`MeetingSurfaceHost`). A view
// that mounts, wakes or remounts renders the store and reads nothing it
// already has; `reload` re-reads on purpose (after a write here); changes made
// anywhere else arrive through the meeting's live channel, which this holds
// open while mounted.
//
// A failed read is returned whole (`error`), never shown as "no meeting".

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { loadMeeting, selectMeetingEntry, type LoadedMeeting } from "@/features/meet/redux/meetingsSlice";
import { useMeetingLive } from "@/features/meet/hooks/useMeetingLive";

export type { LoadedMeeting };

export type MeetingByIdState =
  | { status: "loading" }
  | { status: "ready"; loaded: LoadedMeeting }
  | { status: "failed"; error: unknown };

export function useMeetingById(meetingId: string | null): MeetingByIdState & { reload: () => void } {
  const dispatch = useAppDispatch();
  const entry = useAppSelector((state) => (meetingId ? selectMeetingEntry(state, meetingId) : undefined));
  useMeetingLive(meetingId);

  // The thunk reads only a meeting no view in this tab has read.
  useEffect(() => {
    if (meetingId) void dispatch(loadMeeting({ meetingId }));
  }, [dispatch, meetingId]);

  const reload = () => {
    if (meetingId) void dispatch(loadMeeting({ meetingId, force: true }));
  };
  if (entry?.loaded) return { status: "ready", loaded: entry.loaded, reload };
  if (entry && !entry.loading && entry.error !== null) return { status: "failed", error: entry.error, reload };
  return { status: "loading", reload };
}
