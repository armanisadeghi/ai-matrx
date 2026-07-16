/**
 * components/dialogs/scope-mismatch/scopeMismatchOpener.ts
 *
 * Pure-TS imperative API for the global chat↔scope mismatch dialog — the
 * 3-way "ask on mismatch" pre-send gate (see
 * features/scopes/utils/scopeMismatch.ts for the decision logic). Zero
 * React, zero dialog markup; statically importable from thunks, hooks,
 * and async handlers.
 *
 * Same host/queue contract as `confirm` (confirm/confirmDialogOpener.ts)
 * and `promptForValues` (value-prompts/valuePromptsOpener.ts): the host
 * registers on mount; calls made before hydration queue and resolve once
 * the host is alive. One dialog at a time; concurrent calls queue.
 */

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

type Resolver = (choice: ScopeMismatchChoice) => void;

interface PendingRequest {
  req: ScopeMismatchRequest;
  resolve: Resolver;
}

interface HostController {
  show: (req: ScopeMismatchRequest, resolve: Resolver) => void;
}

let host: HostController | null = null;
const queue: PendingRequest[] = [];

/** @internal Called by `ScopeMismatchDialogHostImpl` on mount. */
export function _registerHost(controller: HostController): void {
  host = controller;
  while (queue.length > 0) {
    const next = queue.shift()!;
    controller.show(next.req, next.resolve);
  }
}

/** @internal Called by `ScopeMismatchDialogHostImpl` on unmount. */
export function _unregisterHost(controller: HostController): void {
  if (host === controller) host = null;
}

/**
 * Imperative 3-way mismatch prompt. Resolves with the user's choice:
 * `"update"` (use current selection), `"combine"` (union both),
 * `"keep"` (keep the chat's context), or `"cancel"` on dismiss —
 * a cancel aborts the send entirely (composer text stays intact).
 */
export function promptScopeMismatch(
  req: ScopeMismatchRequest,
): Promise<ScopeMismatchChoice> {
  return new Promise<ScopeMismatchChoice>((resolve) => {
    if (host) {
      host.show(req, resolve);
    } else {
      queue.push({ req, resolve });
    }
  });
}
