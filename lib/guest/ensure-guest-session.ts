"use client";
// lib/guest/ensure-guest-session.ts — make the visitor's guest session, once (G2 guest data, 2026-10-09).
//
// Called by the Applet host on a signed-out visitor's FIRST save or job — never on a page view, so a bot
// or a window-shopper never gets an account. aidream mints the guest (blocked list + per-IP ceiling), binds
// this browser's visitor id to it and ADOPTS any earlier guest of this visitor id (a lost session never
// loses records); the session is installed in the guest client's own cookie. Single flight per tab, and
// per browser where Web Locks exist (two tabs never mint two guests).
import { BACKEND_URLS } from "@/lib/api/endpoints";
import { getFingerprint } from "@/lib/services/fingerprint-service";
import { guestSupabase } from "@/lib/guest/guest-supabase-client";

export interface GuestSessionAnswer {
  organizationId: string;
  adoptedFrom: string | null;
}

let inFlight: Promise<GuestSessionAnswer | null> | null = null;

async function existing(): Promise<GuestSessionAnswer | null> {
  const sb = guestSupabase();
  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  if (!user?.is_anonymous) return null;
  const { data: rows, error } = await sb.schema("iam").from("organization_member").select("organization_id").eq("user_id", user.id);
  if (error) throw new Error(`Your guest workspace could not be read: ${error.message}`);
  const orgs = [...new Set((rows ?? []).map((r) => r.organization_id).filter((o): o is string => typeof o === "string"))];
  return orgs.length === 1 ? { organizationId: orgs[0]!, adoptedFrom: null } : null;
}

async function mint(): Promise<GuestSessionAnswer | null> {
  const have = await existing();
  if (have) return have;
  const base = BACKEND_URLS.production;
  if (!base) throw new Error("The AI Matrx server address is not configured, so a guest session cannot be made.");
  const fingerprint = await getFingerprint();
  const res = await fetch(`${base.replace(/\/$/, "")}/auth/guest/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fingerprint }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: { message?: string } } | null;
    throw new Error(body?.detail?.message ?? `A guest session could not be made (HTTP ${res.status}).`);
  }
  const s = (await res.json()) as { access_token: string; refresh_token: string; organization_id: string | null; adopted_from: string | null };
  const { error } = await guestSupabase().auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
  if (error) throw new Error(`The guest session could not be kept: ${error.message}`);
  if (!s.organization_id) throw new Error("The guest session has no workspace to save in.");
  return { organizationId: s.organization_id, adoptedFrom: s.adopted_from };
}

/** The visitor's guest session (made once), answering its one workspace; throws in a sentence on failure. */
export function ensureGuestSession(): Promise<GuestSessionAnswer | null> {
  inFlight ??= (async () => {
    const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
    return locks ? locks.request("matrx-guest-session", () => mint()) : mint();
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
