// lib/guest/session-handover.ts — THE ONE PLACE A SESSION IS REPLACED (G2 guest data, 2026-10-09).
//
// Owner ruling: guests may have data, and "we BETTER NOT lose their data in the signup process, no matter
// how many steps it takes". A visitor's guest records live in the guest's own workspace organization. When
// the browser's session is replaced — password log in, OAuth callback, email confirm / password recovery
// (`verifyOtp`), dev-login — the person may end up in a DIFFERENT account than the guest. Every one of those
// replacements runs through `handOverSession`:
//
//   1. read who the browser's guest is BEFORE the replacement (`readGuestPossession`): the verified claims
//      of the guest cookie (the anonymous JWT in this very request is the proof of possession — no ticket
//      is needed on the same browser), else the visitor id the guest lane already accepts (form field or
//      the first-party visitor cookie) mapped through the registry — the lost-session case;
//   2. replace the session;
//   3. when the result is a permanent account other than the guest, CLAIM the guest's workspace into it
//      (`users.claim_guest_workspace`: membership moves, no row moves, all or nothing, the guest is revived
//      first if retention closed it) and drop the guest cookie. A failed claim keeps the cookie, so the next
//      replacement (or the Applet's next load, `settlePendingGuestClaim`) tries again — it screams, never
//      silently.
//
// Sign-up with email + password keeps the SAME account instead (`promoteGuest`): the guest is revived,
// promoted in place, revived again (a retention run that raced the promotion is undone), then signed in.
//
// Guard: `pnpm check:session-handover` fails on any session-replacing auth call outside this file.
import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { createAdminClient } from "@/utils/supabase/adminClient";
import { ACQUISITION_VISITOR_COOKIE } from "@/lib/product-analytics/user-acquisition";
import { GUEST_AUTH_COOKIE, isGuestAuthCookie } from "@/lib/guest/guest-cookie";
import { claimGuestWorkspace, reviveGuest } from "@/lib/guest/guest-db";

export type HandoverVia = "password_login" | "oauth_callback" | "email_otp" | "dev_login" | "sign_up";

export interface GuestPossession {
  guestId: string;
  proof: "guest_session" | "visitor_id";
}

export type GuestClaimOutcome =
  | { status: "none" }
  | { status: "same_account" }
  | { status: "claimed"; guestId: string; records: number }
  | { status: "failed"; guestId: string; message: string };

const VISITOR_ID = /^[A-Za-z0-9]{16,200}$/;

/** A guessable `temp_` fallback id is never a proof of possession. */
export function looksLikeVisitorId(id: string | null | undefined): id is string {
  return typeof id === "string" && !id.startsWith("temp_") && VISITOR_ID.test(id);
}

/** Which guest this browser holds, before anything replaces its session. Never throws. */
export async function readGuestPossession(visitorId?: string | null): Promise<GuestPossession | null> {
  const jar = await cookies();
  if (jar.getAll().some((c) => isGuestAuthCookie(c.name))) {
    try {
      const guest = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL as string,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string,
        {
          cookieOptions: { name: GUEST_AUTH_COOKIE },
          cookies: { getAll: () => jar.getAll(), setAll: () => undefined },
        },
      );
      const { data } = await guest.auth.getClaims();
      const claims = data?.claims as { sub?: string; is_anonymous?: boolean } | undefined;
      if (claims?.sub && claims.is_anonymous === true) return { guestId: claims.sub, proof: "guest_session" };
    } catch (err) {
      console.error("[session-handover] LOUD: the guest cookie could not be verified:", err instanceof Error ? err.message : String(err));
    }
  }
  const candidates = [visitorId, jar.get(ACQUISITION_VISITOR_COOKIE)?.value].filter(looksLikeVisitorId);
  if (!candidates.length) return null;
  const admin = createAdminClient();
  const { data: rows, error } = await admin.schema("users").from("guest_executions").select("auth_user_id").in("fingerprint", candidates).not("auth_user_id", "is", null);
  if (error) {
    console.error("[session-handover] LOUD: the visitor's guest could not be looked up:", error.message);
    return null;
  }
  for (const row of rows ?? []) {
    if (!row.auth_user_id) continue;
    const { data: got } = await admin.auth.admin.getUserById(row.auth_user_id);
    if (got?.user?.is_anonymous === true) return { guestId: row.auth_user_id, proof: "visitor_id" };
  }
  return null;
}

async function dropGuestCookies(): Promise<void> {
  try {
    const jar = await cookies();
    for (const c of jar.getAll()) if (isGuestAuthCookie(c.name)) jar.delete(c.name);
  } catch {
    // A Server Component cannot write cookies; the next replacement (an action or route) drops them.
  }
}

/** Claim `guest`'s workspace into `accountId` (all or nothing). Screams on failure; never throws. */
export async function claimGuestInto(guest: GuestPossession, accountId: string, via: HandoverVia): Promise<GuestClaimOutcome> {
  if (guest.guestId === accountId) return { status: "same_account" };
  const { data, error } = await claimGuestWorkspace({ p_guest: guest.guestId, p_target: accountId, p_via: via });
  if (error) {
    console.error(`[session-handover] LOUD: the guest's records were NOT brought into ${accountId} (${via}); the guest cookie is kept so the next sign-in retries:`, error.message);
    return { status: "failed", guestId: guest.guestId, message: error.message };
  }
  await dropGuestCookies();
  const records = typeof data?.records === "number" ? data.records : 0;
  return { status: "claimed", guestId: guest.guestId, records };
}

