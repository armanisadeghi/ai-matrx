/**
 * persistCapturedErrors.ts
 *
 * Persists SELECTED Error Inspector captures to the canonical server error sink
 * (`public.system_error`) via the auth-checked `log_client_error` RPC, so client
 * errors join the SAME queryable store + admin dashboard as server errors.
 * Direct client INSERT is RLS-denied — the RPC is the canonical browser path
 * (React → Supabase directly). See migrations/log_client_error.sql.
 *
 * Conservative by design — NOT the in-memory firehose:
 *   - RED tier for established accounts; every tier for guests and accounts
 *     during their first seven days.
 *   - Deduped: each distinct captured entry is persisted at most once per session.
 *   - Throttled: debounced flush, capped per flush.
 *   - Production only: dev/local errors never pollute the prod dashboard.
 *   - Authenticated errors use the canonical RPC; known guests use the internal
 *     endpoint and retain fingerprint attribution.
 *   - Never persists its OWN RPC failure (relation "log_client_error") — no loop.
 *   - Fire-and-forget + try/caught: persistence never breaks the app.
 *
 * Installed once from app/DeferredSingletons.tsx via `installErrorPersistence()`.
 */

import {
  subscribe,
  getSnapshot,
  type CapturedError,
} from "@/lib/diagnostics/errorCaptureStore";
import type { Json } from "@/types/database.types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FLUSH_DELAY_MS = 1500;
// A zero-row read starts life as `record-unavailable (...unknown)` and is
// reconciled asynchronously by AccessGate. The ordinary 1.5s flush can beat
// that resolver and persist an expected denial while it is still provisional.
// Ten seconds is the bounded settlement window: handled denials turn yellow
// and stay local; a resolver that cannot answer still becomes a durable alarm.
const RECORD_UNAVAILABLE_SETTLE_MS = 10_000;
const MAX_PER_FLUSH = 20;
export const EARLY_USER_OBSERVATION_MS = 7 * 24 * 60 * 60 * 1000;

let installed = false;
let flushScheduled = false;
const persistedIds = new Set<string>();

function scheduleFlush(delayMs: number): void {
  if (flushScheduled) return;
  flushScheduled = true;
  setTimeout(() => {
    void flush();
  }, delayMs);
}

function provisionalRecordUnavailableDelayMs(
  entry: CapturedError,
  now: number,
): number {
  if (
    entry.source !== "record-unavailable" ||
    !entry.message.endsWith("(unknown)")
  ) {
    return 0;
  }
  return Math.max(0, entry.firstAt + RECORD_UNAVAILABLE_SETTLE_MS - now);
}

export function shouldPersistCapturedTier({
  tier,
  isGuest,
  createdAt,
  now,
}: {
  tier: CapturedError["tier"];
  isGuest: boolean;
  createdAt: string | null;
  now: number;
}): boolean {
  if (tier === "red" || isGuest) return true;
  if (!createdAt) return false;
  const createdAtMs = Date.parse(createdAt);
  return (
    Number.isFinite(createdAtMs) &&
    createdAtMs <= now &&
    now - createdAtMs < EARLY_USER_OBSERVATION_MS
  );
}

/** Coerce arbitrary captured data to a JSON-safe value (no casts, no throws). */
function toJson(v: unknown): Json {
  try {
    return v === undefined ? null : JSON.parse(JSON.stringify(v));
  } catch {
    return null;
  }
}

