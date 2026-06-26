/**
 * agent-definition / cache-bust middleware
 *
 * Fires a fire-and-forget `POST {baseUrl}/ai/agents/{agentId}/invalidate-cache`
 * on the Python backend whenever an agent's definition is mutated
 * client-side. The server uses the call to evict exactly that agent from its
 * ORM `StateManager` caches (`AgxAgent` + `AgxVersion`) — surgical, unlike
 * the conversation-scoped `cache_bypass.agent` flag which flushes every
 * cached agent.
 *
 * Triggers on the fulfilled action of every write thunk that changes the
 * persisted agent row:
 *
 *   - `agentDefinition/save/fulfilled`              (full multi-field save)
 *   - `agentDefinition/saveField/fulfilled`         (single-field inline edit)
 *   - `agentDefinition/promoteVersion/fulfilled`    (past version → live)
 *   - `agentDefinition/updateFromSource/fulfilled`  (derived reset)
 *   - `agentDefinition/purgeVersions/fulfilled`     (version history trim)
 *
 * Skipped intentionally:
 *   - `create` / `duplicate`  → new row, nothing cached server-side yet
 *   - `acceptVersion`         → mutates the *reference* (shortcut/app), not
 *                               the agent itself
 *
 * Behavior:
 *   - Debounced 200ms per agentId so rapid `saveAgentField` clicks coalesce
 *     into a single bust.
 *   - In-flight dedup per agentId — a second trigger while one is mid-flight
 *     schedules exactly one follow-up bust on completion.
 *   - `keepalive: true` so the request survives tab-close / hard-nav.
 *   - Errors are swallowed (logged in dev only). The server bust is a
 *     correctness optimization, not a critical path — the next agent run
 *     will surface staleness loud and fast if the bust ever fails.
 */

import type { Middleware } from "@reduxjs/toolkit";
import {
  postInvalidateAgentCache,
  resolveAgentCacheBustBackend,
} from "./agent-cache-bust-request";

// ---------------------------------------------------------------------------
// Action matching
// ---------------------------------------------------------------------------

const WATCHED_ACTION_TYPES = new Set<string>([
  "agentDefinition/save/fulfilled",
  "agentDefinition/saveField/fulfilled",
  "agentDefinition/promoteVersion/fulfilled",
  "agentDefinition/updateFromSource/fulfilled",
  "agentDefinition/purgeVersions/fulfilled",
]);

/**
 * Each watched thunk's `meta.arg` shape carries the agent id differently.
 * Normalize to a plain string id, or null when the action isn't one we
 * care about.
 */
function extractAgentId(action: unknown): string | null {
  if (!action || typeof action !== "object") return null;
  const typed = action as {
    type?: string;
    meta?: { arg?: unknown };
  };
  if (!typed.type || !WATCHED_ACTION_TYPES.has(typed.type)) return null;

  const arg = typed.meta?.arg;
  if (typeof arg === "string") return arg;
  if (arg && typeof arg === "object" && "agentId" in arg) {
    const id = (arg as { agentId?: unknown }).agentId;
    return typeof id === "string" ? id : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Per-agent scheduling state
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 200;

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const inFlight = new Set<string>();
const pendingAfterFlight = new Set<string>();

// ---------------------------------------------------------------------------
// Network call
// ---------------------------------------------------------------------------

async function bustAgentCache(
  baseUrl: string,
  agentId: string,
  headers: Record<string, string>,
): Promise<void> {
  // `is_version` is omitted — Builder saves always mutate the live
  // `agx_agent` row, never a version snapshot (the default is false).
  try {
    await postInvalidateAgentCache(baseUrl, agentId, headers, {
      keepalive: true,
    });
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(`[agent cache-bust] ${agentId} →`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export const agentCacheBustMiddleware: Middleware =
  (storeApi) => (next) => (action) => {
    // Let the reducer + downstream middleware run first so state is settled
    // by the time we read it.
    const result = next(action);

    const agentId = extractAgentId(action);
    if (!agentId) return result;

    // Debounce per-agent. A rapid sequence of `saveAgentField` saves collapses
    // into exactly one bust at the trailing edge.
    const existing = debounceTimers.get(agentId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      debounceTimers.delete(agentId);

      // Coalesce against an in-flight bust for the same agent.
      if (inFlight.has(agentId)) {
        pendingAfterFlight.add(agentId);
        return;
      }

      // Resolve URL + auth at fire-time so server toggles / token refresh
      // take effect immediately.
      const backend = resolveAgentCacheBustBackend(storeApi.getState());
      if (!backend) return;

      inFlight.add(agentId);
      void bustAgentCache(backend.baseUrl, agentId, backend.headers).finally(
        () => {
          inFlight.delete(agentId);
          if (pendingAfterFlight.delete(agentId)) {
            // A trigger arrived while we were in-flight — fire one more pass.
            // Re-enter the debounce path so any further triggers still coalesce.
            const followup = setTimeout(() => {
              debounceTimers.delete(agentId);
              const followupBackend = resolveAgentCacheBustBackend(
                storeApi.getState(),
              );
              if (!followupBackend) return;
              inFlight.add(agentId);
              void bustAgentCache(
                followupBackend.baseUrl,
                agentId,
                followupBackend.headers,
              ).finally(() => {
                inFlight.delete(agentId);
              });
            }, DEBOUNCE_MS);
            debounceTimers.set(agentId, followup);
          }
        },
      );
    }, DEBOUNCE_MS);

    debounceTimers.set(agentId, timer);
    return result;
  };
