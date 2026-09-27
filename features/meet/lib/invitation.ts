// features/meet/lib/invitation.ts
//
// WHAT A PERSON PASTES TO INVITE SOMEBODY — the one place a meeting becomes an
// invitation: the text for "Copy invitation" / "Email invitation", and the
// calendar event for "Add to calendar". Pure, so it is tested without a DOM.

import type { MeetingRecord } from "@ai-matrx/meet/react";
import { endFromDuration, type CalendarEvent } from "@/lib/calendar/eventLinks";
import { describeRecurrence } from "@/features/meet/lib/recurrence";

/** The fields an invitation needs — a `MeetingRecord` satisfies it. */
export type InvitableMeeting = Pick<
  MeetingRecord,
  | "id"
  | "title"
  | "kind"
  | "scheduledFor"
  | "scheduledDurationMinutes"
  | "endedAt"
  | "timeZone"
  | "recurrenceRule"
  | "agenda"
>;

/** The meeting's repeat rule, when it has one (a `kind` alone never invents a rule). */
function ruleOf(meeting: InvitableMeeting): string | null {
  const rule = meeting.recurrenceRule ?? null;
  return rule !== null && rule.trim() !== "" ? rule : null;
}

export const JOIN_INSTRUCTIONS =
  "No account needed. Open the link and enter your name to join.";

export interface InvitationOptions {
  readonly locale?: string;
  /** IANA zone the time is written in; the MEETING's own zone when omitted (the viewer's when it has none). */
  readonly timeZone?: string;
}

/** "Monday, September 28, 2026 at 10:00 AM PDT", or null when there is no time. */
export function invitationWhen(
  meeting: InvitableMeeting,
  options: InvitationOptions = {},
): string | null {
  if (meeting.scheduledFor === null) return null;
  const start = new Date(meeting.scheduledFor);
  if (Number.isNaN(start.getTime())) return null;
  return start.toLocaleString(options.locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    ...((options.timeZone ?? meeting.timeZone)
      ? { timeZone: options.timeZone ?? meeting.timeZone }
      : {}),
  });
}

function durationLabel(minutes: number | null): string | null {
  if (minutes === null || minutes <= 0) return null;
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const h = hours === 1 ? "1 hour" : `${hours} hours`;
  return rest === 0 ? h : `${h} ${rest} minutes`;
}

/** The ready-to-paste invitation. */
export function invitationText(
  meeting: InvitableMeeting,
  link: string,
  options: InvitationOptions = {},
): string {
  const lines = [`You're invited to "${meeting.title}".`, ""];
  const when = invitationWhen(meeting, options);
  if (when !== null) {
    const length = durationLabel(meeting.scheduledDurationMinutes);
    lines.push(`When: ${when}${length ? ` (${length})` : ""}`);
  }
  const rule = ruleOf(meeting);
  if (rule !== null) {
    lines.push(
      `Repeats: ${describeRecurrence(rule, options.locale)}. The same link works for every session.`,
    );
  } else if (meeting.kind === "recurring") {
    lines.push(
      "This is a recurring meeting. The same link works for every session.",
    );
  }
  lines.push(`Join: ${link}`);
  const agenda = meeting.agenda?.trim();
  if (agenda) lines.push("", "Agenda:", agenda);
  lines.push("", JOIN_INSTRUCTIONS);
  return lines.join("\n");
}

/** Subject line for an emailed invitation. */
export function invitationSubject(meeting: InvitableMeeting): string {
  return `Invitation: ${meeting.title}`;
}

/** `mailto:` with the invitation prefilled; `to` may be empty. */
export function invitationMailto(
  meeting: InvitableMeeting,
  link: string,
  to = "",
  options: InvitationOptions = {},
): string {
  const params = new URLSearchParams({
    subject: invitationSubject(meeting),
    body: invitationText(meeting, link, options),
  });
  // mailto readers expect %20, not "+", for spaces.
  return `mailto:${encodeURIComponent(to)}?${params.toString().replace(/\+/g, "%20")}`;
}

/**
 * The calendar event, or null when the meeting has no time to put on a
 * calendar (an instant meeting, or one that already ended).
 */
export function meetingCalendarEvent(
  meeting: InvitableMeeting,
  link: string,
): CalendarEvent | null {
  if (meeting.scheduledFor === null || meeting.endedAt !== null) return null;
  if (Number.isNaN(new Date(meeting.scheduledFor).getTime())) return null;
  const rule = ruleOf(meeting);
  const recurring =
    rule !== null || meeting.kind === "recurring"
      ? "\nThe same link works for every session."
      : "";
  return {
    // The SAME UID the server's emailed invitation carries, so a person who imports both
    // gets one event that updates, never two.
    uid: `${meeting.id}@meet.aimatrx.com`,
    title: meeting.title,
    start: new Date(meeting.scheduledFor).toISOString(),
    end: endFromDuration(
      meeting.scheduledFor,
      meeting.scheduledDurationMinutes,
    ),
    description: `Join: ${link}\n${JOIN_INSTRUCTIONS}${recurring}`,
    location: link,
    url: link,
    rrule: rule,
    timeZone: meeting.timeZone ?? null,
  };
}
