/**
 * features/hr/time/devices/deviceAdminSource.ts — the data contract behind route 75a's panels.
 *
 * 🚨 **WHY THIS FILE IS AN INTERFACE AND NOT A SERVICE.**
 * Kiosk device management needs four operations — list the fleet, generate a pairing code, change a
 * device's trust state, and set its per-device capture config. **None of them exists.** The Time
 * lane's RPC door (`api/rpc.ts`) carries a closed union of `public.hr_*` names and the kiosk half of
 * it is the *device's* lane (`hr_kiosk_claim_pairing`, `hr_kiosk_authenticate`,
 * `hr_kiosk_session_heartbeat`, `hr_kiosk_punch`) — the anon-callable side a tablet uses. There is
 * no administrator-side counterpart, and R-L3 U-09 records why the schema could not answer one
 * anyway: `hr.kiosk_device` has **no pairing-code columns at all** (`pairing_code_hash`,
 * `pairing_code_expires_at`, `pairing_claimed_at`, `device_fingerprint` are all owed DDL), so
 * `hr_kiosk_claim_pairing` currently has nothing to read.
 *
 * So the panels are built against this interface and the route injects an implementation. Three
 * things that buys, none of them cosmetic:
 *   1. **The panels are finished and reviewable now**, against the mock source below, instead of
 *      waiting on DDL that is owed to another spec.
 *   2. **The contract is written down as a demand**, in the shape the UI actually needs, rather than
 *      being guessed at later by whoever writes the SQL.
 *   3. **Nothing pretends to work.** There is no fabricated `supabase.rpc` call here that would fail
 *      at runtime with a PGRST202 nobody can read, and no direct Supabase access from this lane
 *      (the `hr` schema is not exposed to PostgREST — every call must go through a `public.hr_*`
 *      wrapper that does not yet exist).
 *
 * DEBT, owed to the SQL lane and reported: `hr_kiosk_device_list`, `hr_kiosk_pairing_code_create`,
 * `hr_kiosk_device_set_trust`, `hr_kiosk_device_set_capture` — plus U-09's four columns.
 */

import type { KioskDeviceRow, KioskTrustState } from "@/features/hr/time/api/types";

/** What `hr_kiosk_pairing_code_create` must answer with. The code is shown **once**. */
export interface KioskPairingCode {
  deviceId: string;
  /** 🚨 Displayed once, at generation. Never re-readable — only its hash is stored. */
  code: string;
  expiresAt: string;
}

/**
 * A work location a kiosk can belong to. Only what the picker needs — the structure door returns
 * fifteen fields per location and a device dialog has business with three of them.
 */
export interface KioskLocation {
  id: string;
  name: string;
  /** Shown beside the name: a tablet in the wrong timezone files punches on the wrong day. */
  tz: string | null;
}

export interface KioskDeviceAdminSource {
  list: () => Promise<KioskDeviceRow[]>;
  /**
   * The employer's work locations, for the pairing dialog's picker.
   *
   * 🚨 **A KIOSK BELONGS TO A LOCATION, AND THE SERVER ENFORCES IT.** `hr.kiosk_pairing_code_create`
   * refuses a new device with `hr_kiosk_location_required`: *"A kiosk belongs to a work location:
   * that is what its punches are checked against and what cross-location flagging compares to."*
   * The dialog shipped without a picker and hardcoded `null`, so **every pairing was refused and
   * the kiosk could never be set up at all** (G2 F4). The picker is not a convenience.
   */
  listLocations: () => Promise<KioskLocation[]>;
  createPairingCode: (input: { deviceName: string; locationId: string }) => Promise<KioskPairingCode>;
  /**
   * 🚨 Revocation must take effect on the device within one heartbeat (§3.3). The server is what
   * makes that true; this is only the administrator's half of it.
   */
  setTrust: (input: { deviceId: string; trustState: KioskTrustState; reason: string }) => Promise<KioskDeviceRow>;
  setCapture: (input: { deviceId: string; requirePhoto: boolean; requireGeo: boolean }) => Promise<KioskDeviceRow>;
}

