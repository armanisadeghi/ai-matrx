/**
 * features/files/devices/types.ts — the shapes this surface renders.
 *
 * Deliberately narrow: what the screen shows, not the whole row. `local_path`
 * is here because these are the OWNER's own rows (RLS is owner-only) — the
 * admin surface reads the path-free `files.sync_mapping_admin_status` view
 * instead, and must never see these.
 */

/** C4: what the user wants. Written by the browser and the desktop app. */
export type DesiredState = "active" | "paused" | "removed";

/** D6 direction semantics. */
export type SyncDirection = "two_way" | "upload_only" | "download_only";

export interface DeviceRow {
  /** `public.app_instances.id` — the device identity everywhere (C13). */
  id: string;
  instance_name: string | null;
  platform: string | null;
  os_version: string | null;
  app_version: string | null;
  last_seen: string | null;
  is_active: boolean | null;
  created_at: string | null;
}

export interface SyncMappingRow {
  id: string;
  user_id: string;
  device_id: string;
  /** NULL = the user-visible root of this mapping's organization (D5). */
  folder_id: string | null;
  organization_id: string;
  local_path: string;
  local_path_display: string | null;
  direction: SyncDirection;
  desired_state: DesiredState;
  /** The daemon's observation, from the ONE honest-state enum. */
  state: string;
  /** The remedy sentence the daemon sent. Always preferred over ours. */
  state_reason: string | null;
  state_changed_at: string | null;
  last_seen_at: string | null;
  last_synced_at: string | null;
  items_total: number | null;
  bytes_total: number | null;
  knobs: Record<string, unknown> | null;
  version: number;
  created_at: string | null;
  updated_at: string | null;
}

/** The per-mapping knob that decides whether these files feed knowledge (C11, D21). */
export const KNOWLEDGE_KNOB = "knowledge.index_for_knowledge";

export const DIRECTION_LABELS: Record<
  SyncDirection,
  { label: string; detail: string }
> = {
  two_way: {
    label: "Two-way",
    detail: "Changes on this device and in the cloud follow each other.",
  },
  upload_only: {
    label: "Upload only",
    detail:
      "This device is the authority. Cloud edits are not applied here, and deleting a file here removes it from the cloud (recoverable from the web trash).",
  },
  download_only: {
    label: "Download only",
    detail:
      "The cloud is the authority. Edits made here are kept and flagged rather than overwritten.",
  },
};
