// lib/services/guest-oauth-transfer.ts
//
// Server-only: the OAuth twin of guest promotion (D20 fix).
//
// Email/password sign-up promotes the anonymous guest auth.users row IN
// PLACE (lib/services/guest-promotion.ts) — same UUID, so everything the
// guest created stays theirs. OAuth sign-up CANNOT do that: the Supabase
// admin API has no way to attach a Google/GitHub/Apple identity to an
// existing user (GoTrueAdminApi: createUser / updateUserById / deleteUser /
// generateLink only — verified against @supabase/auth-js), and client-side
// `linkIdentity` needs the anon session, which is minted server-side by
// Python and never reaches the browser. So for OAuth we TRANSFER ownership
// instead: the `public.transfer_guest_data_to_user` SECURITY DEFINER RPC
// (migrations/guest_oauth_data_transfer.sql) repoints every row owned by the
// anon UUID — it discovers ALL FK columns referencing auth.users(id) at
// runtime, so new tables are covered automatically — writes an audit row to
// `public.guest_conversion_audit`, stamps `guest_executions.converted_to_user_id`,
// and nulls `guest_executions.auth_user_id` so the Python guest registry
// (aidream _guest_registry_impl.py) mints a fresh anon identity for future
// guest activity on that device.
//
// Carrier: the OAuth server actions can't hand form fields to the provider
// round-trip, so they stash the fingerprint in a short-lived httpOnly cookie
// (`stashGuestFingerprintForOAuth`) that /auth/callback reads after the code
// exchange (`transferGuestDataAfterOAuth`) and then clears.
//
// FAIL-OPEN GUARANTEE: every path in this module degrades to "normal OAuth
// login succeeds, guest data stays orphaned" (the pre-fix behavior). Nothing
// here may ever block or fail an OAuth sign-in. Failures log LOUDLY instead.

import "server-only";

import { cookies } from "next/headers";

import { createAdminClient } from "@/utils/supabase/adminClient";
import { looksLikeFingerprint } from "@/lib/services/guest-promotion";

/** Short-lived httpOnly carrier for the guest fingerprint across the OAuth
 *  provider round-trip. Set by the OAuth server actions, consumed and cleared
 *  by /auth/callback. */
export const GUEST_OAUTH_FP_COOKIE = "matrx_guest_oauth_fp";

const COOKIE_MAX_AGE_SECONDS = 600; // 10 minutes — one OAuth round-trip.

/**
 * Called at the top of every OAuth sign-in/sign-up server action. Reads the
 * `guestFingerprint` hidden field (GuestFingerprintField) from the form and
 * stashes it in a short-lived httpOnly cookie so the callback can act on it.
 * Never throws; no fingerprint (or a low-entropy `temp_` fallback) simply
 * means no transfer.
 */
