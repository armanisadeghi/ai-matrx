"use client";

// features/meet/lib/guest-claim.ts
//
// KEEP YOUR NOTES (Arman, 2026-10-01: people use our meetings, fall in love,
// then sign up — nothing may block a guest). After a guest's meeting the record
// view offers a free account; the sign-up link returns to the meeting with
// `?claim=1`, and on arrival the guest pass this browser kept from the meeting
// (`@ai-matrx/meet`'s `rememberedMeetingPass`) is presented with the new
// session to `POST /api/v1/meet/claim`. The server stamps the attendance on the
// admitted guest row; from then on the account reads what guests may read of
// that meeting, without the pass and without its expiry.
//
// The intent flag is required: a pass on a shared computer must never be
// claimed by whoever signs in next without asking for it.

import {
  MEETING_PASS_HEADER,
  rememberedMeetingPass,
  type MeetApi,
  type MeetingRecord,
} from "@ai-matrx/meet/react";
import { signUpHref } from "@/utils/auth/auth-destination";

export const GUEST_CLAIM_PARAM = "claim";
// `MEET_ROUTES.claim` in @ai-matrx/meet from the next release; the literal is
// the same pinned path (aidream `test_meet_service.py` guards the server side).
export const GUEST_CLAIM_ROUTE = "/api/v1/meet/claim";

/** Where "Create a free account" sends a guest: sign-up, then back here to claim. */
export function keepNotesHref(slug: string): string {
  return signUpHref(`/meet/${encodeURIComponent(slug)}?${GUEST_CLAIM_PARAM}=1`);
}

/** The meeting pass this browser kept for the room as a guest, or null. */
export function rememberedGuestPass(roomName: MeetingRecord["roomName"]): string | null {
  return rememberedMeetingPass(roomName);
}

export interface GuestClaimResult {
  readonly claimed: boolean;
  readonly access: string;
}

/** Throws an Error carrying the server's sentence (and `remedy`) when refused. */
export async function claimGuestAttendance(
  api: Pick<MeetApi, "request">,
  meeting: Pick<MeetingRecord, "id" | "roomName">,
  pass: string,
): Promise<GuestClaimResult> {
  const response = await api.request({
    path: GUEST_CLAIM_ROUTE,
    method: "POST",
    requireAuth: true,
    operation: "meet.claim",
    headers: { [MEETING_PASS_HEADER]: pass },
    body: { meeting_id: meeting.id },
  });
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
        : "These notes could not be added to your account.";
    const error = new Error(message) as Error & { remedy?: string };
    if (typeof source.remedy === "string") error.remedy = source.remedy;
    throw error;
  }
  return {
    claimed: body.claimed === true,
    access: typeof body.access === "string" ? body.access : "summary",
  };
}
