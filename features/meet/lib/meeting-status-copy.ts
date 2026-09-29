// features/meet/lib/meeting-status-copy.ts
//
// THE SENTENCES A MEETING'S PAGE SAYS ABOUT ITS TIME AND ITS LINK, decided once.
// A cancelled meeting has no "next" and nobody can ask to join it (verifier,
// 2026-09-29: the page kept saying "Next: …" and "Anyone with the link can ask
// to join." after cancel) — every sentence describes what the link does NOW.

import type { MeetingRecord } from "@ai-matrx/meet";

export type MeetingCopyInput = Pick<
  MeetingRecord,
  "cancelledAt" | "lobbyEnabled" | "recurrenceRule"
>;

/** The label before the time line of a series, or null for a one-off meeting. */
export function scheduleLabel(
  meeting: MeetingCopyInput,
  focusedOccurrence: boolean,
): string | null {
  if (!meeting.recurrenceRule) return null;
  if (meeting.cancelledAt) return "Was scheduled for: ";
  return focusedOccurrence ? "This occurrence: " : "Next: ";
}

/** What the meeting link does for someone who opens it. */
export function linkSentence(meeting: MeetingCopyInput): string {
  if (meeting.cancelledAt) {
    return "The link still opens this page, but nobody can join a cancelled meeting.";
  }
  const access = meeting.lobbyEnabled
    ? "Anyone with the link can ask to join; invited people come straight in."
    : "Anyone with the link can join.";
  return meeting.recurrenceRule
    ? `${access} The same link works for every occurrence.`
    : access;
}
