/**
 * The computers the device console can open: this person's ACTIVE devices (the relay refuses an
 * inactive one), newest check-in first. Takes the Supabase client, so the server page and the
 * browser run the one query. `user_id` is what the relay checks a token against (`user_id = sub`).
 * No "use client": the server page imports it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { DeviceRow } from "../types";

/** Only what the console renders — never `select("*")`. */
export const CONSOLE_DEVICE_COLUMNS = "id, instance_name, platform, os_version, app_version, last_seen, is_active, created_at";

export async function fetchConsoleDevices(client: SupabaseClient, userId: string): Promise<DeviceRow[]> {
  const { data, error } = await client
    .from("app_instances")
    .select(CONSOLE_DEVICE_COLUMNS)
    .eq("user_id", userId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("last_seen", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as unknown as DeviceRow[];
}

/** One device, if it is this person's and active; null otherwise (the page shows the access gate). */
export async function fetchConsoleDevice(client: SupabaseClient, userId: string, deviceId: string): Promise<DeviceRow | null> {
  const { data, error } = await client
    .from("app_instances")
    .select(CONSOLE_DEVICE_COLUMNS)
    .eq("id", deviceId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as DeviceRow | null;
}
