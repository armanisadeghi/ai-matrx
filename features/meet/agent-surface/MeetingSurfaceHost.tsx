"use client";

/**
 * MeetingSurfaceHost — THE ONE `matrx-user/meeting` surface for one meeting:
 * the read half (the meeting, its guests and occurrences from the caller's
 * load, plus — once it has happened — its durable record) and the write half
 * (title, agenda, AI note-taker through `useMeetingActions`, refused wherever
 * the page's own controls would refuse this viewer).
 *
 * Mounted by the meeting's home (`MeetingDetail`, /meetings/[id]) and by a
 * meeting on the Board, so an agent reads and changes a meeting identically
 * wherever it is open.
 */

import type { ReactNode } from "react";
import {
  displayNameFor,
  meetingLink,
  readableTranscript,
  useMeetHost,
  useMeetingRecord,
  type MeetingInvitee,
  type MeetingOccurrence,
  type MeetingRecord,
} from "@ai-matrx/meet/react";
import {
  SurfaceRuntimeProvider,
  useSurfaceScopeContribution,
  type SurfaceWriteHandlers,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMeetingScope } from "@/features/surfaces/manifests/meeting.manifest";
import { meetingOrigin } from "@/features/meet/components/invite/MeetingInviteButton";
import { useMeetingActions } from "@/features/meet/hooks/useMeetingActions";

export const MEETING_SURFACE_NAME = "matrx-user/meeting";

/** Longest transcript excerpt handed to an agent, in characters. */
const TRANSCRIPT_EXCERPT_CHARS = 4000;

function statusOf(meeting: MeetingRecord): string {
  if (meeting.deletedAt) return "archived";
  if (meeting.cancelledAt) return "cancelled";
  if (meeting.startedAt !== null && meeting.endedAt === null) return "live";
  if (meeting.endedAt !== null && !meeting.recurrenceRule) return "ended";
  return meeting.scheduledFor || meeting.recurrenceRule ? "scheduled" : "unscheduled";
}

function briefOf(meeting: MeetingRecord): string | null {
  const stored = (meeting.metadata as Record<string, unknown> | null)?.prep_brief as
    | { text?: unknown }
    | undefined;
  return typeof stored?.text === "string" && stored.text.trim() ? stored.text : null;
}