export async function stashGuestFingerprintForOAuth(
  formData: FormData | undefined,
): Promise<void> {
  try {
    const fp = formData?.get("guestFingerprint")?.toString();
    if (!looksLikeFingerprint(fp)) return;
    const jar = await cookies();
    jar.set(GUEST_OAUTH_FP_COOKIE, fp, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });
  } catch (err) {
    // Fail open: OAuth proceeds without guest transfer.
    console.error(
      "[guest-oauth-transfer] LOUD: failed to stash guest fingerprint cookie — OAuth continues without transfer:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

export type GuestOAuthTransferResult =
  | { transferred: true; anonUserId: string; totalRows: number }
  | {
      transferred: false;
      reason:
        | "invalid_fingerprint" // missing / low-entropy fingerprint
        | "no_guest" // no guest row or no live anon uid for this fingerprint
        | "not_anonymous" // mapped uid is a real account (email-path promoted)
        | "error"; // unexpected failure — logged loudly, OAuth unaffected
      message?: string;
    };

/**
 * One-time guest → OAuth-user data transfer. Called from /auth/callback after
 * a successful code exchange, with the fingerprint from the stash cookie and
 * the freshly authenticated user's id. Idempotent: after a transfer the
 * guest row's auth_user_id is nulled, so a repeat call finds no guest.
 */
export async function transferGuestDataAfterOAuth(
  fingerprint: string,
  newUserId: string,
): Promise<GuestOAuthTransferResult> {
  if (!looksLikeFingerprint(fingerprint)) {
    return { transferred: false, reason: "invalid_fingerprint" };
  }

  try {
    const admin = createAdminClient();

    // 1. Resolve the anon auth uid for this fingerprint.
    const { data: rows, error: selErr } = await admin
      .from("guest_executions")
      .select("id, auth_user_id")
      .eq("fingerprint", fingerprint)
      .limit(1);

    if (selErr) {
      console.error(
        "[guest-oauth-transfer] LOUD: guest_executions lookup failed — guest data stays orphaned:",
        selErr.message,
      );
      return { transferred: false, reason: "error", message: selErr.message };
    }

    const row = rows?.[0];
    if (!row?.auth_user_id) {
      // Never had a server-minted guest identity, or it was already
      // transferred/promoted (auth_user_id nulled). Nothing to do.
      return { transferred: false, reason: "no_guest" };
    }

    const anonId = row.auth_user_id;
    if (anonId === newUserId) {
      // Email-path promotion already made this UUID the real account.
      return { transferred: false, reason: "not_anonymous" };
    }

    // 2. Confirm the mapped uid is still anonymous (the RPC re-checks, but a
    //    clean early exit keeps logs honest).
    const { data: got, error: getErr } = await admin.auth.admin.getUserById(anonId);
    if (getErr || !got?.user) {
      console.error(
        "[guest-oauth-transfer] LOUD: mapped auth_user_id not found — stale guest row:",
        getErr?.message,
      );
      return { transferred: false, reason: "no_guest" };
    }
    if (got.user.is_anonymous === false) {
      return { transferred: false, reason: "not_anonymous" };
    }

    // 3. Single idempotent SECURITY DEFINER transfer (audited server-side).
    const { data: result, error: rpcErr } = await admin.rpc(
      "transfer_guest_data_to_user",
      {
        p_anon_user_id: anonId,
        p_new_user_id: newUserId,
        p_fingerprint: fingerprint,
      },
    );

    if (rpcErr) {
      console.error(
        "[guest-oauth-transfer] LOUD: transfer_guest_data_to_user RPC failed — guest data stays orphaned:",
        rpcErr.message,
      );
      return { transferred: false, reason: "error", message: rpcErr.message };
    }

    const summary = (result ?? {}) as {
      status?: string;
      total_rows?: number;
      transferred?: Record<string, number>;
      skipped?: Record<string, string>;
      message?: string;
    };

    if (summary.status !== "transferred") {
      console.error(
        "[guest-oauth-transfer] LOUD: transfer refused by RPC:",
        summary.message ?? summary.status,
      );
      return {
        transferred: false,
        reason: "error",
        message: summary.message ?? summary.status,
      };
    }

    if (summary.skipped && Object.keys(summary.skipped).length > 0) {
      console.error(
        "[guest-oauth-transfer] LOUD: transfer completed with skipped columns (see guest_conversion_audit):",
        JSON.stringify(summary.skipped),
      );
    }

    console.log(
      `[guest-oauth-transfer] Guest data transferred: anon ${anonId} -> user ${newUserId}, ` +
        `${summary.total_rows ?? 0} rows across ${JSON.stringify(summary.transferred ?? {})}`,
    );

    // 4. Retire the drained anon user: it owns nothing and its fingerprint
    //    mapping is cleared; ban it so it can never mint a session again.
    //    Non-fatal — the transfer already succeeded.
    const { error: banErr } = await admin.auth.admin.updateUserById(anonId, {
      ban_duration: "876000h",
    });
    if (banErr) {
      console.error(
        "[guest-oauth-transfer] LOUD: transfer succeeded but retiring (banning) anon user failed:",
        banErr.message,
      );
    }

    return {
      transferred: true,
      anonUserId: anonId,
      totalRows: summary.total_rows ?? 0,
    };
  } catch (err) {
    console.error(
      "[guest-oauth-transfer] LOUD: unexpected failure — OAuth login unaffected, guest data stays orphaned:",
      err instanceof Error ? err.message : String(err),
    );
    return {
      transferred: false,
      reason: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
