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
 * 🚨 TODO(residential-egress owner): switch to typed-client once
 * `pnpm sync-types` carries /egress. Every Python call below goes through
 * `lib/python-client.ts`'s raw helpers with hand-typed shapes from
 * `./types.ts`, because `types/python-generated/api-types.ts` has no `/egress`
 * paths yet (the aidream routes are being built in parallel with this file).
 * When it does: delete the hand types, import the generated ones, and move
 * these four calls to `lib/api/typed-client.ts`.
 */

"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/utils/supabase/client";
import { del, getJson, postJson } from "@/lib/python-client";

import {
  EGRESS_DEVICE_COLUMNS,
  type EgressDatabase,
  type EgressDeviceRow,
  type EgressPairingApproveResult,
  type EgressPairingByCode,
  type EgressStatus,
} from "./types";

/**
 * The ONE place the hand-typed schema meets the shared client.
 *
 * 🚨 TODO(residential-egress owner): after `pnpm db-types` carries
 * `platform.egress_device`, delete this helper and its `EgressDatabase`
 * shape — every call below then type-checks against the generated file with
 * no change to its body. The cast is confined here on purpose: one line to
 * remove, and nothing downstream is loosely typed in the meantime.
 */
function egressDb() {
  return (
    supabase as unknown as SupabaseClient<EgressDatabase, "platform">
  ).schema("platform");
}

// ---------------------------------------------------------------------------
// Direct reads and writes — supabase-js under RLS
// ---------------------------------------------------------------------------

/**
 * Every home connection this person owns.
 *
 * `.returns<EgressDeviceRow[]>()` because `platform.egress_device` is not in
 * `types/database.types.ts` yet (see the TODO in ./types.ts). The row count is
 * a handful per person, so there is no `readAllRows` question here — but this
 * is deliberately NOT an existence check or a set subtraction, which is the
 * shape that would need one.
 */
export async function fetchHomeConnections(
  userId: string,
): Promise<EgressDeviceRow[]> {
  const { data, error } = await egressDb()
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
 * The switch. `enabled` is the user's INTENT and the only behavioural column
 * the owner's RLS policy lets a browser write — the gateway owns `connected`,
 * `last_seen_at` and the rest, so a pause here can never be erased by the next
 * heartbeat.
 */
export async function setHomeConnectionEnabled(
  deviceId: string,
  enabled: boolean,
): Promise<void> {
  const { error } = await egressDb()
    .from("egress_device")
    .update({ enabled })
    .eq("id", deviceId);
  if (error) throw error;
}

/** Rename a computer. The other column the owner may write. */
export async function renameHomeConnection(
  deviceId: string,
  displayName: string,
): Promise<void> {
  const { error } = await egressDb()
    .from("egress_device")
    .update({ display_name: displayName })
    .eq("id", deviceId);
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
  await del(`/egress/devices/${encodeURIComponent(deviceId)}`);
}

/**
 * What a pairing code describes, for the approval card. An expired or unknown
 * code is a 404 carrying a sentence — the caller renders that sentence rather
 * than a blank card.
 */
export async function fetchPairingByCode(
  userCode: string,
): Promise<EgressPairingByCode> {
  const { data } = await getJson<EgressPairingByCode>(
    `/egress/pairings/by-code/${encodeURIComponent(userCode)}`,
  );
  return data;
}

/** Approve: creates the device under the caller and mints its one-time token. */
export async function approvePairing(
  userCode: string,
): Promise<EgressPairingApproveResult> {
  const { data } = await postJson<EgressPairingApproveResult>(
    `/egress/pairings/by-code/${encodeURIComponent(userCode)}/approve`,
    {},
  );
  return data;
}

/** Deny: the code is spent and the helper is told no. */
export async function denyPairing(userCode: string): Promise<void> {
  await postJson<unknown>(
    `/egress/pairings/by-code/${encodeURIComponent(userCode)}/deny`,
    {},
  );
}

/**
 * The one-call summary — whether the capability is on at all, and the caller's
 * computers with live status. Used where a direct table read would not answer
 * the first half (the cloud-browser panel needs `feature_enabled`).
 */
export async function fetchEgressStatus(): Promise<EgressStatus> {
  const { data } = await getJson<EgressStatus>("/egress/status");
  return data;
}