export function MeetingSurfaceHost({
  meeting,
  invitees,
  occurrences,
  onSaved,
  children,
}: {
  meeting: MeetingRecord;
  invitees: readonly MeetingInvitee[];
  occurrences: readonly MeetingOccurrence[];
  /** The meeting the canonical update returned — the caller shows it. */
  onSaved: (meeting: MeetingRecord) => void;
  children: ReactNode;
}) {
  const actions = useMeetingActions();
  const host = useMeetHost();
  const userId = actions.userId;
  const mine = invitees.find((i) => i.userId === userId) ?? null;
  const isHost = meeting.hostUserId === userId;
  const canManage = isHost || mine?.role === "cohost";
  const status = statusOf(meeting);
  const happened = meeting.startedAt !== null || meeting.endedAt !== null;

  const getScope = () =>
    createMeetingScope({
      meeting_id: meeting.id,
      meeting_title: meeting.title,
      meeting_status: status,
      meeting_kind: meeting.kind,
      next_occurrences: meeting.recurrenceRule
        ? occurrences.map((o) => ({
            original_start: o.originalStart,
            occurrence_start: o.occurrenceStart,
            state: o.state,
          }))
        : [],
      meeting_link: meetingLink(meetingOrigin(), meeting.slug),
      viewer_role: isHost ? "host" : (mine?.role ?? "member"),
      can_manage: canManage,
      participants: invitees.map((i) => ({
        name: i.displayName ?? i.email ?? "Guest",
        email: i.email,
        role: i.role,
        rsvp: i.rsvpState,
        rsvp_note: i.rsvpNote,
      })),
      participant_count: invitees.length,
      meeting_settings: {
        waiting_room: meeting.lobbyEnabled,
        join_before_host: meeting.joinBeforeHost ?? true,
        ai_note_taker: meeting.aiEnabled,
        recording_policy: meeting.recordingPolicy,
      },
      ...(meeting.scheduledFor ? { scheduled_for: meeting.scheduledFor } : {}),
      ...(meeting.scheduledDurationMinutes != null
        ? { duration_minutes: meeting.scheduledDurationMinutes }
        : {}),
      ...(meeting.timeZone ? { time_zone: meeting.timeZone } : {}),
      ...(meeting.recurrenceRule ? { recurrence_rule: meeting.recurrenceRule } : {}),
      ...(meeting.startedAt ? { started_at: meeting.startedAt } : {}),
      ...(meeting.endedAt ? { ended_at: meeting.endedAt } : {}),
      ...(meeting.cancellationReason ? { cancellation_reason: meeting.cancellationReason } : {}),
      ...(meeting.agenda?.trim() ? { agenda: meeting.agenda } : {}),
      ...(briefOf(meeting) ? { brief: briefOf(meeting) ?? undefined } : {}),
      selection: typeof window !== "undefined" ? (window.getSelection()?.toString() ?? "") : "",
    });

  /** The page's own rule for editing: host/co-host, and a meeting still open. */
  const requireEditable = (what: string, allowEnded = false) => {
    if (!canManage)
      throw new Error(`Only the host or a co-host can change the ${what}; you are ${isHost ? "the host" : (mine?.role ?? "not invited")}.`);
    if (status === "cancelled" || status === "archived")
      throw new Error(`This meeting is ${status}, so its ${what} cannot change.`);
    if (!allowEnded && status === "ended")
      throw new Error(`This meeting has ended, so its ${what} cannot change.`);
  };

  /** Save through the canonical update; tell invitees as the page's Edit does. */
  const save = async (changes: Parameters<typeof actions.update>[1], notify: boolean) => {
    const updated = await actions.update(meeting, changes);
    onSaved(updated);
    if (notify && invitees.length > 0) await actions.announce(meeting.id);
    return updated;
  };

  const getWriteHandlers = (): SurfaceWriteHandlers => ({
    meeting_title: {
      validate: (value) => {
        if (typeof value !== "string" || !value.trim())
          throw new Error("meeting_title expects a non-empty plain-text title.");
        requireEditable("title");
      },
      apply: async (value) => {
        const title = String(value).trim();
        const updated = await save({ title }, true);
        return { summary: `Renamed the meeting to "${updated.title}".` };
      },
    },
    meeting_agenda: {
      validate: (value) => {
        if (typeof value !== "string")
          throw new Error("meeting_agenda expects the full agenda text (an empty string clears it).");
        requireEditable("agenda");
      },
      apply: async (value) => {
        const agenda = String(value).trim();
        await save({ agenda: agenda === "" ? null : agenda }, true);
        return { summary: agenda === "" ? "Cleared the agenda." : "Saved the agenda." };
      },
    },
    ai_note_taker: {
      validate: (value) => {
        if (typeof value !== "boolean")
          throw new Error("ai_note_taker expects true (on) or false (off).");
        requireEditable("AI note-taker setting", true);
      },
      apply: async (value) => {
        await save({ aiEnabled: value === true }, false);
        return { summary: `AI note-taker ${value === true ? "on" : "off"}.` };
      },
    },
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName={MEETING_SURFACE_NAME}
      getScope={getScope}
      isEditable={false}
      getWriteHandlers={getWriteHandlers}
    >
      {/* The record is read through an organization; without one the page
          itself says so, and these values stay absent (never "empty"). */}
      {happened && host !== null ? <MeetingRecordValues meeting={meeting} /> : null}
      {children}
    </SurfaceRuntimeProvider>
  );
}

/**
 * The "what happened" half of the surface — the package's `useMeetingRecord`
 * bundle (the same one the Record tab reads), contributed to the meeting's
 * scope. Renders nothing.
 */
function MeetingRecordValues({ meeting }: { meeting: MeetingRecord }) {
  const { record, failure } = useMeetingRecord(meeting);
  useSurfaceScopeContribution(MEETING_SURFACE_NAME, "MeetingRecordValues", () => {
    if (!record) {
      return failure ? { record_restrictions: [`${failure.message} ${failure.remedy}`.trim()] } : {};
    }
    const transcript = readableTranscript(record.transcript)
      .map((line) => `${displayNameFor(record.names, line.identity, line.speaker)}: ${line.text}`)
      .join("\n");
    return {
      ...(record.summary ? { summary: record.summary.text } : {}),
      decisions: record.decisions.map((d) => d.text),
      action_items: record.actionItems.map((a) => ({
        id: a.id,
        text: a.text,
        owner: a.assigneeDisplayName,
      })),
      ...(record.liveNotes.length > 0 ? { notes: record.liveNotes.map((n) => n.text) } : {}),
      ...(record.attendees.length > 0
        ? {
            attendees: record.attendees
              .filter((a) => !a.isAgent)
              .map((a) => ({
                name: displayNameFor(record.names, a.identity, a.displayName),
                role: a.role,
                joined_at: a.joinedAt,
                left_at: a.leftAt,
              })),
          }
        : {}),
      ...(transcript
        ? {
            transcript_excerpt:
              transcript.length > TRANSCRIPT_EXCERPT_CHARS
                ? `${transcript.slice(0, TRANSCRIPT_EXCERPT_CHARS)}… [${transcript.length - TRANSCRIPT_EXCERPT_CHARS} more characters on the page]`
                : transcript,
          }
        : {}),
      ...(record.restrictions.length > 0
        ? { record_restrictions: record.restrictions.map((r) => `${r.part}: ${r.message}`) }
        : {}),
    };
  });
  return null;
}
