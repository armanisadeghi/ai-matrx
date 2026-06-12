/**
 * features/files/redux/request-ledger.ts
 *
 * In-memory correlation map between client-generated `requestId`s (attached to
 * every mutation via X-Request-Id) and the realtime payloads they echo.
 *
 * USE
 * ---
 * - Thunks call `registerRequest({ requestId, kind, resourceId, resourceType })`
 *   before dispatching a REST write. The optimistic reducer has already
 *   applied the change locally.
 * - The realtime middleware calls `isOwnEcho(payload)` on every incoming
 *   event. If the payload's `metadata.request_id` matches a live ledger
 *   entry, it's our own echo — skip the dispatch. Otherwise the change came
 *   from elsewhere (server, other device, share-link visitor) and we apply it.
 * - Entries expire automatically after 30s so stale ids don't swallow
 *   legitimate later updates to the same resource. Thunks also explicitly
 *   `releaseRequest(requestId)` once the REST call returns (success or error).
 *
 * As of 2026-05-17 the Python backend reliably stamps
 * `metadata.request_id` on every cloud_sync write (commit `d647c143` —
 * see features/files/from_python/UPDATES.md §9). The legacy 2s
 * timestamp-fuzzy fallback was removed at that point — direct
 * supabase writes that don't stamp request_id will trigger an echo
 * re-apply, which is idempotent (upsert keyed on id).
 */

import type {
  LedgerEntry,
  RequestKind,
  ResourceType,
} from "@/features/files/types";

const ENTRY_TTL_MS = 30_000;

type EntryWithTimer = LedgerEntry & { _timer: ReturnType<typeof setTimeout> };

const ledger = new Map<string, EntryWithTimer>();

/**
 * Quick accessor for the full map size — used in DevTools / diagnostics only.
 */
export function ledgerSize(): number {
  return ledger.size;
}

export interface RegisterArgs {
  requestId: string;
  kind: RequestKind;
  resourceId: string | null;
  resourceType: ResourceType | null;
}

export function registerRequest(args: RegisterArgs): void {
  // If this id is already in flight (unlikely — UUIDs), refresh the timer.
  releaseRequest(args.requestId);

  const entry: EntryWithTimer = {
    requestId: args.requestId,
    kind: args.kind,
    resourceId: args.resourceId,
    resourceType: args.resourceType,
    createdAt: Date.now(),
    _timer: setTimeout(() => {
      ledger.delete(args.requestId);
    }, ENTRY_TTL_MS),
  };
  ledger.set(args.requestId, entry);
}

export function releaseRequest(requestId: string): void {
  const existing = ledger.get(requestId);
  if (!existing) return;
  clearTimeout(existing._timer);
  ledger.delete(requestId);
}

/**
 * Returns the entry if the given id is a known in-flight request, otherwise
 * null. Does NOT release it — the thunk is responsible for explicit release
 * on REST completion.
 */
export function getEntry(requestId: string): LedgerEntry | null {
  const e = ledger.get(requestId);
  if (!e) return null;
  const { _timer: _t, ...rest } = e;
  return rest;
}

/**
 * Checks a realtime payload for an own-echo match: explicit
 * `request_id` in the row metadata matches an in-flight ledger entry.
 *
 * Returns true if the caller should SKIP this payload (it's our own echo).
 */
export function isOwnEcho(payload: {
  requestId: string | null;
  resourceId: string | null;
  resourceType: ResourceType | null;
}): boolean {
  return Boolean(payload.requestId && ledger.has(payload.requestId));
}

/** Test/debug helper. */
export function clearLedger(): void {
  for (const entry of ledger.values()) clearTimeout(entry._timer);
  ledger.clear();
  resourceSeq.clear();
}

// ---------------------------------------------------------------------------
// Per-resource operation sequencing (P1-1 double-submit, P1-2 out-of-order)
// ---------------------------------------------------------------------------
//
// Each mutating thunk calls `beginResourceOp(resourceId)` at the start to get a
// monotonically increasing sequence number for that resource, then — before
// applying the authoritative server response — checks `isLatestResourceOp`.
// If a newer op for the same resource has begun since, the older response is
// stale and must NOT overwrite the newer optimistic state (rename A→B→C where
// C resolves before B; or a double-click firing two writes). The newest op's
// own optimistic update + response is the source of truth.

const resourceSeq = new Map<string, number>();

/** Begin an op on a resource; returns this op's sequence number. */
export function beginResourceOp(resourceId: string): number {
  const next = (resourceSeq.get(resourceId) ?? 0) + 1;
  resourceSeq.set(resourceId, next);
  return next;
}

/** True if `seq` is still the most recent op begun for `resourceId`. */
export function isLatestResourceOp(resourceId: string, seq: number): boolean {
  return (resourceSeq.get(resourceId) ?? 0) === seq;
}

/**
 * True if a live ledger entry of `kind` already targets `resourceId` — used to
 * suppress duplicate non-idempotent submits (e.g. a second "create share link"
 * click that would mint a second token).
 */
export function hasInFlight(
  resourceId: string,
  kind: RequestKind,
): boolean {
  for (const e of ledger.values()) {
    if (e.resourceId === resourceId && e.kind === kind) return true;
  }
  return false;
}
