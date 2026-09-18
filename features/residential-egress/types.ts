/**
 * features/residential-egress/types.ts
 *
 * The shapes this feature reads and writes, typed BY HAND from the ONE
 * cross-repo contract:
 *   /Users/armanisadeghi/code/common-docs/systems/platform/residential-egress/FEATURE.md
 *
 * 🚨 TODO(residential-egress owner): switch to the GENERATED types.
 *   - `platform.egress_device` did not exist in the live database when this
 *     was written (checked 2026-09-18, `information_schema.tables` returned
 *     nothing for `platform.egress%`), so `EgressDeviceRow` below is hand-typed
 *     and every read uses `.returns<EgressDeviceRow[]>()`. Once aidream's
 *     migration lands, run `pnpm db-types` and delete this shape in favour of
 *     `Database["platform"]["Tables"]["egress_device"]["Row"]`.
 *   - The `/egress/*` request/response shapes below are hand-typed for the same
 *     reason: `types/python-generated/api-types.ts` does not carry `/egress`
 *     yet. Once `pnpm sync-types` does, delete these and move `service.ts` off
 *     `lib/python-client.ts`'s raw helpers onto `lib/api/typed-client.ts`.
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

/**
 * THE HAND-TYPED SCHEMA the client reads `platform.egress_device` through,
 * until `pnpm db-types` carries it. This is a REAL type, not `any` and not a
 * cast at the call site: the two writable columns are the two RLS lets the
 * owner write, so a fourth column added to an `.update()` by mistake is a type
 * error here exactly as it would be against the generated file.
 *
 * 🚨 TODO(residential-egress owner): delete this whole block after
 * `pnpm db-types`, and let `service.ts` use the shared client directly.
 */
export interface EgressDatabase {
  platform: {
    Tables: {
      egress_device: {
        Row: EgressDeviceRow & {
          created_by: string | null;
          organization_id: string;
          deleted_at: string | null;
        };
        Insert: never;
        /** Owner-writable columns ONLY (contract § Data / RLS). */
        Update: { enabled?: boolean; display_name?: string };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
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
