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

import { subscribe, getSnapshot } from "@/lib/diagnostics/errorCaptureStore";
import type { Json } from "@/types/database.types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FLUSH_DELAY_MS = 1500;
const MAX_PER_FLUSH = 20;

let installed = false;
let flushScheduled = false;
const persistedIds = new Set<string>();

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

  const pending = getSnapshot()
    .filter(
      (e) =>
        e.tier === "red" &&
        !persistedIds.has(e.id) &&
        // Never persist our own write failure — the capture proxy records a
        // failed log_client_error rpc with this relation; persisting it loops.
        e.relation !== "log_client_error",
    )
    .slice(0, MAX_PER_FLUSH);
  if (pending.length === 0) return;

  const { supabase } = await import("@/utils/supabase/client");
  for (const e of pending) {
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
    if (flushScheduled) return;
    flushScheduled = true;
    setTimeout(() => {
      void flush();
    }, FLUSH_DELAY_MS);
  });
}
