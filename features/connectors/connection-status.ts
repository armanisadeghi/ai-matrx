// features/connectors/connection-status.ts
//
// THE CONNECTION STATUS VOCABULARY — the words `users.integration_connections
// .status` may hold, and what each one means for a person. Provider-neutral,
// because the column is: one table holds Google, GitHub, Bing, Microsoft and the
// storage providers, and the status is a shared CLAIM, not each integration's
// opinion (aidream `services/connection_health.py` says the same thing on its
// side and owns the writing).
//
// 🚨 WHY A THIRD TERMINAL WORD EXISTS (chair ruling R22, 2026-09-18, after
// VERIFY-U-P2-R5 finding V17-1). `connected` and `needs_attention` could not
// express the one state a person most needs told: Google has rejected OUR OWN
// OAuth client configuration, so not a single token can be minted for any
// account — and because that is deliberately NOT a credential failure, the row
// stayed `connected`. The card then said the word "Connected" ten times, and
// "9 of 9 products in use", directly above its own sentence saying no Google
// account could be used. `needs_attention` would have been the other lie: it is
// the browser's cue to press Reconnect, and reconnecting cannot help.
//
//   • `connected`       — usable right now.
//   • `needs_attention` — the CREDENTIAL is broken and ONE reconnect repairs it.
//   • `unavailable`     — the provider, or our own platform configuration,
//                         blocks every call. Nothing the person can click
//                         repairs it, so nothing that looks pressable is shown.
//   • `disconnected` / `revoked` — the connection is gone; connecting again is a
//                         fresh grant.
//
// 🚨 AND AN UNRECOGNISED WORD IS A REAL ANSWER. The two repos deploy
// independently, so the deployed server may write a status this build has never
// heard of. `readConnectionStatus` answers `null` for it and the surfaces then
// render honestly with no live control — never "Connected", which is what
// `features/marketing/google/service.ts` used to do by collapsing everything it
// did not recognise into `connected`.
//
// The set is MEASURED against the server's own declaration by
// `__tests__/connection-statuses-are-the-servers-statuses.test.ts`, the same way
// the refusal codes, the admission codes and the approval receipt states are —
// a hand copy with nothing diffing it is the defect that census pattern exists
// to kill (V14-4).

/**
 * Every status this build recognises, in the order a person would rank them from
 * "works" to "gone". The census asserts this is a SUPERSET of what the server
 * declares, and names every entry the server does not, so an extra word here has
 * to carry its reason below.
 */
export const CONNECTION_STATUSES = [
  "connected",
  "needs_attention",
  "unavailable",
  "disconnected",
  "revoked",
] as const;

export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/**
 * Statuses that are LIVE in the database but are not in the server's shared
 * declaration, each with the writer that produces it. A word may only be here
 * with a reason — that is what stops this union drifting back into a hand copy.
 *
 * `revoked` is Google's own disconnect word (`aidream/aidream/services/
 * google_integrations/service.py` writes `status="revoked"` when an account is
 * disconnected) while every other integration writes `disconnected` for the same
 * thing. Both are read here so neither reads as connected.
 */
export const CLIENT_ONLY_CONNECTION_STATUSES: Readonly<
  Partial<Record<ConnectionStatus, string>>
> = {
  revoked:
    "written by google_integrations/service.py on disconnect; the shared vocabulary declares `disconnected` for the same thing",
};

export function isConnectionStatus(value: unknown): value is ConnectionStatus {
  return (
    typeof value === "string" &&
    (CONNECTION_STATUSES as readonly string[]).includes(value)
  );
}

/** A status word as read, and whether this build knows it. */
export interface ConnectionStatusReading {
  /** The word the row carried, verbatim — for an operator surface only. */
  asRead: string;
  /** Null when this build has never heard of it. Null is NOT "connected". */
  status: ConnectionStatus | null;
}

/**
 * Read the column. A missing or non-string value is treated exactly like an
 * unrecognised word: we cannot say, so nothing may claim the account works.
 */
export function readConnectionStatus(value: unknown): ConnectionStatusReading {
  const asRead = typeof value === "string" ? value : "";
  return { asRead, status: isConnectionStatus(asRead) ? asRead : null };
}

/**
 * Does this status mean the provider will authorize NOTHING for this account,
 * with nothing the person can press to change it? `unavailable` says so
 * outright; an unrecognised status says it by default, because a claim we cannot
 * vouch for is never rendered as a working connection.
 */
export function statusBlocksEverything(
  reading: ConnectionStatusReading,
): boolean {
  return reading.status === "unavailable" || reading.status === null;
}