type Replaced = { data: { user?: { id: string; is_anonymous?: boolean } | null } | null; error: unknown };

/**
 * Replace the browser's session through `replace` (the ONLY place a session-replacing auth call runs) and
 * bring the browser's guest records into the account it ends in. Returns `replace`'s own answer.
 */
export async function handOverSession<R extends Replaced>(
  via: HandoverVia,
  replace: () => Promise<R>,
  opts: { visitorId?: string | null } = {},
): Promise<R & { guestClaim: GuestClaimOutcome }> {
  const guest = await readGuestPossession(opts.visitorId);
  const result = await replace();
  const user = result.error ? null : (result.data?.user ?? null);
  let guestClaim: GuestClaimOutcome = { status: "none" };
  if (guest && user && user.is_anonymous !== true) guestClaim = await claimGuestInto(guest, user.id, via);
  return { ...result, guestClaim };
}

/** I7 retry: a signed-in page load with a guest cookie still present settles the claim (idempotent). */
export async function settlePendingGuestClaim(accountId: string): Promise<GuestClaimOutcome> {
  const jar = await cookies();
  if (!jar.getAll().some((c) => isGuestAuthCookie(c.name))) return { status: "none" };
  const guest = await readGuestPossession(null);
  if (!guest || guest.proof !== "guest_session") return { status: "none" };
  return claimGuestInto(guest, accountId, "password_login");
}

export type GuestPromotion =
  | { kind: "no_guest" }
  | { kind: "promoted"; userId: string }
  | { kind: "email_in_use" }
  | { kind: "failed"; message: string };

/**
 * Sign-up with email + password while the browser holds a guest: the SAME account becomes permanent, so
 * every record stays exactly where it is. Never falls back to a fresh account (that would orphan the guest).
 */
export async function promoteGuest(args: { email: string; password: string; visitorId?: string | null }): Promise<GuestPromotion> {
  const guest = await readGuestPossession(args.visitorId);
  if (!guest) return { kind: "no_guest" };
  const admin = createAdminClient();
  const revive = async () => {
    const { error } = await reviveGuest(guest.guestId);
    if (error) throw new Error(`the guest could not be reopened: ${error.message}`);
  };
  try {
    await revive(); // C2: a guest retention closed is opened before it is promoted
    const { error } = await admin.auth.admin.updateUserById(guest.guestId, { email: args.email, password: args.password, email_confirm: true });
    if (error) {
      const m = error.message.toLowerCase();
      const code = (error as { code?: string }).code;
      if (code === "email_exists" || m.includes("already been registered") || m.includes("already registered") || m.includes("already exists")) {
        return { kind: "email_in_use" };
      }
      console.error("[session-handover] LOUD: guest promotion failed — the guest is kept, no new account is made:", error.message);
      return { kind: "failed", message: error.message };
    }
    await revive(); // C3 backstop: a retention run that raced the promotion is undone
    const { error: stampErr } = await admin
      .schema("users")
      .from("guest_executions")
      .update({ converted_to_user_id: guest.guestId, converted_at: new Date().toISOString() })
      .eq("auth_user_id", guest.guestId);
    if (stampErr) console.error("[session-handover] LOUD: promotion succeeded but the registry row was not stamped:", stampErr.message);
    return { kind: "promoted", userId: guest.guestId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[session-handover] LOUD: guest promotion failed — the guest is kept:", message);
    return { kind: "failed", message };
  }
}

/** After a promotion the permanent session replaces the guest's: the guest cookie goes with it. */
export async function finishPromotion(): Promise<void> {
  await dropGuestCookies();
}

/** Short-lived carrier for the visitor id across an OAuth provider round trip (read by the callback). */
export const GUEST_VISITOR_CARRIER_COOKIE = "matrx_guest_visitor";

/**
 * Called by every OAuth server action before it leaves for the provider: keeps the form's visitor id for
 * the callback (the guest cookie itself survives the round trip; this covers a lost guest session). Never
 * throws — an OAuth sign-in never fails because of this.
 */
export async function rememberGuestVisitorId(formData: FormData | undefined): Promise<void> {
  try {
    const id = formData?.get("guestFingerprint")?.toString();
    if (!looksLikeVisitorId(id)) return;
    (await cookies()).set(GUEST_VISITOR_CARRIER_COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });
  } catch (err) {
    console.error("[session-handover] LOUD: the visitor id could not be kept for the OAuth round trip:", err instanceof Error ? err.message : String(err));
  }
}

/** The carried visitor id, read once by the callback. */
export async function takeGuestVisitorId(): Promise<string | null> {
  const jar = await cookies();
  const id = jar.get(GUEST_VISITOR_CARRIER_COOKIE)?.value ?? null;
  if (id) {
    try {
      jar.delete(GUEST_VISITOR_CARRIER_COOKIE);
    } catch {
      // read-only context; it expires in ten minutes
    }
  }
  return looksLikeVisitorId(id) ? id : null;
}
