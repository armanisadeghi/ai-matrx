/**
 * lib/api/broker/cache.ts
 *
 * In-memory, refresh-ahead credential cache — the layer feature code actually
 * talks to. `getBrokeredCredential(req)` returns a fresh credential, minting
 * or re-minting only when needed, and dedupes concurrent mints per key.
 *
 * Invariants (from the cross-repo contract):
 *   - Key = the full CredentialRequest identity (audience, tier_policy,
 *     model, scopes, ttl).
 *   - Re-mint when < ~20% of TTL remains, or on any 401 from the
 *     credential's endpoint (see `reportCredentialRejected`).
 *   - NEVER persisted — no localStorage, no Redux (redux-persist would write
 *     it to disk), no DB. Module memory only; it is designed to die.
 *   - Tokens are never logged.
 */

import { mintFromRequest } from "@/lib/api/broker/client";
import { supabase } from "@/utils/supabase/client";
import type {
  BrokeredCredential,
  CachedCredential,
  CredentialRequest,
} from "@/lib/api/broker/types";

/** Re-mint once less than this fraction of the credential's TTL remains. */
const REFRESH_AHEAD_FRACTION = 0.2;

const cache = new Map<string, CachedCredential>();
const inflight = new Map<string, Promise<BrokeredCredential>>();

/** Cache-change listeners (demo/debug introspection — see subscribeBrokerCache). */
const listeners = new Set<() => void>();
function notify(): void {
  for (const l of listeners) l();
}

/** Canonical cache key for a CredentialRequest. */
export function credentialKey(req: CredentialRequest): string {
  const scopes = [...(req.scopes ?? [])].sort().join(",");
  return [
    req.audience,
    req.tierPolicy,
    req.model ?? "",
    scopes,
    req.ttlSeconds ?? "",
  ].join("::");
}

function toCached(credential: BrokeredCredential): CachedCredential {
  const mintedAt = Date.now();
  const expiresAtMs = credential.expires_at * 1000;
  const ttlMs = Math.max(0, expiresAtMs - mintedAt);
  return {
    credential,
    mintedAt,
    freshUntil: mintedAt + ttlMs * (1 - REFRESH_AHEAD_FRACTION),
  };
}

function isFresh(entry: CachedCredential): boolean {
  return Date.now() < entry.freshUntil;
}

// Brokered credentials are minted against the user's session; when the
// session ends they must die with it. Registered lazily on first cache write
// so importing this module stays side-effect-free.
let signOutHookInstalled = false;
function installSignOutHook(): void {
  if (signOutHookInstalled || typeof window === "undefined") return;
  signOutHookInstalled = true;
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") clearBrokerCache();
  });
}

export interface GetCredentialOptions {
  /** Skip the cache and mint a new credential (still dedupes concurrent calls). */
  forceRefresh?: boolean;
  signal?: AbortSignal;
}

/**
 * The primary entry point: return a fresh credential for `req`, minting only
 * when the cache has none or the cached one is inside its refresh-ahead
 * window. Concurrent callers for the same key share one mint request.
 */
