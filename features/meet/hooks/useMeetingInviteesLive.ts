"use client";

// features/meet/hooks/useMeetingInviteesLive.ts
//
// A MEETING'S GUEST LIST, LIVE. An invitee answers "Going?" from the emailed
// link, the in-app control or the pre-join corner — every lane is a write to
// `communication.meet_invitees.rsvp_state` — and the host's Guests tab must show
// it without a reload (Google Calendar updates a guest's answer in place).
//
// `@ai-matrx/realtime` owns the channel. Any change to one of this meeting's
// invitee rows calls `onChange`, and so does every reconnect (`onBackfill`):
// realtime has no replay, so a socket that blipped while a guest answered would
// otherwise leave the tab wrong with nothing on screen to say so. The caller
// re-reads through the repository — RLS decides what the host may see, and the
// projection stays the package's, never a second row mapper here.
//
// The table joined the `supabase_realtime` publication in
// migrations/meet_invitees_realtime_publication.sql.

import { defineChannelNamespace } from "@ai-matrx/realtime";
import { useChannel } from "@ai-matrx/realtime/react";

/** One place names this channel. A second, different declaration throws. */
const meetingInviteesChannel = defineChannelNamespace({
  namespace: "meet-invitees",
  parts: ["meetingId"],
  description: "communication.meet_invitees rows (RSVP answers) for one meeting",
});

export function meetingInviteesSubscription(
  meetingId: string | null,
  onChange: () => void,
) {
  if (meetingId === null) return null;
  return {
    topic: meetingInviteesChannel.topic({ meetingId }),
    postgresChanges: [
      {
        event: "*" as const,
        schema: "communication",
        table: "meet_invitees",
        filter: `meeting_id=eq.${meetingId}`,
        rowId: (row: Record<string, unknown>) =>
          typeof row.id === "string" ? row.id : undefined,
        // The answer and its note are what a host is waiting for; a row whose
        // fingerprint did not move is an echo, not news.
        fingerprint: (row: Record<string, unknown>) =>
          `${String(row.rsvp_state ?? "")}|${String(row.rsvp_note ?? "")}|${String(
            row.role ?? "",
          )}|${String(row.deleted_at ?? "")}|${String(row.last_sent_sequence ?? "")}`,
        onChange: () => onChange(),
      },
    ],
    onBackfill: async () => {
      onChange();
    },
  };
}

/** Re-read the guest list whenever one of this meeting's invitees changes. */
export function useMeetingInviteesLive(
  meetingId: string | null,
  onChange: () => void,
): void {
  useChannel(meetingInviteesSubscription(meetingId, onChange));
}
