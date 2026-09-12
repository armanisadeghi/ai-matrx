/**
 * components/dialogs/scope-mismatch/scopeMismatchOpener.ts
 *
 * Pure-TS imperative API for the global chat↔scope mismatch dialog — the
 * 3-way "ask on mismatch" pre-send gate (decision logic lives in
 * `features/scopes/utils/scopeMismatch.ts`). Zero React, zero dialog markup;
 * statically importable from thunks, hooks and async handlers.
 *
 * THE MACHINERY IS NOT OURS. The host registry, the request queue, the
 * pre-hydration queueing and the never-a-silent-default promise come from
 * `@ai-matrx/kit/opener` — the same engine behind `confirm()`. This file used
 * to hand-roll them in module-level state, which silently splits host
 * registration from its callers across loader graphs. Never re-implement it
 * here.
 */

import { createOpener } from "@ai-matrx/kit/opener";

import type {
  ScopeMismatchChoice,
  ScopeMismatchDisplayItem,
} from "@/features/scopes/utils/scopeMismatch";

export interface ScopeMismatchRequest {
  /** The user's current active (sidebar) selection, resolved to names. */
  current: ScopeMismatchDisplayItem[];
  /** The chat's durable scope tags, resolved to names. */
  chat: ScopeMismatchDisplayItem[];
}

export const scopeMismatchOpener = createOpener<
  ScopeMismatchRequest,
  ScopeMismatchChoice
>("matrx-frontend.scope-mismatch-opener-state", {
  hostHint: "<ScopeMismatchDialogHost /> (mounted once in app/Providers.tsx)",
});

/**
 * Imperative 3-way mismatch prompt. Resolves with the user's choice:
 * `"update"` (use current selection), `"combine"` (union both),
 * `"keep"` (keep the chat's context), or `"cancel"` on dismiss —
 * a cancel aborts the send entirely (composer text stays intact).
 */
export function promptScopeMismatch(
  req: ScopeMismatchRequest,
): Promise<ScopeMismatchChoice> {
  return scopeMismatchOpener.open(req);
}
