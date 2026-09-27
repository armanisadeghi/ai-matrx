// features/meet/lib/invitation.ts
//
// WHAT A PERSON PASTES TO INVITE SOMEBODY — the one place a meeting becomes an
// invitation: the text for "Copy invitation" / "Email invitation", and the
// calendar event for "Add to calendar". Pure, so it is tested without a DOM.

import type { MeetingRecord } from "@ai-matrx/meet/react";
import { endFromDuration, type CalendarEvent } from "@/lib/calendar/eventLinks";

/** The fields an invitation needs — a `MeetingRecord` satisfies it. */
export type InvitableMeeting = Pick<
  MeetingRecord,
  "id" | "title" | "kind" | "scheduledFor" | "scheduledDurationMinutes" | "endedAt"
>;

export const JOIN_INSTRUCTIONS = "No account needed. Open the link and enter your name to join.";

export interface InvitationOptions {
  readonly locale?: string;
  /** IANA zone the time is written in; the viewer's own zone when omitted. */
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
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
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
  if (meeting.kind === "recurring") {
    lines.push("This is a recurring meeting. The same link works for every session.");
  }
  lines.push(`Join: ${link}`, "", JOIN_INSTRUCTIONS);
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
  const recurring =
    meeting.kind === "recurring"
      ? "\nThis is a recurring meeting. The same link works for every session."
      : "";
  return {
    uid: `meet-${meeting.id}@aimatrx.com`,
    title: meeting.title,
    start: new Date(meeting.scheduledFor).toISOString(),
    end: endFromDuration(meeting.scheduledFor, meeting.scheduledDurationMinutes),
    description: `Join: ${link}\n${JOIN_INSTRUCTIONS}${recurring}`,
    location: link,
    url: link,
  };
}
