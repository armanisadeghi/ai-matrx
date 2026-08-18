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
 *   - RED tier only (clear errors; orange/yellow stay client-only).
 *   - Deduped: each distinct captured entry is persisted at most once per session.
 *   - Throttled: debounced flush, capped per flush.
 *   - Production only: dev/local errors never pollute the prod dashboard.
 *   - Authenticated only: attributed errors; anon/public-page noise stays out.
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

  // Authenticated-only — attribute to a real user; keep anon/public noise out.
  try {
    const [{ getStore }, { selectIsAuthenticated }] = await Promise.all([
      import("@/lib/redux/store-singleton"),
      import("@/lib/redux/selectors/userSelectors"),
    ]);
    const store = getStore();
    if (!store || !selectIsAuthenticated(store.getState())) return;
  } catch {
    return;
  }

  const now = Date.now();
  let retryInMs: number | null = null;
  const pending: CapturedError[] = [];
  for (const entry of getSnapshot()) {
    if (
      entry.tier !== "red" ||
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

  const { supabase } = await import("@/utils/supabase/client");
  for (const candidate of pending) {
    // Re-read after the async import. AccessGate may have reconciled this exact
    // capture while the flush was preparing; persistence must use the settled
    // tier and payload, never the stale provisional snapshot.
    const e = getSnapshot().find((entry) => entry.id === candidate.id);
    if (
      !e ||
      e.tier !== "red" ||
      persistedIds.has(e.id) ||
      provisionalRecordUnavailableDelayMs(e, Date.now()) > 0
    ) {
      continue;
    }
    persistedIds.add(e.id); // mark before the await so a re-fire never double-sends
    try {
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
        p_context: toJson({
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
        }),
      });
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