export async function getBrokeredCredential(
  req: CredentialRequest,
  opts: GetCredentialOptions = {},
): Promise<BrokeredCredential> {
  const key = credentialKey(req);

  if (!opts.forceRefresh) {
    const entry = cache.get(key);
    if (entry && isFresh(entry)) return entry.credential;
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const mint = mintFromRequest(req, opts.signal)
    .then((credential) => {
      installSignOutHook();
      cache.set(key, toCached(credential));
      notify();
      return credential;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, mint);
  return mint;
}

/**
 * A credential's endpoint rejected it (401). Drop it so the next call
 * re-mints. Pass the rejected credential itself — the cache finds it by
 * token identity, so a newer credential for the same key is never evicted
 * by a stale failure report.
 */
export function reportCredentialRejected(rejected: BrokeredCredential): void {
  for (const [key, entry] of cache) {
    if (entry.credential.token === rejected.token) {
      cache.delete(key);
      notify();
      return;
    }
  }
}

/** Drop the cached credential for a request (e.g. on sign-out of a surface). */
export function invalidateBrokeredCredential(req: CredentialRequest): void {
  if (cache.delete(credentialKey(req))) notify();
}

/** Drop everything — call on user sign-out. */
export function clearBrokerCache(): void {
  if (cache.size === 0) return;
  cache.clear();
  notify();
}

// ---------------------------------------------------------------------------
// Leases — keep a credential continuously fresh while someone holds one
// ---------------------------------------------------------------------------
//
// A lease is the non-React-specific "keep this alive" primitive: acquire it
// and the cache re-mints ahead of expiry until every holder releases. React
// components hold one via `useBrokeredCredential`; long-lived non-React
// consumers (audio sessions, workers) can hold one directly.

/** Re-mint this many ms before the cache's own freshness deadline. */
const LEASE_REFRESH_SLACK_MS = 2_000;
/** Never schedule a lease refresh sooner than this (mint-storm guard). */
const MIN_LEASE_REFRESH_DELAY_MS = 5_000;

export type LeaseStatus = "minting" | "ready" | "error";

export interface LeaseSnapshot {
  status: LeaseStatus;
  credential: BrokeredCredential | null;
  error: Error | null;
}

interface Lease {
  req: CredentialRequest;
  refs: number;
  timer: ReturnType<typeof setTimeout> | null;
  status: LeaseStatus;
  error: Error | null;
}

const leases = new Map<string, Lease>();
// Referentially-stable snapshots per key (useSyncExternalStore contract).
const leaseSnapshots = new Map<string, LeaseSnapshot>();

export const IDLE_LEASE_SNAPSHOT: LeaseSnapshot = Object.freeze({
  status: "minting",
  credential: null,
  error: null,
});

function publishLease(key: string): void {
  const lease = leases.get(key);
  if (!lease) {
    leaseSnapshots.delete(key);
  } else {
    leaseSnapshots.set(key, {
      status: lease.status,
      credential: cache.get(key)?.credential ?? null,
      error: lease.error,
    });
  }
  notify();
}

function scheduleLeaseRefresh(key: string): void {
  const lease = leases.get(key);
  if (!lease) return;
  const entry = cache.get(key);
  const delay = entry
    ? Math.max(
        MIN_LEASE_REFRESH_DELAY_MS,
        entry.freshUntil - Date.now() - LEASE_REFRESH_SLACK_MS,
      )
    : MIN_LEASE_REFRESH_DELAY_MS;
  lease.timer = setTimeout(() => runLeaseMint(key, false), delay);
}

function runLeaseMint(key: string, forceRefresh: boolean): void {
  const lease = leases.get(key);
  if (!lease) return;
  if (lease.status !== "ready") {
    lease.status = "minting";
    publishLease(key);
  }
  void getBrokeredCredential(lease.req, { forceRefresh })
    .then(() => {
      const live = leases.get(key);
      if (!live) return;
      live.status = "ready";
      live.error = null;
      publishLease(key);
      scheduleLeaseRefresh(key);
    })
    .catch((err: unknown) => {
      const live = leases.get(key);
      if (!live) return;
      live.status = "error";
      live.error = err instanceof Error ? err : new Error(String(err));
      publishLease(key);
      // No auto-retry loop — the failure surfaced; the holder retries
      // deliberately via refreshLease (loud-failure contract).
    });
}

/**
 * Keep the credential for `req` continuously fresh until the returned
 * release function is called. Refcounted per key — concurrent holders of the
 * same request share one refresh loop.
 */
export function acquireCredentialLease(req: CredentialRequest): () => void {
  const key = credentialKey(req);
  let lease = leases.get(key);
  if (!lease) {
    lease = { req, refs: 0, timer: null, status: "minting", error: null };
    leases.set(key, lease);
    runLeaseMint(key, false);
  }
  lease.refs += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const live = leases.get(key);
    if (!live) return;
    live.refs -= 1;
    if (live.refs <= 0) {
      if (live.timer) clearTimeout(live.timer);
      leases.delete(key);
      publishLease(key);
    }
  };
}

/** Force a fresh mint for a leased request now (manual retry). */
export function refreshLease(req: CredentialRequest): void {
  const key = credentialKey(req);
  const lease = leases.get(key);
  if (!lease) return;
  if (lease.timer) clearTimeout(lease.timer);
  lease.status = "minting";
  publishLease(key);
  runLeaseMint(key, true);
}

/** Stable per-key lease snapshot; `IDLE_LEASE_SNAPSHOT` when no lease exists. */
export function getLeaseSnapshot(key: string): LeaseSnapshot {
  return leaseSnapshots.get(key) ?? IDLE_LEASE_SNAPSHOT;
}

// ---------------------------------------------------------------------------
// Introspection (debug/demo surfaces only — never render `credential.token`)
// ---------------------------------------------------------------------------

export interface BrokerCacheSnapshotEntry extends CachedCredential {
  key: string;
}

// Memoized so useSyncExternalStore sees a stable reference between changes.
let cacheSnapshot: BrokerCacheSnapshotEntry[] | null = null;
listeners.add(() => {
  cacheSnapshot = null;
});

/** Immutable snapshot of the cache for debug UIs. */
export function peekBrokerCache(): BrokerCacheSnapshotEntry[] {
  cacheSnapshot ??= [...cache.entries()].map(([key, entry]) => ({
    key,
    ...entry,
  }));
  return cacheSnapshot;
}

/** Subscribe to cache/lease changes (mint / evict / clear). Returns unsubscribe. */
export function subscribeBrokerCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