/**
 * The fixture source, so the panels can be built and looked at before the SQL lands. Same discipline
 * as `api/mock/registry.ts`: it returns fixtures, it simulates no business logic, and **it is not
 * evidence of anything** — D15 is explicit that manufactured data never counts toward an acceptance
 * target.
 *
 * The rows are chosen to be the ones that are expensive to discover late: a device that is trusted
 * and healthy, one still `pending` (which is what an administrator sees right after a tablet pairs),
 * one `revoked`, and one whose clock is far enough out that its punches would be refused.
 */
export function mockKioskDeviceAdminSource(): KioskDeviceAdminSource {
  const rows: KioskDeviceRow[] = [
    {
      id: "ddddddd1-0000-4000-8000-000000000001",
      deviceName: "Break room tablet",
      locationId: "loc-fremont",
      locationName: "Fremont",
      trustState: "trusted",
      lastSeenAt: "2026-03-17T16:01:00Z",
      lastSeenIp: "203.0.113.14",
      clockSkewSeconds: 4,
      maxClockSkewSeconds: 300,
      requirePhoto: false,
      requireGeo: false,
      pairingCodeExpiresAt: null,
      pairingClaimedAt: "2026-02-02T18:00:00Z",
      registeredByName: "Priya Anand",
    },
    {
      id: "ddddddd1-0000-4000-8000-000000000002",
      deviceName: "Dock entrance",
      locationId: "loc-fremont",
      locationName: "Fremont",
      trustState: "pending",
      lastSeenAt: null,
      lastSeenIp: null,
      clockSkewSeconds: 0,
      maxClockSkewSeconds: 300,
      requirePhoto: false,
      requireGeo: false,
      pairingCodeExpiresAt: "2026-03-18T00:00:00Z",
      pairingClaimedAt: "2026-03-17T15:40:00Z",
      registeredByName: "Priya Anand",
    },
    {
      id: "ddddddd1-0000-4000-8000-000000000003",
      deviceName: "Old warehouse tablet",
      locationId: "loc-hayward",
      locationName: "Hayward",
      trustState: "revoked",
      lastSeenAt: "2026-03-10T14:22:00Z",
      lastSeenIp: "203.0.113.98",
      clockSkewSeconds: 12,
      maxClockSkewSeconds: 300,
      requirePhoto: false,
      requireGeo: false,
      pairingCodeExpiresAt: null,
      pairingClaimedAt: "2025-11-04T17:12:00Z",
      registeredByName: "Dana Ruiz",
    },
    {
      // 🚨 Beyond tolerance: every punch from this tablet is refused (§3.3) and HR is notified.
      id: "ddddddd1-0000-4000-8000-000000000004",
      deviceName: "Kitchen wall clock",
      locationId: "loc-fremont",
      locationName: "Fremont",
      trustState: "trusted",
      lastSeenAt: "2026-03-17T15:58:00Z",
      lastSeenIp: "203.0.113.51",
      clockSkewSeconds: 940,
      maxClockSkewSeconds: 300,
      requirePhoto: true,
      requireGeo: false,
      pairingCodeExpiresAt: null,
      pairingClaimedAt: "2026-01-19T16:00:00Z",
      registeredByName: "Priya Anand",
    },
  ];

  return {
    list: () => Promise.resolve(rows),
    listLocations: () =>
      Promise.resolve([
        { id: "loc-fremont", name: "Fremont", tz: "America/Los_Angeles" },
        { id: "loc-hayward", name: "Hayward", tz: "America/Los_Angeles" },
        // A second zone on purpose: a fleet spanning zones is where "which day is this punch on"
        // stops being obvious, and the picker names the zone for exactly that reason.
        { id: "loc-reno", name: "Reno", tz: "America/Denver" },
      ]),
    createPairingCode: ({ deviceName }) =>
      Promise.resolve({
        deviceId: `ddddddd1-0000-4000-8000-${Math.floor(Math.random() * 1e12)
          .toString()
          .padStart(12, "0")}`,
        code: "HRB-4Q7T",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        deviceNameEcho: deviceName,
      } as KioskPairingCode),
    setTrust: ({ deviceId, trustState }) =>
      Promise.resolve({ ...rows[0], id: deviceId, trustState }),
    setCapture: ({ deviceId, requirePhoto, requireGeo }) =>
      Promise.resolve({ ...rows[0], id: deviceId, requirePhoto, requireGeo }),
  };
}
