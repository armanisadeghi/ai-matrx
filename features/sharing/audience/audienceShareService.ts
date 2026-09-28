"use client";

// features/sharing/audience/audienceShareService.ts
//
// "SHARE WITH EVERYONE IN …" — the client half of the group-sharing primitive
// (access ladder T-32). An AUDIENCE is a set of people derived from a record
// they share: today a meeting's invitees and attendees; later a thread's
// participants, a project's members, an event's attendees. The database owns
// the list of audiences (`iam.audience_kinds()`), who is in each, what records
// are shared, and every decision. This file decides nothing: it calls the four
// doors and shapes their answers.
//
// Every recipient becomes an ORDINARY person share (iam.permissions); people
// with an email and no account get one emailed link. Running it twice adds
// nobody twice.

import { createClient } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";

/** The audiences the database knows. Adding one is a database row, then a word here. */
export type AudienceKind = "meeting";

export type AudienceLevel = "viewer" | "commenter" | "editor" | "admin";

/**
 * What would happen to one person:
 * - `will_share`      has an account and is missing something — gets it
 * - `has_access`      already can open everything at this Permission
 * - `invite_by_email` no account, has an email — gets an emailed link
 * - `invited`         already sent a link that is still open
 * - `removed`         someone took this person's access away earlier — not re-added
 * - `left_out`        unticked in this dialog
 * - `unreachable`     joined as a guest with no account and no email
 */
export type AudiencePersonState =
  | "will_share"
  | "has_access"
  | "invite_by_email"
  | "invited"
  | "removed"
  | "left_out"
  | "unreachable";

export interface AudienceAsset {
  resource_type: string;
  resource_id: string;
  label: string;
}

export interface AudiencePerson {
  key: string;
  user_id: string | null;
  email: string | null;
  name: string | null;
  why: string;
  state: AudiencePersonState;
  missing: AudienceAsset[];
}

export interface AudienceCounts {
  will_share: number;
  invite_by_email: number;
  invited: number;
  has_access: number;
  removed: number;
  left_out: number;
  unreachable: number;
}

export interface AudiencePlan {
  kind: AudienceKind;
  label: string;
  source_noun: string;
  source_id: string;
  title: string;
  href: string;
  level: AudienceLevel;
  means: string;
  assets: AudienceAsset[];
  people: AudiencePerson[];
  counts: AudienceCounts;
}

export interface AudiencePreview extends AudiencePlan {
  /** The knob `…share_with_attendees_after_meeting` for this person: offer · share · off. */
  offer_mode: "offer" | "share" | "off";
  default_level: AudienceLevel;
}

export interface AudienceShareResult extends AudiencePlan {
  shared_with: string[];
  invited: string[];
  told: number;
  say: string;
}

/** One door answer → a typed object. A shape the door never answers is a thrown error, never a guess. */
function asObject<T>(data: Json | null, door: string): T {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${door} answered something that is not a result object.`);
  }
  return data as unknown as T;
}

function messageOf(error: { message: string; hint?: string | null }): string {
  return error.hint ? `${error.message} ${error.hint}` : error.message;
}

/** Who is in the audience and what each would get, at `level` (null = the person's knob default). */
export async function previewAudienceShare(
  kind: AudienceKind,
  sourceId: string,
  level: AudienceLevel | null,
): Promise<AudiencePreview> {
  const { data, error } = await createClient().rpc("audience_share_preview", {
    p_kind: kind,
    p_source_id: sourceId,
    ...(level ? { p_level: level } : {}),
  });
  if (error) throw new Error(messageOf(error));
  return asObject<AudiencePreview>(data, "audience_share_preview");
}

/** One click: share with everyone in the audience except the `exclude` keys. */
export async function shareWithAudience(
  kind: AudienceKind,
  sourceId: string,
  level: AudienceLevel,
  exclude: string[],
): Promise<AudienceShareResult> {
  const { data, error } = await createClient().rpc("share_with_audience", {
    p_kind: kind,
    p_source_id: sourceId,
    p_level: level,
    p_exclude: exclude,
  });
  if (error) throw new Error(messageOf(error));
  return asObject<AudienceShareResult>(data, "share_with_audience");
}

export type RecordSharePeekState =
  | "unknown"
  | "revoked"
  | "accepted"
  | "expired"
  | "sign_in_needed"
  | "wrong_account"
  | "ready";

export interface RecordSharePeek {
  state: RecordSharePeekState;
  title?: string | null;
  what?: string | null;
  source_noun?: string | null;
  organization?: string | null;
  inviter?: string | null;
  level?: AudienceLevel;
  means?: string | null;
  invited_email?: string | null;
  href?: string | null;
  say: string;
  ask: string;
}

export interface RecordShareAccepted {
  accepted: true;
  title: string | null;
  href: string | null;
  level: AudienceLevel;
  say: string;
}

/** What an emailed share link offers — works signed out; the token is the identity. */
export async function peekRecordShare(token: string): Promise<RecordSharePeek> {
  const { data, error } = await createClient().rpc("record_share_peek", {
    p_token: token,
  });
  if (error) throw new Error(messageOf(error));
  return asObject<RecordSharePeek>(data, "record_share_peek");
}

/** The invited person opens what was shared (must be signed in as the invited address). */
export async function acceptRecordShare(
  token: string,
): Promise<RecordShareAccepted> {
  const { data, error } = await createClient().rpc("record_share_accept", {
    p_token: token,
  });
  if (error) throw new Error(messageOf(error));
  return asObject<RecordShareAccepted>(data, "record_share_accept");
}
