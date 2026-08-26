/**
 * features/hr/time/api/idempotencyKey.ts — the client-minted punch idempotency key.
 *
 * ONE helper, shared by the web clock, the kiosk, manager entry, and — unchanged — the later
 * native HR mobile app (D1). This is L3-45, and it is a build item rather than an intention:
 * a second mint helper somewhere else is the defect this file exists to prevent.
 *
 * 🚨 WHY THE DEVICE/SESSION SEGMENT IS MANDATORY, NOT DECORATIVE
 * --------------------------------------------------------------
 * SPEC-ACCESS §6.3 wanted `UNIQUE (device_id, idempotency_key)`; SPEC-DATA-MODEL §7.1 creates
 * `unique (organization_id, idempotency_key)`; SPEC-TIME §14 D4 ruled for **org scope**, because it
 * is the only scope that covers web, kiosk, manager entry and the future mobile app under a single
 * constraint — a device-scoped constraint would let the same logical punch land twice from two
 * surfaces.
 *
 * The consequence is a **client** rule, not a server one (R-L3 U-14): because the constraint is
 * org-wide, the key **must** carry the device or session segment, or two people punching the same
 * kind in the same minute would collapse onto one row and one of them would silently not be paid.
 *
 * 🚨 THE KEY IS REUSED ON EVERY RETRY OF THE SAME INTENT
 * ------------------------------------------------------
 * That is what makes a double tap and a flaky network produce ONE punch. A retry that mints a fresh
 * key produces a second punch and a `duplicate-suspected` exception for a human to resolve — the
 * exact failure the key exists to prevent. Mint once per user intent, hold it, and pass the same
 * value to every attempt (SPEC-TIME §2.1).
 *
 * An **exact duplicate** (same key) is a SUCCESS PATH: the server returns the original punch with
 * `replayed: true` and the surface shows the same confirmation, never an error. A **near duplicate**
 * (a *different* key, same kind, inside the near-duplicate window) is a real second punch, is
 * written, and is flagged. Conflating the two is the classic time-clock bug (§3.4).
 */

import type { PunchKind } from "./types";

export interface MintPunchKeyInput {
  /**
   * The device or session segment. On the kiosk this is the device id; on the web it is the
   * browser session id; for manager entry it is the operator's session. It is what keeps two
   * people's same-minute punches distinct under the org-wide unique constraint.
   */
  deviceOrSession: string;
  employmentId: string;
  punchKind: PunchKind;
  /**
   * The instant of the user's intent. Truncated to the minute — that truncation is what collapses
   * a double tap, and it is deliberate.
   */
  at: Date;
  /**
   * The IANA zone the minute is expressed in. Pass the punch's stamped `tz` (from `clock_state` or
   * the kiosk session), **never the browser's zone**: two surfaces in different zones must mint the
   * same key for the same intent, or a retry from a different surface creates a second punch.
   */
  tz: string;
}

/** `YYYY-MM-DDTHH:mm` in the given IANA zone. No arithmetic — `Intl` does the zone work. */
function localIsoMinute(at: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";

  // `en-CA` renders midnight as "24" in some runtimes; normalise so the key is stable.
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

/**
 * `<device_or_session>:<employment>:<punch_kind>:<local_iso_minute>` — SPEC-DATA-MODEL §7.1's
 * declared composition, verbatim. Changing this composition is a **breaking** amendment under
 * EXECUTION §4, not an edit.
 */
export function mintPunchIdempotencyKey(input: MintPunchKeyInput): string {
  const { deviceOrSession, employmentId, punchKind, at, tz } = input;
  if (!deviceOrSession) {
    throw new Error(
      "mintPunchIdempotencyKey: deviceOrSession is required. The punch unique constraint is " +
        "org-scoped, so a key without this segment lets two people's same-minute punches collapse " +
        "onto one row (SPEC-TIME §14 D4 / R-L3 U-14).",
    );
  }
  return `${deviceOrSession}:${employmentId}:${punchKind}:${localIsoMinute(at, tz)}`;
}

/**
 * A stable per-browser-session segment for the web clock. Lives in `sessionStorage` so a reload
 * keeps it (and therefore keeps a retry idempotent) while a new tab is honestly a new session.
 * Falls back to an in-memory value where storage is unavailable — a private window must still be
 * able to punch.
 */
let memorySessionSegment: string | null = null;

export function webPunchSessionSegment(): string {
  const STORAGE_KEY = "hr.time.punch-session";
  try {
    const existing = window.sessionStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const minted = `web-${crypto.randomUUID()}`;
    window.sessionStorage.setItem(STORAGE_KEY, minted);
    return minted;
  } catch {
    memorySessionSegment ??= `web-${crypto.randomUUID()}`;
    return memorySessionSegment;
  }
}
