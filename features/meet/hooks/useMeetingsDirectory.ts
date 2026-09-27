"use client";

// features/meet/hooks/useMeetingsDirectory.ts
//
// THE READER'S OWN MEETINGS — what /meetings lists. Two reads, straight to the
// database under RLS (no server hop):
//
//   occurrences  `meet_occurrences_between` — every occurrence in the window,
//                expanded by the database (recurrence + moved/cancelled
//                exceptions), with the reader's role and RSVP on each row.
//   meetings     the `meet_meetings` rows the reader HOSTS or is INVITED to —
//                the Past, Cancelled and Archived tabs, and the live instant
//                meetings that have no occurrence.
//
// 🚨 RLS IS THE CEILING, NEVER THE VIEW. A platform admin can read every
// meeting on the platform; an org member can read the whole organization's.
// The list is scoped here to the reader's OWN meetings (host, co-host,
// invitee) — the way Google Calendar and Zoom list "my meetings" — and never
// to whatever the row policy happens to let this account see.

import { useEffect, useState } from "react";
import {
  createMeetRepository,
  useMeetHost,
  type MeetingRecord,
  type UpcomingOccurrence,
} from "@ai-matrx/meet/react";
import { supabase } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

const MEETING_COLUMNS =
  "id,organization_id,room_name,slug,title,kind,host_user_id,scheduled_for," +
  "scheduled_duration_minutes,started_at,ended_at,locked,lobby_enabled," +
  "recording_policy,ai_enabled,metadata,time_zone,agenda,recurrence_rule," +
  "join_before_host,cancelled_at,cancellation_reason,deleted_at,calendar_sequence,version";

/** How far ahead Upcoming reads. The database caps a series' expansion itself. */
export const UPCOMING_WINDOW_DAYS = 90;
const MEETINGS_LIMIT = 300;

export interface MeetingsDirectory {
  readonly loading: boolean;
  readonly failure: string | null;
  readonly occurrences: readonly UpcomingOccurrence[];
  /** The reader's meetings (hosting or invited), newest first. */
  readonly meetings: readonly MeetingRecord[];
  /** The reader's role on each meeting in `meetings`. */
  readonly roles: ReadonlyMap<string, "host" | "cohost" | "invitee">;
  readonly userId: string | null;
  reload(): void;
}

export function useMeetingsDirectory(): MeetingsDirectory {
  const host = useMeetHost();
  // READING needs no organization — access is personal, never the active org.
  // Without one the Meet provider is inert, so the list reads through a plain
  // repository on the same client and the signed-in person's id.
  const [plainRepository] = useState(() =>
    createMeetRepository({ client: supabase }),
  );
  const reduxUserId = useAppSelector(selectUserId);
  const repository = host?.repository ?? plainRepository;
  const userId = host?.identity.userId ?? reduxUserId;
  const [state, setState] = useState<{
    loading: boolean;
    failure: string | null;
    occurrences: readonly UpcomingOccurrence[];
    meetings: readonly MeetingRecord[];
    roles: ReadonlyMap<string, "host" | "cohost" | "invitee">;
  }>({
    loading: true,
    failure: null,
    occurrences: [],
    meetings: [],
    roles: new Map(),
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (repository === null || userId === null) return undefined;
    let live = true;
    setState((s) => ({ ...s, loading: true, failure: null }));
    const from = new Date(Date.now() - 24 * 3_600_000).toISOString();
    const to = new Date(
      Date.now() + UPCOMING_WINDOW_DAYS * 86_400_000,
    ).toISOString();

    const load = async () => {
      const db = supabase.schema("communication");
      const [occurrences, hosting, invitedRows] = await Promise.all([
        repository.occurrencesBetween({
          from,
          to,
          organizationId: null,
          limit: 1000,
        }),
        db
          .from("meet_meetings")
          .select(MEETING_COLUMNS)
          .eq("host_user_id", userId)
          .order("scheduled_for", { ascending: false, nullsFirst: true })
          .limit(MEETINGS_LIMIT),
        db
          .from("meet_invitees")
          .select("meeting_id,role")
          .eq("invitee_user_id", userId)
          .is("deleted_at", null)
          .limit(MEETINGS_LIMIT),
      ]);
      if (hosting.error) throw new Error(hosting.error.message);
      if (invitedRows.error) throw new Error(invitedRows.error.message);

      const roles = new Map<string, "host" | "cohost" | "invitee">();
      for (const row of invitedRows.data ?? []) {
        roles.set(row.meeting_id, row.role === "cohost" ? "cohost" : "invitee");
      }
      const invitedIds = [...roles.keys()];
      let invited: Record<string, unknown>[] = [];
      if (invitedIds.length > 0) {
        const response = await db
          .from("meet_meetings")
          .select(MEETING_COLUMNS)
          .in("id", invitedIds);
        if (response.error) throw new Error(response.error.message);
        invited = (response.data ?? []) as unknown as Record<string, unknown>[];
      }
      const hostingRows = (hosting.data ?? []) as unknown as Record<
        string,
        unknown
      >[];
      for (const row of hostingRows) roles.set(String(row.id), "host");

      const byId = new Map<string, MeetingRecord>();
      for (const row of [...hostingRows, ...invited]) {
        const meeting = repository.projectMeeting(row);
        byId.set(meeting.id, meeting);
      }
      const meetings = [...byId.values()].sort(
        (a, b) =>
          new Date(b.scheduledFor ?? b.startedAt ?? 0).getTime() -
          new Date(a.scheduledFor ?? a.startedAt ?? 0).getTime(),
      );
      return { occurrences, meetings, roles };
    };

    load()
      .then((result) => {
        if (!live) return;
        setState({ loading: false, failure: null, ...result });
      })
      .catch((thrown: unknown) => {
        if (!live) return;
        setState((s) => ({
          ...s,
          loading: false,
          failure:
            thrown instanceof Error
              ? thrown.message
              : "Your meetings could not be read.",
        }));
      });
    return () => {
      live = false;
    };
  }, [repository, userId, nonce]);

  return {
    ...state,
    userId,
    reload: () => setNonce((n) => n + 1),
  };
}

/** How long an unscheduled meeting counts as "happening now" after it started. */
export const LIVE_INSTANT_HOURS = 12;

/**
 * An instant meeting in progress: started, not ended, no scheduled time, and
 * started within `LIVE_INSTANT_HOURS` — a room nobody ended days ago is not
 * "happening now" (it goes to Past), whatever its row still says.
 */
export function isLiveInstant(
  meeting: MeetingRecord,
  now: Date = new Date(),
): boolean {
  return (
    meeting.startedAt !== null &&
    meeting.endedAt === null &&
    meeting.scheduledFor === null &&
    !meeting.cancelledAt &&
    !meeting.deletedAt &&
    now.getTime() - new Date(meeting.startedAt).getTime() <
      LIVE_INSTANT_HOURS * 3_600_000
  );
}

/** Belongs on Past: it ended, or a one-off whose time has gone by. */
export function isPast(
  meeting: MeetingRecord,
  now: Date = new Date(),
): boolean {
  if (meeting.cancelledAt || meeting.deletedAt) return false;
  if (meeting.endedAt !== null) return true;
  if (meeting.recurrenceRule) return false;
  if (meeting.scheduledFor === null) {
    return meeting.startedAt !== null && !isLiveInstant(meeting, now);
  }
  const end =
    new Date(meeting.scheduledFor).getTime() +
    (meeting.scheduledDurationMinutes ?? 60) * 60_000;
  return end < now.getTime();
}
