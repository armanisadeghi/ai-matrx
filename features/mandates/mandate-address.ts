/**
 * WHAT IS AT THIS ADDRESS — the mandate half of the wrong-address class.
 *
 * WHAT THIS FIXES (V2-6, production walk 2026-08-31). Every mandate route
 * answered a wrong URL with *"No mandate "…" — it may have been retired, or
 * the link is stale."* and a **Retry** button. Both halves were dishonest:
 * the sentence asserts the thing once existed, about a key that never did,
 * and Retry re-runs a read whose answer cannot change — a control that is
 * present, enabled and incapable of working.
 *
 * FIX-6 item 4 closed exactly this class on the shortcut routes ("… is not a
 * shortcut id, so there is no shortcut at this address", no Retry) and stopped
 * at that route family. This is the census: ONE module, used by the ONE
 * workspace loader every mandate host renders (the (core) route, the org
 * route, the admin route and the window panel) and by the admin controls fold.
 *
 * Three verdicts, three different screens:
 *   · `not-an-address` — the segment cannot name a mandate at all (`new`,
 *     `categories`, a typo with no dot). Nothing was retired; the reader is
 *     not on a mandate page. No Retry.
 *   · `no-such-mandate` — a well-formed key or id that nothing answers to.
 *     It may genuinely have been removed, and it may equally never have
 *     existed, so the sentence says exactly that and claims neither. No Retry:
 *     the same read gives the same answer.
 *   · `load-failed` — the read itself broke (network, RLS, a server error).
 *     This is the ONLY state where retrying can work, so it is the only state
 *     that offers it.
 */

/**
 * The server's own key rule, verbatim from `aidream/services/mandates/service.py`
 * (`_MANDATE_KEY_RE`): `<major_feature>.<specific_job>`, lowercase snake_case
 * segments, at least two of them. Anything else was never a mandate key, so
 * `POST /mandates` could not have created it and no row can carry it.
 */
export const MANDATE_KEY_PATTERN =
  /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MandateAddressKind = "key" | "id" | "not-an-address";

/** What a URL segment could possibly be. Pure — no DB read involved. */
export function readMandateAddress(segment: string): MandateAddressKind {
  const value = segment.trim();
  if (UUID_PATTERN.test(value)) return "id";
  if (MANDATE_KEY_PATTERN.test(value)) return "key";
  return "not-an-address";
}

export type MandateLoadFailureKind =
  | "not-an-address"
  | "no-such-mandate"
  | "load-failed";

export interface MandateLoadFailure {
  kind: MandateLoadFailureKind;
  /** What the screen says. Never implies a history the address never had. */
  message: string;
  /**
   * Whether re-running the same read could produce a different answer. Drives
   * the Retry control — `false` means the control must not be rendered.
   */
  retryable: boolean;
}

/** The screen for a segment that cannot name a mandate. */
export function notAnAddressFailure(segment: string): MandateLoadFailure {
  return {
    kind: "not-an-address",
    message: `“${segment}” is not a mandate key or id, so there is no mandate at this address. A mandate key looks like feature.specific_job — open one from the mandates list.`,
    retryable: false,
  };
}

/** The screen for a well-formed address nothing answers to. */
export function noSuchMandateFailure(segment: string): MandateLoadFailure {
  return {
    kind: "no-such-mandate",
    message: `No mandate is registered under “${segment}”. Nothing on the platform answers to it — it was either removed or never created. Open one from the mandates list.`,
    retryable: false,
  };
}

/** The screen for a read that actually broke — the one retryable state. */
export function loadFailedFailure(message: string): MandateLoadFailure {
  return { kind: "load-failed", message, retryable: true };
}
