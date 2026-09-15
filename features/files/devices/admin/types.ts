/**
 * features/files/devices/admin/types.ts
 *
 * The admin view's shape — `files.sync_mapping_admin_status`, which is the
 * ONLY thing an admin may read about somebody else's sync. It carries states
 * and counts and NO `local_path`, `local_path_display`, `state_reason` or
 * `knobs` (SPEC-SERVER §6.2 S22: Dropbox's and Google Workspace's admin
 * consoles show device status without the local path, and so do we).
 */

export interface SyncAdminRow {
  id: string;
  user_id: string;
  device_id: string;
  organization_id: string;
  direction: string;
  desired_state: string;
  state: string;
  state_changed_at: string | null;
  last_seen_at: string | null;
  last_synced_at: string | null;
  items_total: number | null;
  bytes_total: number | null;
  created_at: string | null;
}

/** States that mean "this account cannot store more". */
export const OVER_QUOTA_STATES = ["over_quota"] as const;

/** States that mean "sync here is stopped and needs somebody". */
export const STALLED_STATES = [
  "root_missing",
  "suspended_marker_missing",
  "suspended_mass_delete",
  "suspended_disk_full",
  "admission_revoked",
  "permission_denied",
  "sign_in_needed",
  "credential_store_unavailable",
] as const;

/** States that are degraded but still moving. */
export const DEGRADED_STATES = [
  "disk_low",
  "watcher_exhausted",
  "polling_fallback",
  "offline",
  "signed_out",
] as const;
