"use client";

// features/sharing/outside/outsideShareService.ts
//
// SHARING A TABLE WITH SOMEBODY OUTSIDE THE ORGANIZATION — the client half.
//
// THE EVERYDAY CASE. A plumber gives ONE customer read-only access to the Jobs
// table. A lab shares one experiments table with a collaborator at another
// university. Until 21 September the store refused it, in a good sentence, and
// the Share dialog offered no way forward from that sentence.
//
// 🚨 THIS FILE DECIDES NOTHING. Every one of these is a thin call on a declared
// client door (`platform.client_callable_door`, declared by SHARE-OUT). The
// store decides who may invite, at what level, and what an outside person can
// then see — through THE ONE LADDER, the same one that answers for a colleague.
// A second opinion here would be a second answer to "who can see this", which
// is the one question a platform may not answer twice.
//
// WHY THE DOORS AND NOT `iam.invitations` DIRECTLY: the invitation carries the
// table grant, and the accept writes it. Reading or writing that table from the
// browser would put the decision in the client.

import { createClient } from "@/utils/supabase/client";

/**
 * THE STORE'S SCHEMA IS NOT IN `types/database.types.ts`, AND THAT IS CORRECT —
 * the reasoning is written out in full in `features/forms/service.ts`, and
 * `features/portals/service.ts` and `features/booking/service.ts` reach the
 * store the same way. Schema `custom` is reached through its DOORS, so the cast
 * happens HERE, once, named — and every answer shape is declared above, so a
 * door that changes what it answers shows up as a type error rather than as a
 * wrong screen.
 */
type StoreCaller = {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: { message: string; hint?: string | null; code?: string | null } | null;
  }>;
};

/** One rung this person may actually hand out, in the store's own words. */
export interface OutsideShareLevel {
  level: string;
  label: string;
  means: string;
}

/** One outside person on this table, joined or not. */
export interface OutsideShareInvitation {
  invitation_id: string;
  email: string;
  level: string;
  level_label: string;
  status: string;
  /** `false` is the "invited, not yet joined" state the dialog draws. */
  joined: boolean;
  say: string;
  expires_at: string | null;
  invited_at: string;
  expired: boolean;
  /**
   * 🚨 THE LINK THE SHARER CAN HAND OVER THEMSELVES — the ordinary case, not a
   * fallback. A plumber texts his customer the link; a lab emails a
   * collaborator from their own address. `null` when the row has been accepted
   * (nothing left to open) or when this viewer may not invite.
   */
  accept_path: string | null;
}

/**
 * WHETHER THIS SERVER CAN ACTUALLY SEND AN EMAIL — three answers, never two.
 *
 * The browser cannot know whether `RESEND_API_KEY` is set on the server, so the
 * server stamps what its channel adapters found at boot
 * (`communication.channel_readiness`) and the door reads the stamp. `unknown`
 * means NOBODY HAS CHECKED — deliberately not `configured: false`, so "we could
 * not look" can never be drawn as "email is off".
 */
export interface ChannelReadiness {
  channel: string;
  answer: "yes" | "no" | "unknown";
  configured: boolean | null;
  checked_at: string | null;
  detail?: string;
  say: string;
}

/** What actually happened to the message, and the link either way. */
export interface OutsideShareDelivery {
  accept_path: string;
  queued: string[];
  skipped: { channel: string; why: string }[];
  email_answer: ChannelReadiness["answer"];
  say: string;
}

/** Everything the dialog needs to draw itself without guessing anything. */
export interface OutsideShareState {
  /** Has this organization opened its outside door at all? */
  lane_open: boolean;
  /** May THIS viewer invite an outside person to THIS table? */
  may_invite: boolean;
  /** May THIS viewer turn the outside lane on? (owner/admin of the org) */
  may_open_lane: boolean;
  /** The level this viewer holds on the table. `null` means none. */
  my_level: string | null;
  /** The rungs they may give — already capped at `my_level` by the store. */
  levels: OutsideShareLevel[];
  who: string;
  invitations: OutsideShareInvitation[];
  /** One sentence for the person, whatever the state. Never a knob key. */
  say: string;
  /** What this server can actually do about email, observed and stamped. */
  email_delivery: ChannelReadiness;
  /** That answer as one sentence — and it ALWAYS names the copy-the-link route. */
  email_say: string;
}

function custom(): StoreCaller {
  return (createClient() as unknown as { schema(name: string): StoreCaller }).schema("custom");
}

export async function readOutsideShare(
  organizationId: string,
  tableId: string,
): Promise<OutsideShareState> {
  const { data, error } = await custom().rpc("table_share_outside", {
    p_organization_id: organizationId,
    p_table_id: tableId,
  });
  if (error) throw new Error(error.message);
  return data as unknown as OutsideShareState;
}

