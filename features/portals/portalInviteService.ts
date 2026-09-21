"use client";

// features/portals/portalInviteService.ts
//
// THE CLIENT HALF OF A PORTAL INVITATION — the two calls the accept page makes.
//
// A plumbing customer invited to Rincon Plumbing's portal follows her link,
// signs in or makes an account with that address, and sees her own jobs and her
// own invoices. This file is the browser's whole part of that, and it is two
// thin calls on declared client doors.
//
// 🚨 IT DECIDES NOTHING, AND THAT IS THE DESIGN. `public.portal_share_peek`
// answers what the link offers, off the TOKEN alone, to somebody who may have no
// account at all; `custom.portal_invite_accept` is the ONE door that turns a
// portal invitation into access, and it decides once — the token proves an admin
// of that organization made the invitation — and then performs the bind and the
// grant AS THAT AUTHORITY, in one transaction. Nothing in this file may add a
// condition to either, because a second opinion here would be a second answer to
// "who can see this".
//
// WHY NOT `iam.invitations` DIRECTLY: the invitation IS the credential. Reading
// or writing that table from a browser would put the decision in the client.
//
// THE SIBLING IS `features/sharing/outside/outsideShareService.ts` — a table
// share is the same primitive with a different target type, and these two files
// are deliberately the same shape.

import { createClient } from "@/utils/supabase/client";

/**
 * Schema `custom` is not in `types/database.types.ts` and that is correct — the
 * reasoning is written out in `features/forms/service.ts`. The store is reached
 * through its doors, so the cast happens here, once, named, with every answer
 * shape declared below.
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

function custom(): StoreCaller {
  return (createClient() as unknown as { schema(name: string): StoreCaller }).schema("custom");
}

/**
 * What a portal invitation link offers. Eight states, each with a sentence and
 * who to ask — because "it did not work" with no reason is the dead end this
 * page exists to remove.
 *
 * `unknown` carries NOTHING but the one sentence: no portal, no organization, no
 * inviter. A link can never be used to discover that something is there.
 */
export interface PortalSharePeek {
  state:
    | "ready"
    | "sign_in_needed"
    | "wrong_account"
    | "accepted"
    | "revoked"
    | "expired"
    | "portal_closed"
    | "lane_closed"
    | "unknown";
  usable: boolean;
  portal?: string;
  slug?: string | null;
  organization?: string;
  organization_id?: string;
  /** The client record this invitation is for, in the business's own words. */
  client?: string;
  /** What she will see, in the Tables' own names — "your jobs and invoices". */
  sees?: string;
  inviter?: string;
  /** Masked (`t••••@test.com`) unless the reader is signed in as that person. */
  invited_email?: string;
  signed_in_as?: string | null;
  expires_at?: string | null;
  offer?: string;
  say: string;
  ask?: string;
}

/** What `custom.portal_invite_accept` answers when the link is followed. */
export interface PortalShareAccepted {
  accepted: boolean;
  organization_id: string;
  organization: string | null;
  portal_id: string;
  portal: string;
  slug: string;
  principal_id: string;
  client_record_id: string;
  client: string;
  sees: string;
  level: string;
  say: string;
}

/** What is on offer, asked anonymously off the token. Grants nothing. */
export async function peekPortalShare(token: string): Promise<PortalSharePeek> {
  const { data, error } = await (createClient() as unknown as StoreCaller).rpc(
    "portal_share_peek",
    { p_token: token },
  );
  if (error) throw new Error(error.message);
  return data as unknown as PortalSharePeek;
}

/** Follow the link. The ONE door; it writes the bind and the grant together. */
export async function acceptPortalShare(token: string): Promise<PortalShareAccepted> {
  const { data, error } = await custom().rpc("portal_invite_accept", { p_token: token });
  if (error) throw new Error(error.message);
  return data as unknown as PortalShareAccepted;
}

/**
 * The link somebody can actually paste into a text message. The store answers a
 * PATH — it has no idea what hostname this app is served on — so the origin is
 * added here, from the browser the sharer is standing in.
 */
export function absolutePortalInviteUrl(acceptPath: string): string {
  if (/^https?:\/\//.test(acceptPath)) return acceptPath;
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.aimatrx.com");
  return `${origin}${acceptPath}`;
}
