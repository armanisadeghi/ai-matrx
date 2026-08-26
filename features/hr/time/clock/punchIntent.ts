/**
 * features/hr/time/clock/punchIntent.ts — one user intent, one idempotency key, held across retries.
 *
 * 🚨 THE RULE THIS FILE EXISTS TO MAKE UNBREAKABLE (L3-45, SPEC-TIME §2.1)
 * ------------------------------------------------------------------------
 * The key is minted **once per user intent** and **reused on every retry of that intent**. A retry
 * that mints a fresh key produces a *second punch* and a `duplicate-suspected` exception for a human
 * to resolve — the exact failure the key exists to prevent (§3.4).
 *
 * The way that rule gets broken in practice is not malice, it is convenience: a retry handler that
 * calls `recordPunch({ ..., idempotencyKey: mint(...) })` again because minting is one line. So the
 * key is not a parameter here — it is a property of an **immutable intent object** that is minted
 * once and then only ever *carried*. {@link retryPunchIntent}, {@link attachAttestation} and
 * {@link attachGeo} all return a new object with the SAME `idempotencyKey` and the SAME
 * `occurredAt`, and there is no exported way to change either.
 *
 * `occurredAt` is frozen with the key for the same reason: the key embeds the local ISO minute
 * (`mintPunchIdempotencyKey`), so a retry that re-read the clock could cross a minute boundary,
 * mint a different key from the same intent, and write the second punch anyway.
 */

import { mintPunchIdempotencyKey } from "@/features/hr/time/api/idempotencyKey";
import type { AttestationResponse, PunchKind } from "@/features/hr/time/api/types";

/** A geo fix, in the shape `recordPunch` / `kioskPunch` take. Never required — see `geoCapture.ts`. */
export interface PunchGeo {
  lat: number;
  lng: number;
  accuracyM: number;
}

/**
 * One user intent to punch. Immutable by construction: every field is `readonly` and every
 * transition below returns a new object carrying the original key.
 */
export interface PunchIntent {
  readonly kind: PunchKind;
  readonly employmentId: string;
  /** Minted once. Never re-minted, for any reason, for the life of this intent. */
  readonly idempotencyKey: string;
  /** The instant of the intent, frozen with the key. A retry never re-reads the clock. */
  readonly occurredAt: string;
  /** The punch's stamped zone, from `clock_state` or the kiosk session — never the browser's. */
  readonly tz: string;
  readonly attestation: AttestationResponse | null;
  readonly geo: PunchGeo | null;
  /** Human-facing notices about what was captured, e.g. "Location recorded" (§4.9). */
  readonly capturedNotices: readonly string[];
  /** 0 on the first attempt. Rendered so a person can see a retry is a retry, not a new punch. */
  readonly attempts: number;
}

export interface MintPunchIntentInput {
  kind: PunchKind;
  employmentId: string;
  /**
   * The device or session segment. Web: `webPunchSessionSegment()`. Kiosk: the device id. It is
   * mandatory — the punch unique constraint is org-scoped, so a key without it lets two people's
   * same-minute punches collapse onto one row (SPEC-TIME §14 D4 / R-L3 U-14).
   */
  deviceOrSession: string;
  /** The punch's stamped IANA zone. */
  tz: string;
  /** Injectable so a test is not at the mercy of the wall clock. Defaults to now. */
  at?: Date;
}

export function mintPunchIntent(input: MintPunchIntentInput): PunchIntent {
  const at = input.at ?? new Date();
  return {
    kind: input.kind,
    employmentId: input.employmentId,
    idempotencyKey: mintPunchIdempotencyKey({
      deviceOrSession: input.deviceOrSession,
      employmentId: input.employmentId,
      punchKind: input.kind,
      at,
      tz: input.tz,
    }),
    occurredAt: at.toISOString(),
    tz: input.tz,
    attestation: null,
    geo: null,
    capturedNotices: [],
    attempts: 0,
  };
}

/**
 * The same intent, one attempt later. 🚨 Same key, same `occurredAt` — that is the whole point.
 * Every Retry control in this feature routes through here and nowhere else.
 */
export function retryPunchIntent(intent: PunchIntent): PunchIntent {
  return { ...intent, attempts: intent.attempts + 1 };
}

/**
 * Attach the combined clock-out answer set collected by the attestation card. Does not re-mint:
 * the employee's intent to clock out was formed before the card was answered, and answering it is
 * not a second intent.
 */
export function attachAttestation(
  intent: PunchIntent,
  attestation: AttestationResponse,
): PunchIntent {
  return { ...intent, attestation };
}

/**
 * Attach a geo fix and the human notice that goes on the confirmation. A *denied* fix attaches
 * nothing and is still a punch — blocking a legitimate employee because a browser dialog was
 * dismissed is a defect (§2.1).
 */
export function attachGeo(
  intent: PunchIntent,
  geo: PunchGeo | null,
  notice: string | null,
): PunchIntent {
  return {
    ...intent,
    geo,
    capturedNotices: notice ? [...intent.capturedNotices, notice] : intent.capturedNotices,
  };
}
