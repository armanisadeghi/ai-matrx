/**
 * features/hr/time/kiosk/deviceIdentity.ts — what a paired wall tablet remembers about itself.
 *
 * 🚨 **THE SECRET IS RETURNED ONCE AND NEVER RE-READABLE** (SPEC-TIME §3.3, contract note on
 * `KioskPairingResult`). `hr_kiosk_claim_pairing` mints it, hands it over exactly once, and no RPC
 * will ever hand it over again. So the very first thing route 35 does with a successful pairing is
 * call {@link storeKioskIdentity} — before it renders anything, before it navigates, before it
 * awaits anything else. A pairing whose secret was displayed and then lost is a device that must be
 * re-paired by an administrator, and on a wall tablet that means somebody with a ladder.
 *
 * 🚨 **THE SECRET IS NEVER RENDERED.** Not on the pairing screen, not in a "device details" panel,
 * not behind a reveal control. A wall tablet is a shared screen in a break room; anything drawn on
 * it is public. The device id is safe to show (an administrator needs it to trust the device); the
 * secret is not, and there is deliberately no accessor here that a component could bind to text.
 *
 * WHY `localStorage` AND NOT `sessionStorage`
 * -------------------------------------------
 * A wall tablet reboots, its browser gets force-quit by a cleaner, and its tab is reopened by
 * whoever notices. Every one of those loses `sessionStorage`, and losing it here means losing the
 * secret — which is unrecoverable. `localStorage` survives all three. (The web clock's *session*
 * segment in `../api/idempotencyKey.ts` correctly uses `sessionStorage`, for the opposite reason:
 * there, a new tab genuinely IS a new session.)
 *
 * Storage can be unavailable or full. Every accessor below therefore returns/reports rather than
 * throwing, and route 35 renders the failure as a sentence — a tablet that cannot remember itself
 * must say so, not crash into a blank screen.
 */

"use client";

const IDENTITY_KEY = "hr.kiosk.device";
const FINGERPRINT_KEY = "hr.kiosk.fingerprint";

/** What this device knows about itself between reloads. The secret is here and is never rendered. */
export interface KioskDeviceIdentity {
  deviceId: string;
  /** 🚨 Never displayed, never logged, never put in a URL. Passed only to `hr_kiosk_authenticate`. */
  deviceSecret: string;
  organizationDisplayName: string;
  locationName: string | null;
  pairedAt: string;
}

function isIdentity(value: unknown): value is KioskDeviceIdentity {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.deviceId === "string" &&
    candidate.deviceId.length > 0 &&
    typeof candidate.deviceSecret === "string" &&
    candidate.deviceSecret.length > 0
  );
}

/** The identity this tablet holds, or `null` when it has never paired (or storage is unavailable). */
export function readKioskIdentity(): KioskDeviceIdentity | null {
  try {
    const raw = window.localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isIdentity(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Persist the identity. Returns `false` when storage refused — the caller must render that as a
 * sentence, because a tablet that cannot remember its secret cannot punch after the next reload and
 * the person setting it up needs to know **now**, while they are still standing in front of it.
 */
export function storeKioskIdentity(identity: KioskDeviceIdentity): boolean {
  try {
    window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
    return true;
  } catch {
    return false;
  }
}

/**
 * Forget this device. Used when the server says the identity is no longer valid — a re-paired or
 * deleted device authenticating with a stale secret gets a refusal, and holding onto a secret the
 * server has stopped recognising only produces a tablet stuck in a refusal loop.
 *
 * 🚨 **Never called on `suspended` or `revoked`.** Those are trust states of a device the server
 * still knows, and the correct response is the brick screen (§3.3) — an administrator can restore
 * trust without re-pairing, and clearing the identity would force a re-pair they never asked for.
 */
export function clearKioskIdentity(): void {
  try {
    window.localStorage.removeItem(IDENTITY_KEY);
  } catch {
    // Nothing to do and nothing to say: the caller is already rendering "this tablet is not set up".
  }
}

/**
 * A stable per-device value handed to `hr_kiosk_claim_pairing` as `p_device_fingerprint`, so a
 * pairing code claimed twice from two different tablets is distinguishable server-side.
 *
 * Deliberately **random and stored**, not derived from anything about the browser: a fingerprint
 * computed from user agent, screen size, fonts or canvas is a tracking primitive, it is unstable
 * across an OS update, and we need identity for exactly one device, not recognition across many.
 */
export function kioskDeviceFingerprint(): string {
  try {
    const existing = window.localStorage.getItem(FINGERPRINT_KEY);
    if (existing) return existing;
    const minted = `kiosk-${crypto.randomUUID()}`;
    window.localStorage.setItem(FINGERPRINT_KEY, minted);
    return minted;
  } catch {
    // A tablet in a private window still gets to pair; it just cannot be recognised across reloads.
    return `kiosk-${crypto.randomUUID()}`;
  }
}
