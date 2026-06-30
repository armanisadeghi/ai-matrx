/**
 * reduxErrorCaptureMiddleware.ts
 *
 * Captures every RTK rejected thunk (action type ending in /rejected) that
 * represents a real failure into the systemwide Error Inspector. This was the
 * largest remaining gap: a rejected
 * mutation thunk would roll back + toast, but the structured failure (the thunk
 * name, the serialized error, the rejectWithValue payload) was invisible to
 * diagnostics.
 *
 * Scope guards — we do NOT capture non-failures:
 *   - `meta.aborted` (the request was cancelled / superseded)
 *   - `meta.condition` (the thunk's `condition` returned false — never ran)
 *   - AbortError / ConditionError by name
 *
 * `relation` is the thunk name (the action type minus `/rejected`) so an admin
 * can downgrade a whole slice or a single thunk by `relation` in
 * `errorTierRules.ts`. Defaults to ORANGE (these are typically handled by the
 * slice — rollback / error-state); promote a critical slice to red with a rule.
 *
 * Register once in `lib/redux/store.ts`. Never breaks the dispatch chain.
 */

import type { Middleware } from "@reduxjs/toolkit";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";

interface RejectedAction {
  type: string;
  error?: { name?: string; message?: string; code?: string; stack?: string };
  payload?: unknown;
  meta?: {
    aborted?: boolean;
    condition?: boolean;
    rejectedWithValue?: boolean;
    requestId?: string;
  };
}

function messageOf(a: RejectedAction): string {
  // Prefer a rejectWithValue payload (string or { message } / { error }).
  if (typeof a.payload === "string" && a.payload.trim()) return a.payload.trim();
  if (a.payload && typeof a.payload === "object") {
    const p = a.payload as Record<string, unknown>;
    if (typeof p.message === "string" && p.message.trim()) return p.message.trim();
    if (typeof p.error === "string" && p.error.trim()) return p.error.trim();
  }
  const m = a.error?.message?.trim();
  if (m && m.toLowerCase() !== "rejected") return m;
  return "Rejected thunk";
}

export const reduxErrorCaptureMiddleware: Middleware =
  () => (next) => (action) => {
    const result = next(action);
    const a = action as RejectedAction;
    try {
      if (typeof a?.type === "string" && a.type.endsWith("/rejected")) {
        // Not real failures — a superseded or never-run thunk.
        if (a.meta?.aborted || a.meta?.condition) return result;
        if (a.error?.name === "AbortError" || a.error?.name === "ConditionError") {
          return result;
        }
        captureError({
          source: "redux-rejected",
          relation: a.type.slice(0, -"/rejected".length),
          code: a.error?.code ?? a.error?.name,
          message: messageOf(a),
          name: a.error?.name,
          stack: a.error?.stack,
          raw: {
            type: a.type,
            payload: a.payload,
            error: a.error,
            requestId: a.meta?.requestId,
          },
        });
      }
    } catch {
      /* capture must never break the dispatch chain */
    }
    return result;
  };
