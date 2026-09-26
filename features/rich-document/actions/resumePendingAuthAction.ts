// features/rich-document/actions/resumePendingAuthAction.ts
//
// Post-auth resume. When a signed-out reader picks an auth-gated action,
// `requireAuth` (./utils.ts) stashes `{ action: <registry id>, savedContent }`
// and opens the auth gate. After sign-in, the next menu host for the SAME
// content replays that action — through the registry handler itself, so the
// resumed action is byte-for-byte the action the reader picked (the chat menu
// used to keep a second, drifting copy of eleven of them here).

import { getAction } from "./provider";
import { PENDING_ACTION_KEY } from "./utils";
import type { RichDocumentActionContext } from "../types";

/** Replay a stashed action when the context's content matches. Never throws. */
export function resumePendingAuthAction(ctx: RichDocumentActionContext): void {
  if (!ctx.isAuthenticated) return;
  let pending: { action?: unknown; savedContent?: unknown } | null = null;
  try {
    const raw = sessionStorage.getItem(PENDING_ACTION_KEY);
    if (!raw) return;
    pending = JSON.parse(raw) as { action?: unknown; savedContent?: unknown };
  } catch {
    return;
  }
  if (!pending || pending.savedContent !== ctx.content) return;
  try {
    sessionStorage.removeItem(PENDING_ACTION_KEY);
  } catch {
    /* ignore */
  }
  const action =
    typeof pending.action === "string" ? getAction(pending.action) : undefined;
  if (!action) {
    console.error(
      `[RichDocument] post-auth resume: no registered action "${String(pending.action)}" — the pending request was dropped.`,
    );
    return;
  }
  void Promise.resolve(action.run(ctx)).catch((err: unknown) => {
    console.error(`[RichDocument] post-auth resume of ${action.id} threw`, err);
  });
}
