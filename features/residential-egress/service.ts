/**
 * features/residential-egress/service.ts
 *
 * Home connections, from the browser.
 *
 * TWO PATHS, AND THE SPLIT IS THE CONTRACT'S (common-docs
 * `systems/platform/residential-egress/FEATURE.md`):
 *
 *   direct to Supabase  →  reading the person's own computers, and writing the
 *                          two columns RLS lets the owner write (`enabled`,
 *                          `display_name`). Routing is by `created_by`, never
 *                          by organization, so the read filters on the caller's
 *                          own id — a row someone else's org shares with them
 *                          is not "your computer".
 *   Python (`/egress/*`) →  everything that needs a secret or a live socket:
 *                          removing a computer revokes its token and closes the
 *                          socket, and pairing mints the one-time device token.
 *                          No browser can do either.
 *
 * There is no Next.js middle tier on either path.
 *
 * Every Python call below goes through `lib/api/typed-client.ts`, so the
 * PATH and REQUEST BODY are contract-checked against
 * `types/python-generated/api-types.ts`. The 200 response for each of these
 * operations is generated as an untyped `{ [key: string]: unknown }` dict
 * (the backend hands back a plain dict, not a Pydantic response model), so
 * the response is still asserted against the hand types in `./types.ts` —
 * see that file's header.
 */

"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/utils/supabase/client";
import { apiDelete, apiGet, apiPost, buildPath } from "@/lib/api/typed-client";
import type { Database } from "@/types/database.types";

import {
  EGRESS_DEVICE_COLUMNS,
  type EgressDeviceRow,
  type EgressPairingApproveResult,
  type EgressPairingByCode,
  type EgressStatus,
} from "./types";

/**
 * A supabase client scoped to the `platform` schema — same pattern as
 * `features/files/filesDb.ts`'s `filesDb()`.
 */
function egressDb<C extends SupabaseClient<Database>>(client: C) {
  return client.schema("platform");
}

// ---------------------------------------------------------------------------
// Direct reads and writes — supabase-js under RLS
// ---------------------------------------------------------------------------

/**
 * Every home connection this person owns.
 *
 * `.returns<EgressDeviceRow[]>()` because `EGRESS_DEVICE_COLUMNS` is a
 * PROJECTED subset of `platform.egress_device` (see ./types.ts) — the
 * generated row type includes `token_hash`/`token_prefix`, which this select
 * never asks for. The row count is a handful per person, so there is no
 * `readAllRows` question here — but this is deliberately NOT an existence
 * check or a set subtraction, which is the shape that would need one.
 */
export async function fetchHomeConnections(
  userId: string,
): Promise<EgressDeviceRow[]> {
  const { data, error } = await egressDb(supabase)
    .from("egress_device")
    .select(EGRESS_DEVICE_COLUMNS)
    .eq("created_by", userId)
    .is("deleted_at", null)
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .returns<EgressDeviceRow[]>();
  if (error) throw error;
  return data ?? [];
}

/**
 * The switch, through the door. `enabled` is the user's INTENT and one of the
 * only two columns a browser may write at all — `public.egress_device_set` takes
 * `enabled` and `display_name` and nothing else, so the gateway keeps `connected`,
 * `last_seen_at`, `token_hash` and the rest and a pause here can never be erased
 * by the next heartbeat. `platform` is not a client-writable schema (DOORS-ONLY-3):
 * the base table refuses this write by policy name.
 */
export async function setHomeConnectionEnabled(
  deviceId: string,
  enabled: boolean,
): Promise<void> {
  const { error } = await supabase.rpc("egress_device_set", {
    p_device_id: deviceId,
    p_enabled: enabled,
  });
  if (error) throw error;
}

/** Rename a computer — the other column the door takes. */
export async function renameHomeConnection(
  deviceId: string,
  displayName: string,
): Promise<void> {
  const { error } = await supabase.rpc("egress_device_set", {
    p_device_id: deviceId,
    p_display_name: displayName,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Python — the calls a browser cannot make against the table
// ---------------------------------------------------------------------------

/**
 * Remove a computer: revokes its token, closes its socket, soft-deletes the
 * row. The helper on that machine sees a `4401` close and says so in plain
 * words. A direct soft-delete from the browser would leave the socket alive
 * with a live token, which is why this is a server call.
 */
export async function removeHomeConnection(deviceId: string): Promise<void> {
  await apiDelete(buildPath("/egress/devices/{device_id}", { device_id: deviceId }));
}

/**
 * What a pairing code describes, for the approval card. An expired or unknown
 * code is a 404 carrying a sentence — the caller renders that sentence rather
 * than a blank card.
 *
 * The contract's `describe_pairing_GET` 200 is an untyped dict (see this
 * file's header), so the response is asserted against the hand-typed
 * `EgressPairingByCode` from ./types.ts.
 */
export async function fetchPairingByCode(
  userCode: string,
): Promise<EgressPairingByCode> {
  const { data } = await apiGet(
    buildPath("/egress/pairings/by-code/{user_code}", { user_code: userCode }),
  );
  return data as unknown as EgressPairingByCode;
}

/**
 * Approve: creates the device under the caller and mints its one-time token.
 * Asserted against `EgressPairingApproveResult` for the same reason as
 * {@link fetchPairingByCode}.
 */
export async function approvePairing(
  userCode: string,
): Promise<EgressPairingApproveResult> {
  const { data } = await apiPost(
    buildPath("/egress/pairings/by-code/{user_code}/approve", {
      user_code: userCode,
    }),
    undefined,
  );
  return data as unknown as EgressPairingApproveResult;
}

/** Deny: the code is spent and the helper is told no. */
export async function denyPairing(userCode: string): Promise<void> {
  await apiPost(
    buildPath("/egress/pairings/by-code/{user_code}/deny", {
      user_code: userCode,
    }),
    undefined,
  );
}

/**
 * The one-call summary — whether the capability is on at all, and the caller's
 * computers with live status. Used where a direct table read would not answer
 * the first half (the cloud-browser panel needs `feature_enabled`).
 * Asserted against `EgressStatus` for the same reason as
 * {@link fetchPairingByCode}.
 */
export async function fetchEgressStatus(): Promise<EgressStatus> {
  const { data } = await apiGet("/egress/status");
  return data as unknown as EgressStatus;
}
