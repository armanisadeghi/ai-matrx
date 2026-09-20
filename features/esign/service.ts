import "server-only";

// features/esign/service.ts — THE PUBLIC SIGNING PAGE'S ONLY DATA ACCESS.
//
// PRODUCTS row 16: *"Have the client sign this before we start."* This module is
// the app's whole half of it — three doors, all server-lane, and nothing else
// anywhere in the repo touches them.
//
// WHY THE SERVER IS THE CALLER, AND NOT THE BROWSER.
// --------------------------------------------------
// `custom.sign_request_public`, `custom.sign_request_sign` and
// `custom.sign_request_decline` are declared `server_only` in
// `platform.client_callable_door`, beside `custom.form_public` and
// `custom.form_submit`, for a reason that is sharper here than it is for a form:
// a signature certificate says WHERE the signer signed from and ON WHAT. The
// address and the user agent are things the server reads off the request; a
// browser can only assert them, and an asserted address on a certificate is a
// certificate that lies. Schema `custom` stays revoked from `anon`; the grant
// these doors hold is to `service_role`, the role behind `SUPABASE_SECRET_KEY`,
// which never leaves this process.
//
// WHAT THE PUBLIC READ CAN AND CANNOT SEE. `custom.sign_request_public` answers
// the FROZEN document text, who was asked, and the state. It reads no other
// record, no other request and no count. A link that was never ours, a request
// that is gone, a wrong secret and an organization whose store is switched off
// all answer with `found: false` and the SAME single sentence, so the link
// cannot be used to learn that anything is there.

import { cache } from "react";

import { createAdminClient } from "@/utils/supabase/adminClient";

/**
 * THE STORE'S SCHEMA IS NOT IN `types/database.types.ts`, AND THAT IS CORRECT —
 * the record store is reached through its doors, never as tables a screen
 * selects from. `features/forms/service.ts` makes the same cast for the same
 * reason; the two result shapes below are declared in full, so a door that
 * changes its answer shows up as a type error here rather than as a wrong screen.
 */
type StoreCaller = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: { message: string; hint?: string | null } | null;
  }>;
};

function storeDoors(): StoreCaller {
  return (createAdminClient() as unknown as { schema(name: string): StoreCaller }).schema("custom");
}

/** Every state a signature request can be in. The STORE derives it; nothing here does. */
export type SignRequestState =
  | "sent"
  | "viewed"
  | "signed"
  | "declined"
  | "invalidated"
  | "expired";

/** What `custom.sign_request_public` answers, exactly. */
export interface PublicSignRequest {
  found: boolean;
  state?: SignRequestState;
  /** True only while the request can still be answered. */
  signable?: boolean;
  /** The store's own sentence, and the only copy the page shows for a closed request. */
  message: string | null;
  document_title?: string | null;
  document_version?: number;
  /** The SHA-256 of the text below, frozen when the request was sent. */
  document_hash?: string;
  /** The FROZEN document — the text that was rendered when the ask was made. */
  body?: string;
  signer_name?: string | null;
  signer_email?: string | null;
  expires_at?: string | null;
  signed_name?: string | null;
  signed_at?: string | null;
}

/**
 * The request behind a signing link, or a `found: false` answer carrying the one
 * sentence the page shows. `cache()` dedupes it within a request, because
 * `generateMetadata` and the page both want it.
 *
 * THIS CALL HAS A SIDE EFFECT AND THAT IS THE DESIGN: the door marks the request
 * VIEWED on its first successful open, and invalidates it when the record has
 * moved since the ask. Both are facts about somebody opening the link, which is
 * exactly what this is.
 */
export const publicSignRequest = cache(
  async (token: string, origin: string | null): Promise<PublicSignRequest> => {
    if (!TOKEN.test(token)) {
      return { found: false, message: NO_LINK };
    }
    const { data, error } = await storeDoors().rpc("sign_request_public", {
      p_token: token,
      p_origin: origin,
    });
    if (error) {
      // NOTHING FAILS SILENTLY. A door that refused is not a missing request: a
      // "this link does not work" here would tell the signer their link is wrong
      // when it is ours that is.
      throw new Error(`custom.sign_request_public refused: ${error.message}`);
    }
    return (data as PublicSignRequest | null) ?? { found: false, message: NO_LINK };
  },
);

/** What both write doors answer. `state` is the store's own word, never derived here. */
export interface SignOutcome {
  found: boolean;
  signed?: boolean;
  declined?: boolean;
  state?: SignRequestState;
  message: string | null;
  signature_id?: string | null;
  signature_file_id?: string | null;
  document_hash?: string | null;
}

/**
 * Sign. The ADDRESS, the BROWSER and the ORIGIN come from the request the server
 * is holding — never from the body — which is the whole reason this door is
 * server-lane.
 */
export async function signPublicRequest(args: {
  token: string;
  signedName: string;
  mark: "typed" | "drawn";
  image: string | null;
  ip: string | null;
  userAgent: string | null;
  origin: string;
}): Promise<SignOutcome> {
  return writeDoor("sign_request_sign", {
    p_token: args.token,
    p_signed_name: args.signedName,
    p_mark: args.mark,
    p_image: args.image,
    p_ip: args.ip,
    p_user_agent: args.userAgent,
    p_origin: args.origin,
  });
}

/** Decline, with or without a reason. A decline is an ANSWER, not a failure. */
export async function declinePublicRequest(args: {
  token: string;
  reason: string | null;
  ip: string | null;
  userAgent: string | null;
}): Promise<SignOutcome> {
  return writeDoor("sign_request_decline", {
    p_token: args.token,
    p_reason: args.reason,
    p_ip: args.ip,
    p_user_agent: args.userAgent,
  });
}

async function writeDoor(fn: string, args: Record<string, unknown>): Promise<SignOutcome> {
  const { data, error } = await storeDoors().rpc(fn, args);
  if (error) {
    // THE STORE'S OWN SENTENCE, CARRIED WHOLE. It says "Please type your name as
    // you sign." and "The drawing did not arrive. Please sign again." — words a
    // person wrote, which is what lets the screen point at what to fix.
    const err = new Error(error.message) as Error & { hint?: string };
    if (error.hint) err.hint = error.hint;
    throw err;
  }
  return (data as SignOutcome | null) ?? { found: false, message: NO_LINK };
}

const NO_LINK =
  "This signing link does not work. It may have been mistyped, or it may have been replaced by a newer one.";

/** 64 bytes of base64url, unpadded — what `custom.sign_token_encode` produces. */
const TOKEN = /^[A-Za-z0-9_-]{86}$/;