async function flush(): Promise<void> {
  flushScheduled = false;
  if (process.env.NODE_ENV !== "production") return;

  let isAuthenticated = false;
  let isGuest = false;
  let createdAt: string | null = null;
  try {
    const [
      { getStore },
      { selectIsAnonymous, selectIsAuthenticated, selectUserCreatedAt },
    ] = await Promise.all([
      import("@/lib/redux/store-singleton"),
      import("@/lib/redux/selectors/userSelectors"),
    ]);
    const store = getStore();
    const state = store?.getState();
    isAuthenticated = Boolean(state && selectIsAuthenticated(state));
    isGuest = Boolean(state && selectIsAnonymous(state));
    createdAt = state ? selectUserCreatedAt(state) : null;
  } catch {
    isAuthenticated = false;
  }

  const now = Date.now();
  let retryInMs: number | null = null;
  const pending: CapturedError[] = [];
  for (const entry of getSnapshot()) {
    if (
      !shouldPersistCapturedTier({
        tier: entry.tier,
        isGuest: !isAuthenticated || isGuest,
        createdAt,
        now,
      }) ||
      persistedIds.has(entry.id) ||
      // Never persist our own write failure — the capture proxy records a
      // failed log_client_error rpc with this relation; persisting it loops.
      entry.relation === "log_client_error"
    ) {
      continue;
    }

    const provisionalDelayMs = provisionalRecordUnavailableDelayMs(entry, now);
    if (provisionalDelayMs > 0) {
      retryInMs =
        retryInMs === null
          ? provisionalDelayMs
          : Math.min(retryInMs, provisionalDelayMs);
      continue;
    }
    pending.push(entry);
    if (pending.length === MAX_PER_FLUSH) break;
  }
  if (retryInMs !== null) scheduleFlush(retryInMs);
  if (pending.length === 0) return;

  const [{ supabase }, { getCachedFingerprint }] = await Promise.all([
    import("@/utils/supabase/client"),
    import("@/lib/services/fingerprint-service"),
  ]);
  const fingerprint = isAuthenticated ? null : getCachedFingerprint();
  if (!isAuthenticated && !fingerprint) return;
  for (const candidate of pending) {
    // Re-read after the async import. AccessGate may have reconciled this exact
    // capture while the flush was preparing; persistence must use the settled
    // tier and payload, never the stale provisional snapshot.
    const e = getSnapshot().find((entry) => entry.id === candidate.id);
    if (
      !e ||
      !shouldPersistCapturedTier({
        tier: e.tier,
        isGuest: !isAuthenticated || isGuest,
        createdAt,
        now: Date.now(),
      }) ||
      persistedIds.has(e.id) ||
      provisionalRecordUnavailableDelayMs(e, Date.now()) > 0
    ) {
      continue;
    }
    persistedIds.add(e.id); // mark before the await so a re-fire never double-sends
    try {
      const context = toJson({
          tier: e.tier,
          relation: e.relation,
          operation: e.operation,
          schema: e.schema,
          userMessage: e.userMessage,
          details: e.details,
          hint: e.hint,
          status: e.status,
          callSite: e.callSite,
          occurrences: e.count,
          url: e.url,
          name: e.name,
        });
      if (isAuthenticated) {
        await supabase.rpc("log_client_error", {
          p_source: e.source,
          p_message: e.message,
          p_code: e.code ?? undefined,
          p_route: e.route || undefined,
          p_request_id: e.requestId ?? undefined,
          p_conversation_id:
            e.conversationId && UUID_RE.test(e.conversationId)
              ? e.conversationId
              : undefined,
          p_stack: e.stack ?? e.callSite ?? undefined,
          p_payload: toJson(e.raw),
          p_context: context,
        });
      } else {
        await fetch("/api/diagnostics/client-error", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            fingerprint,
            source: e.source,
            message: e.message,
            code: e.code ?? null,
            route: e.route || null,
            request_id: e.requestId ?? null,
            stack: e.stack ?? e.callSite ?? null,
            payload: toJson(e.raw),
            context,
          }),
        });
      }
    } catch {
      /* persistence is best-effort — never break the app */
    }
  }
}

/**
 * Subscribe to the capture store and persist new red-tier errors (throttled,
 * deduped). Idempotent, browser-only. Safe to call from any client effect.
 */
export function installErrorPersistence(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  subscribe(() => {
    scheduleFlush(FLUSH_DELAY_MS);
  });
}
