/**
 * THE SESSION-READY SIGNAL for the content-ir registries (DD-215b).
 *
 * WHY THIS EXISTS. The registries' reads (`content_ir.kind_component`,
 * `content_ir.kind_definition`) are SIGNED-IN doors: `anon` holds no grant on
 * either table, so a read issued before the Supabase session is attached comes
 * back `42501 permission denied` — a REFUSAL, not an empty list. Observed on
 * production 2026-09-14 (`ops.system_error`, `source_app='matrx-frontend'`,
 * `user_id IS NULL`):
 *
 *   permission denied for table kind_component
 *   component-resolver refresh failed …: readAllRows(content_ir.kind_component
 *     metadata): query failed — permission denied for table kind_component
 *   kind-registry warm load failed …: permission denied for table kind_definition
 *
 * When that happened the component resolver was left holding only the compiled
 * floor, nothing retried the refused read, and the reader silently got the
 * platform's component instead of their organization's — the DD-215b symptom.
 *
 * WHAT THIS IS NOT. The boot race itself (client reads racing the session) is
 * DD-237 and belongs to the client's session layer, not here. This module is
 * the narrow half content-ir can own honestly: *tell me when a session exists,
 * so a refused read can be retried instead of standing as a verdict.*
 *
 * There is no shared session-ready primitive in the app today — `AuthSessionWatcher`
 * is a component, not a signal — so this subscribes to the one source of truth
 * (`supabase.auth.onAuthStateChange`) exactly once per tab. When DD-237 ships a
 * real barrier, this module is the ONE place that has to point at it.
 */

/** Listeners waiting for a session to exist. Drained once, then dropped. */
const waiting = new Set<() => void>();

let subscribed = false;
/** Tri-state on purpose: `null` = we have not heard from auth yet. */
let sessionPresent: boolean | null = null;

function drain(): void {
  if (waiting.size === 0) return;
  const pending = [...waiting];
  waiting.clear();
  for (const listener of pending) {
    try {
      listener();
    } catch {
      /* one bad listener must never stop the others */
    }
  }
}

/**
 * Subscribe once per tab. Lazy + dynamic so the registry cluster keeps its
 * zero static import edge into the Supabase client (the same reason every
 * loader in this folder reaches for it through `await import`).
 */
function ensureSubscribed(): void {
  if (subscribed || typeof window === "undefined") return;
  subscribed = true;
  void (async () => {
    try {
      const { supabase } = await import("@/utils/supabase/client");
      // `INITIAL_SESSION` fires immediately with whatever the client already
      // holds, so a session that attached before this call still reaches us.
      supabase.auth.onAuthStateChange((_event, session) => {
        const had = sessionPresent;
        sessionPresent = Boolean(session);
        if (sessionPresent && had !== true) drain();
      });
    } catch {
      // No client, no signal. Callers treat that as "never ready" and keep
      // their existing behaviour — this module can only ever ADD a retry.
      subscribed = false;
    }
  })();
}

/**
 * True once auth has told us a session exists. `false` also covers "we have
 * not heard yet" — callers must treat it as "not proven", never as "signed
 * out", which is why {@link whenSessionReady} exists.
 */
export function hasSession(): boolean {
  ensureSubscribed();
  return sessionPresent === true;
}

/**
 * Run `listener` once, as soon as a session exists — immediately if auth has
 * already told us one does. Returns an unsubscribe for the not-yet case.
 *
 * Deliberately one-shot: this is the "retry the refused read" seam, and a
 * listener that re-fired on every token refresh would turn one refusal into a
 * standing poll.
 */
export function whenSessionReady(listener: () => void): () => void {
  ensureSubscribed();
  if (sessionPresent === true) {
    try {
      listener();
    } catch {
      /* never throw into a caller's catch block */
    }
    return () => {};
  }
  waiting.add(listener);
  return () => {
    waiting.delete(listener);
  };
}

/** Test seam — forget the subscription and every waiter. */
export function resetSessionReadyForTests(present: boolean | null = null): void {
  waiting.clear();
  subscribed = false;
  sessionPresent = present;
}

/** Test seam — drive the signal without a Supabase client. */
export function announceSessionForTests(present: boolean): void {
  const had = sessionPresent;
  sessionPresent = present;
  if (present && had !== true) drain();
}
