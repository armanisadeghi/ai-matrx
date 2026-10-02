/**
 * Remove a computer: THE kill switch (PLAN decision 1). The row goes inactive (the relay refuses an
 * inactive device on every session start), then the relay is told to close every socket for it at
 * once with 4010 — so the Mac disconnects now, not at its next reconnect. Both halves are required;
 * the relay call alone would let the Mac straight back in, the row alone would leave live sockets.
 */

"use client";

import { supabase } from "@/utils/supabase/client";
import { writeOne } from "@/utils/supabase/writeOne";
import { getAccessTokenOrNull } from "@/lib/python-client";

import type { DeviceRow } from "../types";
import { MATRX_RELAY_URL } from "./relay";

export async function removeDevice(device: Pick<DeviceRow, "id" | "organization_id">): Promise<void> {
  // Every write names its organization explicitly — the row's own, never one chosen for it.
  const organizationId = device.organization_id;
  if (!organizationId) throw new Error("This computer's record has no organization, so it cannot be changed here");
  await writeOne(
    supabase
      .from("app_instances")
      .update({ is_active: false, organization_id: organizationId })
      .eq("id", device.id)
      .select("id"),
    { action: "remove", noun: "computer" },
  );
  const token = await getAccessTokenOrNull();
  if (!token) throw new Error("Not signed in");
  const res = await fetch(`${MATRX_RELAY_URL.replace(/\/$/, "")}/v1/devices/${encodeURIComponent(device.id)}/revoke`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  // The row is already inactive, so the relay refuses the Mac at its next session start either
  // way; a failed revoke only means its CURRENT socket lives until then. Say so, never hide it.
  if (!res.ok) throw new Error(`Removed, but the live connection could not be closed (relay ${res.status})`);
}
