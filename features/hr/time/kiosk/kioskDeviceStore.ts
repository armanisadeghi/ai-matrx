/**
 * features/hr/time/kiosk/kioskDeviceStore.ts — the device identity a wall tablet holds.
 *
 * 🚨 **THE SECRET IS RETURNED ONCE AND IS NEVER RE-READABLE** (§1.2, §3.3). `hr_kiosk_claim_pairing`
 * is the only path that ever mints it, and it hands it back exactly once. If this tablet loses it,
 * there is no "show it again" — the device is re-paired with a new code by an administrator. So the
 * write below happens **immediately** on claim, before anything is rendered, and never after a
 * navigation that could drop it.
 *
 * WHERE IT LIVES, AND WHY
 * -----------------------
 * `localStorage`, on the tablet, keyed per device. This is a **shared, unattended wall device**, so
 * the threat model is not "another user of this browser profile" — it is "this tablet walks out of
 * the building". That threat is answered by the server, not by storage: an administrator revokes
 * the device and route 36 bricks at the next heartbeat, at most `heartbeatSeconds` later (§3.3).
 * Storage cleverness here would buy nothing and would break the one property that matters — a
 * tablet that reboots must come back up punching without a human.
 *
 * 🚨 Nothing else about a person is ever stored on a kiosk. No roster, no PIN, no name, no last
 * punch. The device identity is the entire persisted state, because anything else on the disk of an
 * unattended tablet is a disclosure waiting for the tablet to be stolen.
 */

"use client";

const DEVICE_KEY = "hr.kiosk.device";

export interface KioskDeviceIdentity {
  deviceId: string;
  /** Never rendered, never logged, never copied to a clipboard. Presented to the server only. */
  deviceSecret: string;
  organizationDisplayName: string;
  locationName: string | null;
}

/**
 * A stable per-tablet fingerprint for `hr_kiosk_claim_pairing`. Deliberately **not** a
 * device-fingerprinting library: this is an opaque random id the tablet keeps, whose only job is to
 * let the server tell "this same tablet re-claimed" from "a different tablet claimed". Real
 * fingerprinting would collect hardware and browser signals we have no business collecting from a
 * device that stands in a break room.
 */
const FINGERPRINT_KEY = "hr.kiosk.fingerprint";

export function deviceFingerprint(): string {
  try {
    const existing = window.localStorage.getItem(FINGERPRINT_KEY);
    if (existing) return existing;
    const minted = `kiosk-${crypto.randomUUID()}`;
    window.localStorage.setItem(FINGERPRINT_KEY, minted);
    return minted;
  } catch {
    // A tablet with storage disabled can still pair; it simply looks like a new device each time,
    // which an administrator sees and can act on. Refusing to pair would be the worse failure.
    return `kiosk-ephemeral-${crypto.randomUUID()}`;
  }
}

export function readKioskDevice(): KioskDeviceIdentity | null {
  try {
    const raw = window.localStorage.getItem(DEVICE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as KioskDeviceIdentity).deviceId === "string" &&
      typeof (parsed as KioskDeviceIdentity).deviceSecret === "string"
    ) {
      return parsed as KioskDeviceIdentity;
    }
    return null;
  } catch {
    return null;
  }
}

/** Called the instant a pairing is claimed. The secret does not survive a second chance. */
export function writeKioskDevice(identity: KioskDeviceIdentity): boolean {
  try {
    window.localStorage.setItem(DEVICE_KEY, JSON.stringify(identity));
    return true;
  } catch {
    return false;
  }
}

export function clearKioskDevice(): void {
  try {
    window.localStorage.removeItem(DEVICE_KEY);
  } catch {
    // Nothing to do and nothing to tell a break-room wall about.
  }
}
