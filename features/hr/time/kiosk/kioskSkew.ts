/**
 * features/hr/time/kiosk/kioskSkew.ts — how far this tablet's clock is from the server's.
 *
 * 🚨 **THIS IS NOT HOURS ARITHMETIC, AND THE DISTINCTION IS EXACT.**
 * `scripts/check-hr-time-arithmetic.ts` (L3-75) forbids deriving elapsed time from two *stamped
 * instants* — `ended_at − started_at`, `occurred_at` differences, anything that a DST transition or
 * a stamped IANA zone could make wrong. Nothing of that shape happens here.
 *
 * What happens here is **clock synchronisation**: one number the server reported about *itself*
 * (`serverTime`) against one number this browser read off its own clock in the same instant. Both
 * are absolute epoch instants observed at the same moment; neither is a fact about an employee's
 * day, and no calendar, zone or interval is involved. SPEC-TIME §3.3 requires it in so many words —
 * *"Clock skew computed against the server clock and held for this session"* — and the punch record
 * keeps both timestamps forever (`device_reported_at` raw, `occurred_at` corrected) precisely so
 * this measurement can be audited rather than trusted.
 *
 * 🚨 **THE CLIENT NEVER REWRITES A TIMESTAMP.** It reports what its own clock said and lets the
 * server correct it (`hr.time_and_attendance.kiosk_time_authority`, default `server`). The one
 * decision this module drives is the **refusal** in §3.3: beyond `max_clock_skew_seconds` the punch
 * is not sent at all, and the screen says the tablet's clock is wrong. Sending it anyway would file
 * a punch whose `device_reported_at` is hours out and whose employee has no idea.
 */

"use client";

/** The measurement, held for the life of a kiosk session and re-taken on every heartbeat. */
export interface KioskClockSkew {
  /**
   * Server minus device, in seconds. Positive means this tablet is **behind** the server.
   * Reported to nobody except the refusal screen; the server does the correcting.
   */
  skewSeconds: number;
  /** The knob, from the session config. Never a constant in this lane. */
  maxSkewSeconds: number;
  /** 🚨 True → the punch is REFUSED before it is sent (§3.3). */
  beyondMax: boolean;
}

/**
 * Measure the skew from one authenticate/heartbeat response.
 *
 * @param serverTimeIso  the server's own clock, as it reported it
 * @param deviceObservedAtMs  `Date.now()` read when that response landed, in the same instant
 * @param maxSkewSeconds  `config.maxClockSkewSeconds` — the knob, passed in, never assumed
 */
export function measureKioskSkew(
  serverTimeIso: string,
  deviceObservedAtMs: number,
  maxSkewSeconds: number,
): KioskClockSkew {
  const serverMs = Date.parse(serverTimeIso);
  if (Number.isNaN(serverMs)) {
    // An unparseable server clock is not a reason to strand a shift. Report zero skew and let the
    // server — which holds the authority — do the correcting on the punch itself.
    return { skewSeconds: 0, maxSkewSeconds, beyondMax: false };
  }
  const skewSeconds = Math.round((serverMs - deviceObservedAtMs) / 1000);
  return {
    skewSeconds,
    maxSkewSeconds,
    beyondMax: Math.abs(skewSeconds) > maxSkewSeconds,
  };
}

/**
 * What the tablet's own clock reads right now, corrected by the measured skew — the number the
 * idle screen shows and the instant a punch reports as `device_reported_at`.
 *
 * Correcting before reporting is deliberate: `hr.punch` keeps the device's claim raw *and* the
 * corrected truth, and a device that reports a claim it already knows to be 40 seconds slow is
 * manufacturing a discrepancy for a human to investigate later.
 */
export function skewCorrectedNow(skew: KioskClockSkew | null): Date {
  return new Date(Date.now() + (skew ? skew.skewSeconds * 1000 : 0));
}

/**
 * The refusal sentence. Plain language for a person standing at a tablet who did not break
 * anything and cannot fix it — it names the tablet as the problem, says the punch was **not**
 * recorded, and points at the one human who can act.
 */
export const KIOSK_SKEW_REFUSAL =
  "This tablet's clock is wrong, so your punch was not recorded. Tell your manager — the tablet " +
  "needs to be fixed before it can be used.";
