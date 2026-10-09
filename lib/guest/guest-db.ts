// lib/guest/guest-db.ts — the two service-role-only database functions the guest handover calls.
//
// `users.claim_guest_workspace` and `users.guest_revive` (G2 guest data, 2026-10-09) are server-only
// (platform.client_callable_door: non_client_lane) and NOT YET in types/database.types.ts — this lane's
// environment has no SUPABASE_ACCESS_TOKEN for `pnpm db-types`. Until the next regeneration they are called
// over PostgREST's rpc door with explicit request/answer types (no cast). After `pnpm db-types`: replace both
// with `createAdminClient().schema("users").rpc(...)` and delete this file.
import "server-only";

type DbAnswer<T> = { data: T | null; error: { message: string } | null };

async function serviceRpc<T>(fn: string, args: Record<string, unknown>): Promise<DbAnswer<T>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return { data: null, error: { message: "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY are not set." } };
  try {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Content-Profile": "users", "Accept-Profile": "users" },
      body: JSON.stringify(args),
      cache: "no-store",
    });
    const text = await res.text();
    const body: unknown = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const message = body && typeof body === "object" && "message" in body ? String((body as { message: unknown }).message) : `HTTP ${res.status}`;
      return { data: null, error: { message } };
    }
    return { data: body as T, error: null };
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
  }
}

export interface ClaimAnswer {
  status: "claimed" | "already_claimed" | "same_person";
  records?: number;
}

export function claimGuestWorkspace(args: { p_guest: string; p_target: string; p_via: string }): Promise<DbAnswer<ClaimAnswer>> {
  return serviceRpc<ClaimAnswer>("claim_guest_workspace", args);
}

export function reviveGuest(guestId: string): Promise<DbAnswer<{ ok: boolean }>> {
  return serviceRpc<{ ok: boolean }>("guest_revive", { p_guest: guestId });
}
