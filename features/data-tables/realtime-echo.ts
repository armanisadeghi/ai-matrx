/**
 * Echo suppression for user-table realtime — the decision, isolated and tested.
 *
 * Supabase sends you your OWN writes. The echo arrives 50–500ms AFTER your REST
 * call already returned the fresh row, which is why an "is a save in flight?"
 * flag can never catch it: by the time the echo lands the flag is long cleared.
 * The guard has to be TIMESTAMP-MONOTONIC. (`supabase-realtime` skill, rule 1.)
 *
 * Getting this wrong is not cosmetic. Before it existed, every event — ours
 * included — triggered a debounced refetch of the whole table, so a beat after
 * each save the grid reloaded, remounted, flashed, and lost the user's place.
 * We were reloading the table to learn what we had just written.
 *
 * 🚨 WHEN UNSURE, DELIVER. Suppressing a change we should have shown is silent
 * data loss on screen — the user stares at a value that is no longer true.
 * Delivering one we could have suppressed is a flicker. Those are not
 * comparable costs, so every ambiguous case here resolves to "deliver".
 *
 * Pure module: no React, no Supabase, so the decision is testable without a
 * socket.
 */

export type EchoDecision = "drop-stale" | "drop-own-echo" | "deliver";

export type EchoInput = {
  /** `updated_at` of the row as we currently hold it. */
  localUpdatedAt?: string | null;
  /** `updated_at` carried by the realtime payload. */
  incomingUpdatedAt?: string | null;
  /** The row body we hold. */
  localData: Record<string, unknown> | null | undefined;
  /** The row body the payload carries. */
  incomingData: Record<string, unknown> | null | undefined;
};

/** Stable-enough structural comparison for "is this the same row body?". */
function sameBody(
  a: Record<string, unknown> | null | undefined,
  b: Record<string, unknown> | null | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const ak = Object.keys(a).sort();
  const bk = Object.keys(b).sort();
  if (ak.length !== bk.length) return false;
  for (let i = 0; i < ak.length; i += 1) if (ak[i] !== bk[i]) return false;
  return ak.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));
}

export function classifyEcho(input: EchoInput): EchoDecision {
  const { localUpdatedAt, incomingUpdatedAt, localData, incomingData } = input;

  // Nothing to apply — never "suppress" our way into showing nothing.
  if (!incomingData) return "deliver";

  const localAt = localUpdatedAt ? Date.parse(localUpdatedAt) : NaN;
  const incomingAt = incomingUpdatedAt ? Date.parse(incomingUpdatedAt) : NaN;

  // Either side unparseable (or absent): we cannot order them, so fall through
  // to content. Identical content is our echo; anything else is delivered.
  if (!Number.isFinite(localAt) || !Number.isFinite(incomingAt)) {
    return sameBody(localData, incomingData) ? "drop-own-echo" : "deliver";
  }

  // Strictly older than what we hold carries no information at all.
  if (incomingAt < localAt) return "drop-stale";

  // Same instant: ours if the body matches, a genuine same-millisecond
  // collaborator write if it does not.
  if (incomingAt === localAt) {
    return sameBody(localData, incomingData) ? "drop-own-echo" : "deliver";
  }

  // Newer than ours — always real.
  return "deliver";
}
