// lib/entity-list/failure.ts
//
// WHY A LIST HAS NO ROWS — in the one shape every entity-list surface reasons
// about.
//
// 🚨 THE DEFECT THIS CLOSES (one-resolution R-O1, measured on production
// `https://www.aimatrx.com/mandates?scope=system` as a real non-admin,
// 2026-09-08). The shell held a failure as a bare `string`, so it could not
// tell a REFUSAL from a BREAKAGE, and printed the same sentence through two
// channels at once — a permanent banner plus a toast, the toast fired again on
// every refetch. Three copies of one refusal on one screen, beside a **Retry**
// that could never succeed and an empty state reading *"Clear the filters to
// see the full registry"* with nothing filtered. Two prohibitions of the
// nothing-fails-silently law (a dead control, and a sentence that is not true)
// out of one missing distinction.
//
// The distinction is: could asking again plausibly change the answer?
//   NO  — the door REFUSED this caller. It will refuse the identical request a
//         millisecond later, so a Retry is a control that cannot succeed and
//         must be ABSENT, not dead. And the emptiness is not a filter problem:
//         nothing was read at all.
//   YES — the read broke (network, gateway, a query error). Retry is a real
//         way out and is offered.
//
// Classification is DUCK-TYPED on purpose. `lib/` is the shared layer and must
// not import a feature's error class; instead, any door in any feature that
// carries `refused`, `retryable` or a SQLSTATE/PostgREST `code` inherits this
// for free — `features/mandates/door-error.ts` already sets `refused` on 42501,
// and every other door gets the same treatment by carrying the same field.

/** Why a list is empty, in words the shell can both print and reason about. */
export interface EntityListFailure {
  /** The door's own sentence. Printed ONCE, by the shell's one failure slot. */
  message: string;
  /**
   * Whether asking again could plausibly change the answer. FALSE for a
   * refusal — see the header. The shell offers Retry on exactly this bit.
   */
  retryable: boolean;
}

/**
 * SQLSTATE / PostgREST codes that mean "this caller may not", never "the read
 * broke". `42501` is insufficient_privilege — what every `mnd_*` door raises
 * when it refuses. `P0001` is a plain `RAISE EXCEPTION`: a door DECIDING, so
 * the identical request gets the identical decision. `PGRST301`/`PGRST302` are
 * PostgREST's own JWT/authorization refusals.
 */
const REFUSAL_CODES = new Set(["42501", "P0001", "PGRST301", "PGRST302"]);

/** True when a read was REFUSED, rather than having failed. */
export function isEntityListRefusal(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const door = error as {
    refused?: unknown;
    retryable?: unknown;
    code?: unknown;
    status?: unknown;
  };
  if (door.refused === true) return true;
  if (door.retryable === false) return true;
  if (typeof door.code === "string" && REFUSAL_CODES.has(door.code))
    return true;
  return door.status === 401 || door.status === 403;
}

/**
 * Whatever a service threw, as the one failure shape. The thrown error's own
 * message is kept whole — the campaign's rule is that a door's sentence
 * reaches the reader unedited — and `fallback` covers only the case where
 * there is no message at all.
 */
export function toEntityListFailure(
  error: unknown,
  fallback: string,
): EntityListFailure {
  const message =
    error instanceof Error && error.message.trim() ? error.message : fallback;
  return { message, retryable: !isEntityListRefusal(error) };
}
