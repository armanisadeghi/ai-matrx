"use client";

// features/meet/hooks/useMeetingById.ts
//
// ONE meeting by id, with its invitees and upcoming occurrences — the three
// reads `MeetingSurfaceHost` needs (the `matrx-user/meeting` surface). The
// read is the package repository's, exactly as the meeting's home
// (`MeetingDetail`) loads it, and several consumers of the same meeting in one
// tab (the five "Meeting notes" tiles of one meeting on a board) share ONE
// read in flight.
//
// A failed read is returned whole (`failure`), never shown as "no meeting".

import { useEffect, useState } from "react";
import type { MeetingInvitee, MeetingOccurrence, MeetingRecord, MeetRepository } from "@ai-matrx/meet/react";
import { useMeetingActions } from "@/features/meet/hooks/useMeetingActions";

export interface LoadedMeeting {
  meeting: MeetingRecord;
  invitees: readonly MeetingInvitee[];
  occurrences: readonly MeetingOccurrence[];
}

export type MeetingByIdState =
  | { status: "loading" }
  | { status: "ready"; loaded: LoadedMeeting }
  | { status: "failed"; error: unknown };

const DAY_MS = 86_400_000;

/** The read itself; exported for tests. */
export async function loadMeetingById(repository: MeetRepository, meetingId: string): Promise<LoadedMeeting> {
  const meeting = await repository.meeting(meetingId as MeetingRecord["id"]);
  const [invitees, occurrences] = await Promise.all([
    repository.invitees(meeting.id).catch(() => [] as readonly MeetingInvitee[]),
    meeting.scheduledFor
      ? repository.meetingOccurrences(meeting.id, {
          from: new Date(Date.now() - DAY_MS).toISOString(),
          to: new Date(Date.now() + 400 * DAY_MS).toISOString(),
          limit: meeting.recurrenceRule ? 20 : 1,
        })
      : Promise.resolve([] as readonly MeetingOccurrence[]),
  ]);
  return { meeting, invitees, occurrences };
}

// Reads in flight, shared by every consumer of the same meeting; dropped once
// settled so the next mount (or `reload`) reads fresh.
const inFlight = new Map<string, Promise<LoadedMeeting>>();

function sharedLoad(repository: MeetRepository, meetingId: string): Promise<LoadedMeeting> {
  const existing = inFlight.get(meetingId);
  if (existing) return existing;
  const work = loadMeetingById(repository, meetingId).finally(() => inFlight.delete(meetingId));
  inFlight.set(meetingId, work);
  return work;
}

export function useMeetingById(meetingId: string | null): MeetingByIdState & { reload: () => void } {
  const { repository } = useMeetingActions();
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<{ key: string; value: MeetingByIdState } | null>(null);
  const key = `${meetingId ?? ""}|${nonce}`;

  useEffect(() => {
    if (!meetingId) return undefined;
    let live = true;
    sharedLoad(repository, meetingId).then(
      (loaded) => {
        if (live) setState({ key, value: { status: "ready", loaded } });
      },
      (error: unknown) => {
        if (live) setState({ key, value: { status: "failed", error } });
      },
    );
    return () => {
      live = false;
    };
  }, [repository, meetingId, key]);

  const reload = () => setNonce((n) => n + 1);
  const value: MeetingByIdState = state?.key === key ? state.value : { status: "loading" };
  return { ...value, reload };
}
