/**
 * Desktop presence — is the signed-in user's matrx-local desktop engine
 * online right now?
 *
 * Source of truth: the public `app_instances` table (one row per desktop,
 * keyed (user_id, instance_id)). The matrx-local engine heartbeats
 * `last_seen` every 5 minutes (`matrx-local/app/main.py::_heartbeat_loop`),
 * so "online" = a non-deleted, active row whose `last_seen` is within
 * LIVE_WINDOW_MS (two heartbeats + slack). Read DIRECT from Supabase via
 * supabase-js — RLS scopes rows to the caller; never route this through the
 * Python server.
 *
 * ONE cache serves both consumers:
 *   - the `desktop-native` capability provider (per-turn, request-build time)
 *   - `useDesktopPresence` → the smart-input indicator (reactive)
 * Module-scoped TTL cache + in-flight dedup so a burst of turns/mounts costs
 * at most one query per CACHE_TTL_MS.
 *
 * Staleness is inherent: a desktop that dies looks alive for up to
 * LIVE_WINDOW_MS. That's acceptable — a delegated call to a dead desktop
 * lands in the durable ledger (30-day expiry) and executes when the engine
 * returns; the window only bounds how long we might declare a dead executor.
 */

import { supabase } from "@/utils/supabase/client";

/** matrx-local heartbeats every 5 min; allow one missed beat + 60s slack. */
const LIVE_WINDOW_MS = 11 * 60_000;
/** How long a presence answer is reused before re-querying. */
const CACHE_TTL_MS = 30_000;

export interface DesktopPresence {
  /** cloud_sync identity — `app_instances.instance_id`, NOT the row PK. */
  instanceId: string;
  instanceName: string;
  /** `sys.platform`-style value the engine registered (darwin/win32/linux). */
  platform: string;
  /** Engine version if the row's metadata carries one; "" = unknown. */
  engineVersion: string;
  tunnelActive: boolean;
  lastSeen: string;
}

interface CacheEntry {
  value: DesktopPresence | null;
  fetchedAt: number;
}

let cache: CacheEntry | null = null;
let inFlight: Promise<DesktopPresence | null> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function readEngineVersion(metadata: unknown): string {
  if (metadata == null || typeof metadata !== "object") return "";
  const record = metadata as Record<string, unknown>;
  const candidate = record["engine_version"] ?? record["app_version"];
  return typeof candidate === "string" ? candidate : "";
}

async function fetchPresence(): Promise<DesktopPresence | null> {
  const cutoff = new Date(Date.now() - LIVE_WINDOW_MS).toISOString();
  // VIEW LAW: container-scoped via RLS — app_instances rows are keyed (user_id, instance_id), see docblock above
  const { data, error } = await supabase
    .from("app_instances")
    .select("instance_id,instance_name,platform,metadata,tunnel_active,last_seen")
    .is("deleted_at", null)
    .eq("is_active", true)
    .gte("last_seen", cutoff)
    .order("last_seen", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Loud, but non-fatal: presence failing must never block a chat turn —
    // the turn simply goes out without the desktop capability.
    console.error(
      "[desktop-presence] app_instances query failed:",
      error.message,
    );
    return null;
  }
  if (!data) return null;
  return {
    instanceId: data.instance_id,
    instanceName: data.instance_name,
    platform: data.platform ?? "",
    engineVersion: readEngineVersion(data.metadata),
    tunnelActive: data.tunnel_active,
    lastSeen: data.last_seen,
  };
}

/**
 * The live desktop instance, or null when none is online. Cached for
 * CACHE_TTL_MS with in-flight dedup; safe to call on every turn build.
 */
export function getLiveDesktopInstance(): Promise<DesktopPresence | null> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return Promise.resolve(cache.value);
  }
  if (inFlight) return inFlight;
  inFlight = fetchPresence()
    .then((fresh) => {
      // Preserve object identity when nothing consumer-visible changed so
      // useSyncExternalStore snapshots stay referentially stable (lastSeen
      // alone advancing is not a presence transition).
      const prev = cache?.value ?? null;
      const unchanged =
        prev != null &&
        fresh != null &&
        prev.instanceId === fresh.instanceId &&
        prev.instanceName === fresh.instanceName &&
        prev.platform === fresh.platform &&
        prev.engineVersion === fresh.engineVersion &&
        prev.tunnelActive === fresh.tunnelActive;
      const value = unchanged ? prev : fresh;
      cache = { value, fetchedAt: Date.now() };
      if (value !== prev) notify();
      return value;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Synchronous cache read for useSyncExternalStore. null = offline OR not yet fetched. */
export function getCachedDesktopPresence(): DesktopPresence | null {
  return cache?.value ?? null;
}

/** Subscribe to presence transitions (online ↔ offline / instance change). */
export function subscribeDesktopPresence(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
