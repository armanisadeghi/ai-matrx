/**
 * features/agents/addressing/agentAddressCache.ts
 *
 * THE ONE READ that turns "an id" into "an address" — see `agentAddress.ts`
 * for why a caller holding only an id cannot know where the agent opens.
 *
 * Three properties matter and all three are why this is a module and not an
 * inline `useEffect`:
 *
 *   BATCHED  — a mandate console renders dozens of agent links in one paint.
 *              Requests raised in the same tick become ONE `rpc` call.
 *   CACHED   — an id resolves once per page load. A resolved address cannot
 *              change under the user (an agent does not switch kind), and a
 *              MISS is cached too, so a broken id is not re-asked forever.
 *   HONEST   — an id the caller cannot see (RLS) or that does not exist
 *              resolves to a MISS, and the UI refuses in a sentence. It never
 *              falls back to `/agents/<id>`, which is exactly the guess that
 *              sent system agents into the user shell.
 *
 * `agx_resolve_agent_address` answers the agent question and the VERSION
 * question in the same row, so a version id lands on agent + version with no
 * second round trip.
 */

import { createClient } from "@/utils/supabase/client";
import type { AgentAddress } from "./agentAddress";

/** A resolution outcome. `null` means "resolved, and there is nothing there". */
export type AgentAddressResult = AgentAddress | null;

const cache = new Map<string, AgentAddressResult>();
const inFlight = new Map<string, Promise<AgentAddressResult>>();

/** Ids raised this tick, waiting for the batch to go out. */
let pending: string[] = [];
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let pendingResolvers: Array<() => void> = [];

interface RpcRow {
  input_id: string;
  is_version: boolean;
  agent_id: string;
  agent_type: string | null;
  agent_name: string | null;
  version_number: number | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Already-known answer, or undefined when this id has never been resolved. */
export function peekAgentAddress(id: string): AgentAddressResult | undefined {
  return cache.get(id);
}

/**
 * Seed the cache from a row the caller already holds. Every list that fetches
 * agents should call this — it removes the read entirely for ids the page has
 * already paid for.
 */
export function seedAgentAddress(address: AgentAddress): void {
  cache.set(address.agentId, address);
}

/** Test seam: forget everything. Never called by app code. */
export function __resetAgentAddressCache(): void {
  cache.clear();
  inFlight.clear();
  pending = [];
  pendingResolvers = [];
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = null;
}

async function flush(): Promise<void> {
  const ids = pending;
  const waiters = pendingResolvers;
  pending = [];
  pendingResolvers = [];
  pendingTimer = null;
  if (ids.length === 0) {
    waiters.forEach((w) => w());
    return;
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("agx_resolve_agent_address", {
      p_ids: ids,
    });
    if (error) throw error;
    const rows = (data ?? []) as RpcRow[];
    for (const row of rows) {
      cache.set(row.input_id, {
        agentId: row.agent_id,
        agentType: row.agent_type,
        agentName: row.agent_name,
        isVersion: row.is_version,
        versionNumber: row.version_number,
      });
    }
    // Every id the RPC did not answer for is a real miss — cache it so a
    // broken link asks once, not on every render.
    for (const id of ids) if (!cache.has(id)) cache.set(id, null);
  } catch (err) {
    // LOUD: a failed resolve must not silently become a guessed href. Leave
    // the ids UNCACHED so a later render retries, and let every waiter see a
    // miss for now — the UI refuses honestly instead of linking wrongly.
    console.error(
      "[agent-address] LOUD: could not resolve agent addresses; agent links " +
        "will refuse rather than guess a shell. Ids:",
      ids,
      err,
    );
  } finally {
    waiters.forEach((w) => w());
  }
}

/**
 * Resolve one id (an agent id OR a version id) to its address.
 *
 * Returns null when nothing is there — a deleted agent, an id the caller may
 * not see, or a value that was never an agent id at all.
 */
export function resolveAgentAddress(
  id: string,
): Promise<AgentAddressResult> | AgentAddressResult {
  if (!id || !UUID_RE.test(id)) return null;
  const cached = cache.get(id);
  if (cached !== undefined) return cached;

  const existing = inFlight.get(id);
  if (existing) return existing;

  const promise = new Promise<void>((resolve) => {
    pending.push(id);
    pendingResolvers.push(resolve);
    if (!pendingTimer) pendingTimer = setTimeout(() => void flush(), 0);
  }).then(() => {
    inFlight.delete(id);
    const answer = cache.get(id);
    return answer === undefined ? null : answer;
  });

  inFlight.set(id, promise);
  return promise;
}

/** Resolve many ids at once — one RPC, cache-aware. */
export async function resolveAgentAddresses(
  ids: readonly string[],
): Promise<Map<string, AgentAddressResult>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const answers = await Promise.all(
    unique.map(async (id) => [id, await resolveAgentAddress(id)] as const),
  );
  return new Map(answers);
}
