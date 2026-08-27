/**
 * features/hr/time/devices/contract.ts — what route 75a's panels need, and what still owes it.
 *
 * 🚨 **THE DATA DOOR FOR KIOSK DEVICE MANAGEMENT DOES NOT EXIST YET, AND THIS FILE IS WHY THAT IS
 * VISIBLE RATHER THAN GUESSED AT.**
 *
 * `features/hr/time/api/rpc.ts` holds a **closed union** of the RPC names this lane may call — it is
 * closed on purpose, so a typo is a compile error instead of a runtime PGRST202. Kiosk *device
 * management* has no member in it. The four names below are the ones L3-72 requires and none of them
 * is callable today:
 *
 *   | Owed RPC                        | What route 75a does with it                                  |
 *   |---------------------------------|--------------------------------------------------------------|
 *   | `hr_kiosk_device_list`          | the device table — trust, skew, last-seen, capture config     |
 *   | `hr_kiosk_device_register`      | mint a pairing code (+ its expiry) for a new tablet           |
 *   | `hr_kiosk_device_set_trust`     | trust / suspend / revoke — the control that bricks route 36   |
 *   | `hr_kiosk_device_set_capture`   | per-device photo / geo posture                                |
 *
 * `KioskDeviceRow` is already declared in `api/types.ts` — the shape was designed; nothing returns
 * it. So the panels in this directory take their data and their writers **through the interface
 * below** rather than reaching for a door that is not there. That is not indirection for its own
 * sake: it is the difference between a surface that cannot be wired and a surface that is wired in
 * one line the day the wrappers land.
 *
 * 🚨 **DO NOT SATISFY THIS WITH A MOCK.** A fixture behind `NEXT_PUBLIC_HR_MOCK` would need entries
 * in `HR_TIME_RPC_FIXTURES` keyed by names the union does not carry, which does not compile — and
 * inventing a client-side device store to fill the gap would be exactly the fiction the mock lane
 * exists to prevent. The honest state is: the panels are built, the door is owed, and the report
 * names it.
 *
 * WHO OWNS WHAT
 * -------------
 * • The four RPCs + their `public.hr_*` wrappers → the L3 SQL lane, which is already writing the
 *   kiosk primitives (`hr_kiosk_authenticate`, `hr_kiosk_session_*`, `hr_kiosk_punch`).
 * • The union member + the `service.ts` functions → whoever owns `features/hr/time/api/**`.
 * • **The route file `app/(core)/hr/settings/devices/page.tsx` and its settings-tab entry → lane L1**
 *   (EXECUTION §3, shared-surface rule). L3 owns the panels; L1 mounts them.
 */

import type { KioskDeviceRow, KioskTrustState } from "@/features/hr/time/api/types";

/** What `hr_kiosk_device_register` answers with. 🚨 The code is shown ONCE — see `PairingCodeCard`. */
export interface KioskPairingCodeIssued {
  deviceId: string;
  /** The one-time code an administrator carries to the tablet. Never re-readable after this. */
  pairingCode: string;
  pairingCodeExpiresAt: string;
  deviceName: string;
  locationName: string | null;
}

export interface RegisterKioskDeviceInput {
  deviceName: string;
  locationId: string | null;
}

/** Per-device capture posture. Both default OFF at the platform level (§4.9, ruled). */
export interface KioskCaptureConfig {
  requirePhoto: boolean;
  requireGeo: boolean;
}

/**
 * The door route 75a's panels call. One object, passed in — so the day the wrappers land, L1 (or
 * the api lane) supplies an implementation and nothing in this directory changes.
 *
 * Every method may reject with `HrRpcError`; the panels render `userMessage` **verbatim**, never a
 * generic sentence. That is the same rule the punch lane runs on and for the same reason: a refusal
 * that does not name what was missing sends an administrator to file a bug instead of fixing the
 * cause.
 */
export interface KioskDeviceService {
  list: () => Promise<KioskDeviceRow[]>;
  register: (input: RegisterKioskDeviceInput) => Promise<KioskPairingCodeIssued>;
  /**
   * 🚨 `revoked` bricks `/kiosk/[deviceId]` at the next heartbeat or punch, whichever is first — at
   * most `kiosk_heartbeat_seconds` later (§3.3). The panel says so, in words, before it asks.
   */
  setTrust: (deviceId: string, trustState: KioskTrustState, reason: string | null) => Promise<KioskDeviceRow>;
  setCapture: (deviceId: string, config: KioskCaptureConfig) => Promise<KioskDeviceRow>;
}
