// features/meet/lib/in-app-rsvp.ts
//
// A SIGNED-IN invitee's Going? answer goes through aidream
// (`POST /api/v1/meet/meetings/{id}/rsvp`), not straight to the database door:
// the server writes the same `communication.meet_respond` for the caller AND
// tells the host (`meet.rsvp_received`) when the answer changed — exactly what
// an answer through the emailed link already did. Before 2026-09-27 the in-app
// answer was a silent row update the host learned about only by opening the page.

import type { MeetApi, MeetingRecord, RsvpAnswer } from "@ai-matrx/meet/react";

export const IN_APP_RSVP_ROUTE = (meetingId: string) =>
  `/api/v1/meet/meetings/${encodeURIComponent(meetingId)}/rsvp`;

export interface InAppRsvpResult {
  /**
   * The server could not take the answer at all — no route yet (a deploy in
   * flight, 404) or it failed before writing (5xx). The caller records the
   * answer through the database door instead and says the host was not told.
   * A 4xx refusal (not invited, cancelled) is NOT this: it throws its sentence.
   */
  readonly routeMissing: boolean;
  readonly hostNotified: boolean;
}

/** Throws an Error carrying the server's sentence (and `remedy`) when it refuses. */
export async function respondThroughServer(
  api: Pick<MeetApi, "request">,
  meetingId: MeetingRecord["id"],
  answer: RsvpAnswer,
  note: string | null = null,
): Promise<InAppRsvpResult> {
  const response = await api.request({
    path: IN_APP_RSVP_ROUTE(meetingId),
    method: "POST",
    requireAuth: true,
    operation: "meet.respond",
    body: { answer, note },
  });
  if (response.status === 404 || response.status >= 500) {
    // Only a missing ROUTE is a 404 here (the service answers 403/409 for a
    // person or meeting it refuses). A 5xx is the server failing before its
    // write (2026-09-27: the door's row could not be decoded, so every answer
    // 500'd) — the person's answer must still be recorded, so the caller falls
    // back to the door.
    return { routeMissing: true, hostNotified: false };
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  if (!response.ok) {
    const source =
      typeof body.detail === "object" && body.detail !== null
        ? (body.detail as Record<string, unknown>)
        : body;
    const message =
      typeof source.message === "string" && source.message.trim() !== ""
        ? source.message
        : "Your answer could not be saved. Try again.";
    const error = new Error(message) as Error & { remedy?: string };
    if (typeof source.remedy === "string") error.remedy = source.remedy;
    throw error;
  }
  return { routeMissing: false, hostNotified: body.host_notified === true };
}
