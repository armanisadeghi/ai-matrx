/**
 * THE SESSION-READY SIGNAL for the content-ir registries (DD-215b → DD-237).
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
 * WHAT THIS IS NOW. When this module was written it said: *"There is no shared
 * session-ready primitive in the app today … When DD-237 ships a real barrier,
 * this module is the ONE place that has to point at it."* DD-237 shipped, and
 * this is that pointer. The signal, the tri-state and the one-shot drain all
 * live in `utils/supabase/sessionBarrier.ts` — bound to the browser client at
 * construction, where it also makes every authenticated read in the app wait
 * for the session and retries a refused one. There is exactly ONE auth
 * subscription per tab again, and this file is the content-ir name for it.
 *
 * The exported API is unchanged on purpose: `component-registry.ts`,
 * `kindComponentIncident.ts` and the DD-215b tests keep their seam.
 */

import {
  announceSessionForTests as announceBarrierSessionForTests,
  hasAttachedSession,
  resetSessionBarrierForTests,
  whenSessionAttached,
} from "@/utils/supabase/sessionBarrier";

/**
 * The barrier binds itself when the browser client is constructed, so touching
 * the client is what arms the signal. This module's callers may ask before any
 * other code has imported it (the registry cluster keeps a zero static import
 * edge into Supabase — the same reason every loader here reaches for it through
 * `await import`), so keep the lazy, once-per-tab touch the original had.
 */
let armed = false;
function ensureArmed(): void {
  if (armed || typeof window === "undefined") return;
  armed = true;
  void import("@/utils/supabase/client").catch(() => {
    // No client, no signal. Callers treat that as "never ready" and keep their
    // existing behaviour — this module can only ever ADD a retry.
    armed = false;
  });
}

/**
 * True once auth has told us a session exists. `false` also covers "we have
 * not heard yet" — callers must treat it as "not proven", never as "signed
 * out", which is why {@link whenSessionReady} exists.
 */
export function hasSession(): boolean {
  ensureArmed();
  return hasAttachedSession();
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
  ensureArmed();
  return whenSessionAttached(listener);
}

/** Test seam — forget the subscription and every waiter. */
export function resetSessionReadyForTests(present: boolean | null = null): void {
  armed = false;
  resetSessionBarrierForTests();
  if (present !== null) announceBarrierSessionForTests(present);
}

/** Test seam — drive the signal without a Supabase client. */
export function announceSessionForTests(present: boolean): void {
  announceBarrierSessionForTests(present);
}
