"use client";

// features/meet/hooks/useMeetingLive.ts
//
// ONE MEETING, LIVE — one channel per meeting per tab, however many views hold
// it (the meeting's home, a meeting tile, five "Meeting notes" tiles of it).
// Changes land in the store (`meetingsSlice`), which every view renders:
//
//   meet_meetings  (this meeting's row)  → the meeting is re-read, unless the
//                  store already holds that version (this tab's own write,
//                  re-read when it was saved)
//   meet_invitees  (its guests)          → the guest list is re-read — an RSVP
//                  from the emailed link, the in-app control or the pre-join
//                  corner shows without a reload (Google Calendar updates a
//                  guest's answer in place)
//   reconnect / tab wake / network back  → the meeting is re-read (realtime has
//                  no replay; a socket that blipped would otherwise leave the
//                  view wrong with nothing on screen to say so)
//
// The re-read is the repository's: RLS decides what this person may see, and
// the projection stays the package's — never a second row mapper here.
// Both tables are in the `supabase_realtime` publication
// (migrations/meet_realtime_publication.sql, meet_invitees_realtime_publication.sql).

import { useEffect } from "react";
import { defineChannelNamespace, type ChannelSpec } from "@ai-matrx/realtime";
import { useRealtimeManager } from "@ai-matrx/realtime/react";
import { openShared } from "@/lib/realtime/sharedChannel";
import { useAppStore } from "@/lib/redux/hooks";
import {
  loadMeeting,
  refreshMeetingInvitees,
  selectMeetingEntry,
  type MeetingsState,
} from "@/features/meet/redux/meetingsSlice";

/** Any store carrying the meetings slice (the app's, or a test's). */
export interface MeetingsStore {
  dispatch: (action: ReturnType<typeof loadMeeting> | ReturnType<typeof refreshMeetingInvitees>) => unknown;
  getState: () => { meetings: MeetingsState };
}

/** One place names this channel. A second, different declaration throws. */
const meetingChannel = defineChannelNamespace({
  namespace: "meet-meeting-home",
  parts: ["meetingId"],
  description: "communication.meet_meetings (one row) and its communication.meet_invitees rows",
});

const idOf = (row: Record<string, unknown>) => (typeof row.id === "string" ? row.id : undefined);

/** The channel for one meeting, feeding `store`. Exported for tests. */
export function meetingLiveSpec(store: MeetingsStore, meetingId: string): ChannelSpec {
  return {
    topic: meetingChannel.topic({ meetingId }),
    postgresChanges: [
      {
        event: "*",
        schema: "communication",
        table: "meet_meetings",
        filter: `id=eq.${meetingId}`,
        rowId: idOf,
        onChange: ({ row }) => {
          const held = selectMeetingEntry(store.getState(), meetingId)?.loaded?.meeting.version;
          const arrived = row && typeof row.version === "number" ? row.version : null;
          // This tab's own save was re-read when it landed; its echo is not news.
          if (held !== undefined && arrived !== null && held >= arrived) return;
          void store.dispatch(loadMeeting({ meetingId, force: true }));
        },
      },
      {
        event: "*",
        schema: "communication",
        table: "meet_invitees",
        filter: `meeting_id=eq.${meetingId}`,
        rowId: idOf,
        // The answer and its note are what a host is waiting for; a row whose
        // fingerprint did not move is an echo, not news.
        fingerprint: (row) =>
          `${String(row.rsvp_state ?? "")}|${String(row.rsvp_note ?? "")}|${String(row.role ?? "")}|${String(
            row.deleted_at ?? "",
          )}|${String(row.last_sent_sequence ?? "")}`,
        onChange: () => void store.dispatch(refreshMeetingInvitees({ meetingId })),
      },
    ],
    onBackfill: async () => {
      await store.dispatch(loadMeeting({ meetingId, force: true }));
    },
  };
}

/** Hold this meeting's channel open while the caller is mounted (ref-counted per meeting). */
export function useMeetingLive(meetingId: string | null): void {
  const manager = useRealtimeManager();
  const store = useAppStore();
  useEffect(() => {
    if (!meetingId || !manager) return undefined;
    const topic = meetingChannel.topic({ meetingId });
    return openShared(manager, topic, () => meetingLiveSpec(store, meetingId));
  }, [meetingId, manager, store]);
}
