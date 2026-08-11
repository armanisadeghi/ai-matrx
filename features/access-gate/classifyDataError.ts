/**
 * classifyDataError — decide whether a failed read is an ACCESS story or a FAULT.
 *
 * Under RLS, a single-row read returns `{ data: null, error: null }` for at
 * least four different situations:
 *
 *   1. the row is soft-deleted
 *   2. the row never existed
 *   3. the caller isn't allowed to see it
 *   4. the caller's session expired, so they're anonymous to Postgres
 *
 * `lib/records/recordUnavailable.ts` already owns the THROW for that moment: it
 * refuses to claim deletion without proof, says both possibilities out loud,
 * and screams into the Error Inspector. This file is the other half — deciding,
 * at the render site, whether to hand the failure to the access gate (which
 * asks the platform which of the four it actually is, and offers a way forward)
 * or to a plain error surface.
 *
 * The two compose: `recordUnavailable` is the honest-but-vague throw,
 * `<AccessGate>` turns it into the specific truth plus a next step. Neither
 * duplicates the other, and there is no second marker-error type.
 */

import { isRecordUnavailableError } from "@/lib/records/recordUnavailable";

/** What a thrown value tells us on its own, before asking the platform. */
export type DataErrorKind =
  /** A policy said no out loud (rare — RLS usually filters silently). */
  | "denied"
  /** Zero rows, or a proven-deleted record: the access gate can explain it. */
  | "unknown"
  /** A real fault — network, timeout, bad query. Show an error, offer retry. */
  | "fault";

interface Postgrestish {
  code?: unknown;
  status?: unknown;
}

/**
 * Classify a thrown value from a data read.
 *
 * `PGRST116` is PostgREST's zero-row error from `.single()`. It means "no row
 * came back" and NEVER "deleted", so it maps to `unknown` and sends the surface
 * to the access gate — mapping it to a 404 is the bug this feature exists to
 * stop.
 */
export function classifyDataError(error: unknown): DataErrorKind {
  // A zero-row read that already went through the canonical honest throw.
  if (isRecordUnavailableError(error)) return "unknown";

  // No error at all — the caller got `data: null` and nothing else. That is the
  // silent-RLS case, which is precisely an access question.
  if (error === null || error === undefined) return "unknown";

  const e = error as Postgrestish;
  const code = typeof e.code === "string" ? e.code : "";
  const status = typeof e.status === "number" ? e.status : 0;

  if (code === "PGRST116") return "unknown";
  // 42501 = insufficient_privilege.
  if (code === "42501" || status === 401 || status === 403) return "denied";
  return "fault";
}

/** True when the failure is something the access gate can explain. */
export function isAccessQuestion(error: unknown): boolean {
  return classifyDataError(error) !== "fault";
}
