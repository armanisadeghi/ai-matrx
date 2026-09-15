/**
 * features/files/devices/service.ts
 *
 * Devices & sync, direct-to-Supabase. There is no Next.js middle tier and no
 * Python hop here: this is pure UI↔DB under RLS, which is the canonical path.
 *
 * WHO WRITES WHAT (folder-sync C4, enforced by the
 * `files.sync_mappings_column_ownership` trigger, not merely documented):
 *
 *   the browser  →  desired_state, direction, knobs          (the user's INTENT)
 *   the daemon   →  state, state_reason, last_seen_at, …     (its OBSERVATION)
 *
 * That split is what makes Pause survive the next heartbeat: the user's pause
 * and the daemon's "syncing" are different columns, so neither erases the
 * other, and the UI shows "Pausing…" while they disagree. `local_path`,
 * `device_id` and `organization_id` are fixed at creation for BOTH lanes —
 * re-pointing a live mapping would skip admission (D20).
 */

"use client";

import { supabase } from "@/utils/supabase/client";
import { filesDb } from "@/features/files/filesDb";
import type {
  DeviceRow,
  SyncDirection,
  SyncMappingRow,
  DesiredState,
} from "./types";

/** Only what this surface renders — never `select("*")`. */
const MAPPING_COLUMNS =
  "id, user_id, device_id, folder_id, organization_id, local_path, local_path_display, direction, desired_state, state, state_reason, state_changed_at, last_seen_at, last_synced_at, items_total, bytes_total, knobs, version, created_at, updated_at";

const DEVICE_COLUMNS =
  "id, instance_name, platform, os_version, app_version, last_seen, is_active, created_at";

/**
 * The user's own devices. RLS already scopes `app_instances` to rows the user
 * owns or was granted; the explicit `created_by` filter keeps a device someone
 * SHARED with this user out of a list titled "your devices".
 */
export async function fetchDevices(userId: string): Promise<DeviceRow[]> {
  const { data, error } = await supabase
    .from("app_instances")
    .select(DEVICE_COLUMNS)
    .eq("created_by", userId)
    .is("deleted_at", null)
    .order("last_seen", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as unknown as DeviceRow[];
}

/**
 * Every mapping this user owns, across every device. RLS is owner-only
 * (`personal` variant), so there is nothing else to scope by.
 */
export async function fetchMappings(): Promise<SyncMappingRow[]> {
  const { data, error } = await filesDb(supabase)
    .from("sync_mappings")
    .select(MAPPING_COLUMNS)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as SyncMappingRow[];
}

/**
 * Write the user's intent. `organization_id` rides along on every write,
 * explicitly, because no resolver or trigger may choose one — the trigger
 * refuses a CHANGE to it, so sending the row's own value is both legal and
 * self-describing.
 */
async function writeIntent(
  mapping: Pick<SyncMappingRow, "id" | "organization_id">,
  patch: Partial<{
    desired_state: DesiredState;
    direction: SyncDirection;
    knobs: Record<string, unknown>;
  }>,
): Promise<void> {
  const { error } = await filesDb(supabase)
    .from("sync_mappings")
    .update({ ...patch, organization_id: mapping.organization_id })
    .eq("id", mapping.id);
  if (error) throw error;
}

export function setDesiredState(
  mapping: Pick<SyncMappingRow, "id" | "organization_id">,
  desiredState: DesiredState,
): Promise<void> {
  return writeIntent(mapping, { desired_state: desiredState });
}

export function setDirection(
  mapping: Pick<SyncMappingRow, "id" | "organization_id">,
  direction: SyncDirection,
): Promise<void> {
  return writeIntent(mapping, { direction });
}

/**
 * Knobs are merged, never replaced: `knobs` holds every per-mapping setting
 * the engine owns (C11 puts `knowledge.index_for_knowledge` here rather than
 * in a column), and a blind overwrite from this screen would silently drop the
 * ones this build does not render.
 */
export function setKnob(
  mapping: Pick<SyncMappingRow, "id" | "organization_id" | "knobs">,
  key: string,
  value: unknown,
): Promise<void> {
  return writeIntent(mapping, {
    knobs: { ...(mapping.knobs ?? {}), [key]: value },
  });
}
