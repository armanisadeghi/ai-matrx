/**
 * features/residential-egress/types.ts
 *
 * The shapes this feature reads and writes, from the ONE cross-repo contract:
 *   /Users/armanisadeghi/code/common-docs/systems/platform/residential-egress/FEATURE.md
 *
 * `platform.egress_device` is now in `types/database.types.ts` — `service.ts`
 * reaches it through the generated `Database` type (see `egressDb()`, same
 * pattern as `features/files/filesDb.ts`). `EgressDeviceRow` below stays
 * hand-typed on purpose: it is the PROJECTED column list
 * (`EGRESS_DEVICE_COLUMNS`), not the full generated row — `token_hash` /
 * `token_prefix` are excluded, so `.returns<EgressDeviceRow[]>()` still
 * narrows the select to what this surface is allowed to read.
 *
 * The `/egress/*` request/response shapes below stay hand-typed too:
 * `types/python-generated/api-types.ts` now carries the `/egress` paths, but
 * every one of these operations' 200 responses is generated as an untyped
 * `{ [key: string]: unknown }` dict (the backend returns a plain dict, not a
 * Pydantic response model) — there is no real contract shape to derive from
 * yet. `service.ts` still calls through `lib/api/typed-client.ts` so the
 * PATH and REQUEST BODY are contract-checked; only the response is asserted
 * against these hand types, same as before `/egress` existed in the contract.
 *
 * User-facing words are fixed by the contract § Names: this is a
 * "Home connection"; never "proxy", "egress", "residential" or "IP" in copy.
 */

/**
 * `platform.egress_device` — the columns this surface renders. Never
 * `select("*")`: `token_hash` / `token_prefix` are the device's credential
 * material and have no business in a browser.
 */
export interface EgressDeviceRow {
  id: string;
  /** The device identity every other surface already uses; NULL for a helper-only computer. */
  app_instance_id: string | null;
  display_name: string;
  client_kind: "desktop_app" | "helper";
  platform: string | null;
  helper_version: string | null;
  /** The user's intent — the switch. The owner may UPDATE this column under RLS. */
  enabled: boolean;
  /** The server's observation, not the user's intent. */
  connected: boolean;
  last_seen_at: string | null;
  last_used_at: string | null;
  streams_relayed: number;
  bytes_relayed: number;
  /** A plain sentence with a remedy, written by the gateway. */
  last_error: string | null;
  created_at: string | null;
}

/** The exact column list the client is allowed to ask for. */
export const EGRESS_DEVICE_COLUMNS =
  "id, app_instance_id, display_name, client_kind, platform, helper_version, enabled, connected, last_seen_at, last_used_at, streams_relayed, bytes_relayed, last_error, created_at";

/**
 * What a person sees on the badge. Derived, never stored — `connected` is the
 * server's observation and `enabled` is the user's intent, and the row says
 * both, so the badge is a function of the two and never a third column.
 */
export type HomeConnectionStatus =
  | "connected"
  | "offline"
  | "paused"
  | "not_set_up";

export const HOME_CONNECTION_STATUS_LABEL: Record<
  HomeConnectionStatus,
  string
> = {
  connected: "Connected",
  offline: "Offline",
  paused: "Paused",
  not_set_up: "Not set up",
};

export function homeConnectionStatus(
  device: EgressDeviceRow | null | undefined,
): HomeConnectionStatus {
  if (!device) return "not_set_up";
  if (!device.enabled) return "paused";
  return device.connected ? "connected" : "offline";
}

// ---------------------------------------------------------------------------
// HTTP contract — aidream router prefix `/egress` (contract § HTTP API)
// ---------------------------------------------------------------------------

/** `GET /egress/pairings/by-code/{user_code}` */
export interface EgressPairingByCode {
  pairing_id: string;
  display_name: string;
  platform: string | null;
  client_kind: "desktop_app" | "helper";
  helper_version: string | null;
  expires_at: string;
}

/** `POST /egress/pairings/by-code/{user_code}/approve` */
export interface EgressPairingApproveResult {
  device_id: string;
  display_name: string;
}

/** One computer as `GET /egress/status` summarises it. */
export interface EgressStatusComputer {
  id: string;
  display_name: string;
  connected: boolean;
  enabled: boolean;
  last_seen_at: string | null;
  last_used_at: string | null;
}

/** `GET /egress/status` — the one-call summary the cloud-browser panel uses. */
export interface EgressStatus {
  feature_enabled: boolean;
  computers: EgressStatusComputer[];
}

// ---------------------------------------------------------------------------
// The knob that carries the installer URLs (contract § Knobs)
// ---------------------------------------------------------------------------

export const RESIDENTIAL_EGRESS_FEATURE = "residential_egress";

/**
 * Named as a LITERAL because that is how the settings guards
 * (`check:settings-orphans` / `check:settings-unregistered`) read a
 * `useScopedKnobs` consumer — a row seeded in the register and a row read here
 * can then never drift apart unnoticed.
 */
export const HELPER_DOWNLOAD_BASE_URL_KNOB = "helper_download_base_url";

/** The three installers the release tag carries, in the contract's own names. */
export const HELPER_DOWNLOADS: ReadonlyArray<{
  os: string;
  asset: string;
  detail: string;
}> = [
  {
    os: "Mac",
    asset: "AI-Matrx-Home-Connection-macos.pkg",
    detail: "macOS 12 or newer, Intel and Apple silicon",
  },
  {
    os: "Windows",
    asset: "AI-Matrx-Home-Connection-windows-setup.exe",
    detail: "Windows 10 or newer",
  },
  {
    os: "Linux",
    asset: "ai-matrx-home-connection_amd64.deb",
    detail: "Debian and Ubuntu, 64-bit",
  },
];

// ---------------------------------------------------------------------------
// Where a person's computers live (one spelling, one place)
// ---------------------------------------------------------------------------

/**
 * The DURABLE route for "my computers" — the Devices & sync settings tab
 * (registry id `files.devices`) on the route-driven settings surface.
 *
 * 🚨 NOT `/settings?tab=devices`. That URL — the one the helper's tray menu
 * opens — hits `app/(transitional)/settings/page.tsx`, which redirects to
 * `/settings/profile` and drops the whole query string on the way, so neither
 * the tab nor `?computer=` ever reaches this list. Every link WE own points
 * here; the tray's link is matrx-local's to change (recorded in the feature
 * doc and in the cross-repo contract).
 */
export const HOME_CONNECTIONS_HREF = "/user-settings/files/devices";

/**
 * The query parameter that names ONE computer to bring into view on that page
 * (`?computer=<egress_device id>`). Named once so the writer and the reader
 * can never drift.
 */
export const HOME_CONNECTION_FOCUS_PARAM = "computer";