export async function inviteOutside(
  organizationId: string,
  tableId: string,
  email: string,
  level: string,
): Promise<{ say: string; accept_path: string; delivery: OutsideShareDelivery }> {
  const { data, error } = await custom().rpc("table_share_outside_invite", {
    p_organization_id: organizationId,
    p_table_id: tableId,
    p_email: email,
    p_level: level,
  });
  if (error) throw new Error(error.message);
  return data as unknown as Awaited<ReturnType<typeof inviteOutside>>;
}

export async function resendOutside(
  organizationId: string,
  invitationId: string,
): Promise<{ say: string; accept_path: string; delivery: OutsideShareDelivery }> {
  const { data, error } = await custom().rpc("table_share_outside_resend", {
    p_organization_id: organizationId,
    p_invitation_id: invitationId,
  });
  if (error) throw new Error(error.message);
  return data as unknown as Awaited<ReturnType<typeof resendOutside>>;
}

export async function revokeOutside(
  organizationId: string,
  invitationId: string,
): Promise<{ say: string; grants_removed: number }> {
  const { data, error } = await custom().rpc("table_share_outside_revoke", {
    p_organization_id: organizationId,
    p_invitation_id: invitationId,
  });
  if (error) throw new Error(error.message);
  return data as unknown as { say: string; grants_removed: number };
}

/**
 * WHAT THE PERSON HOLDING THE LINK IS BEING OFFERED — read BEFORE they are asked
 * to make an account.
 *
 * 🚨 IT IS THE ONLY CALL ON THIS PAGE THAT A SIGNED-OUT READER CAN MAKE, and
 * that is deliberate: somebody outside an organization usually has no account
 * at all, so a page that redirects to sign-up before it explains anything is
 * asking a stranger to make an account for a reason it never gave them. It
 * lives in schema `public` — beside `inv_peek_invited_email`, which has
 * answered anonymously off a token for far longer — because schema `custom` is
 * revoked from `anon` by design and one door is not worth opening it.
 *
 * `state` is one of: `ready` · `sign_in_needed` · `wrong_account` · `accepted`
 * · `revoked` · `expired` · `lane_closed` · `unknown`. An UNKNOWN token gets
 * one sentence and nothing else, so a link can never be used to learn that
 * something is there.
 */
export interface TableSharePeek {
  state:
    | "ready"
    | "sign_in_needed"
    | "wrong_account"
    | "accepted"
    | "revoked"
    | "expired"
    | "lane_closed"
    | "unknown";
  usable: boolean;
  /** Absent on an unknown token — there is nothing to describe. */
  table?: string;
  table_id?: string;
  organization?: string;
  organization_id?: string;
  level?: string;
  level_label?: string;
  means?: string;
  inviter?: string;
  /** Masked (`j••••@example.com`) unless the caller IS that person. */
  invited_email?: string;
  signed_in_as?: string | null;
  expires_at?: string | null;
  /** One sentence naming the table, the organization and who shared it. */
  offer?: string;
  say: string;
  /** Who to ask. Never absent — a dead link with nobody to ask is a dead end. */
  ask: string;
}

export async function peekTableShare(token: string): Promise<TableSharePeek> {
  const { data, error } = await (
    createClient() as unknown as StoreCaller
  ).rpc("table_share_peek", { p_token: token });
  if (error) throw new Error(error.message);
  return data as unknown as TableSharePeek;
}

/**
 * The link somebody can actually paste into a text message. The store answers a
 * PATH — it has no idea what hostname this app is served on — so the origin is
 * added here, from the browser the sharer is standing in.
 */
export function absoluteInviteUrl(acceptPath: string): string {
  if (/^https?:\/\//.test(acceptPath)) return acceptPath;
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.aimatrx.com");
  return `${origin}${acceptPath}`;
}

export async function acceptOutsideShare(token: string): Promise<{
  say: string;
  organization_id: string;
  organization: string | null;
  table_id: string;
  table: string;
  level: string;
}> {
  const { data, error } = await custom().rpc("table_share_outside_accept", {
    p_token: token,
  });
  if (error) throw new Error(error.message);
  return data as unknown as Awaited<ReturnType<typeof acceptOutsideShare>>;
}

/**
 * TURNING THE ORGANIZATION'S OUTSIDE DOOR ON. The platform's own knob writer,
 * which admits an owner or an administrator of the organization and nobody
 * else — the screen only draws this when `may_open_lane` said yes, so it is
 * never a control that looks live and is not.
 */
export async function openOutsideLane(organizationId: string): Promise<void> {
  const { data, error } = await createClient()
    .schema("platform")
    .rpc("knob_override_set", {
      p_feature: "custom",
      p_key: "external_principal_enabled",
      p_scope_kind: "organization",
      p_scope_id: organizationId,
      p_organization_id: organizationId,
      p_value: true,
      p_note: "Turned on from the Share dialog, to share a table with somebody outside.",
    });
  if (error) throw new Error(error.message);
  const answer = data as { ok?: boolean; detail?: string; reason?: string } | null;
  if (!answer?.ok) {
    throw new Error(
      answer?.detail ??
        answer?.reason ??
        "The organization's outside door could not be opened, and the switch did not say why.",
    );
  }
}
