// features/agents/redux/execution-system/instance-user-input/composer-draft.middleware.ts
//
// THE ONE WRITER of the durable composer draft. Read `composer-draft-store.ts`
// first — it carries the whole design and the resurrection hazard.
//
// This lives in the store's middleware chain rather than in a composer
// component on purpose: the composer's text is written by the textarea, the
// microphone, paste, chips, shortcut launchers and half a dozen thunks, all
// through the SAME `setUserInputText` action. Watching the action is the only
// place that sees every one of them, and it makes the guarantee a property of
// the platform's conversation state instead of a property of one component —
// every surface that mounts a composer inherits it for free.
//
// THE KNOB: `userPreferences.prompts.restoreUnsentDrafts`, default ON. Off
// means nothing is written at all (and `useComposerDraftRestore` restores
// nothing). A key absent from an older stored preferences blob reads as ON —
// the default must not depend on a backfill.

import type { Middleware } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import {
  clearUserInput,
  markInputPersisted,
  markInputSubmitted,
  removeInstanceUserInput,
  resetSubmissionPhase,
  setUserInputText,
} from "./instance-user-input.slice";
import { destroyInstance } from "../conversations/conversations.slice";
import {
  clearComposerDraft,
  markComposerDraftSent,
  writeComposerDraft,
} from "./composer-draft-store";

/** Same cadence as the dialog draft keeper (`lib/drafts/useTextDraft.ts`). */
const WRITE_DEBOUNCE_MS = 400;

const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** The latest text per conversation, so `pagehide` can flush without the store. */
const pending = new Map<string, string>();

function cancel(conversationId: string): void {
  const t = timers.get(conversationId);
  if (t) clearTimeout(t);
  timers.delete(conversationId);
  pending.delete(conversationId);
}

function flushAll(): void {
  for (const [conversationId, text] of pending) {
    const t = timers.get(conversationId);
    if (t) clearTimeout(t);
    writeComposerDraft(conversationId, text);
  }
  timers.clear();
  pending.clear();
}

let pagehideBound = false;
function bindPagehideFlush(): void {
  if (pagehideBound || typeof window === "undefined") return;
  pagehideBound = true;
  // The reload we could not see coming is exactly the case this exists for, so
  // the last keystroke is flushed rather than left in a pending debounce.
  window.addEventListener("pagehide", flushAll);
}

function scheduleWrite(conversationId: string, text: string): void {
  pending.set(conversationId, text);
  const existing = timers.get(conversationId);
  if (existing) clearTimeout(existing);
  timers.set(
    conversationId,
    setTimeout(() => {
      timers.delete(conversationId);
      const latest = pending.get(conversationId);
      pending.delete(conversationId);
      if (latest !== undefined) writeComposerDraft(conversationId, latest);
    }, WRITE_DEBOUNCE_MS),
  );
}

export function isDraftRestoreEnabled(state: RootState): boolean {
  // `!== false` and never `=== true`: a preferences blob persisted before this
  // key existed has no value for it, and the default is ON.
  return state.userPreferences?.prompts?.restoreUnsentDrafts !== false;
}

/**
 * Reconcile storage with the composer's text AFTER a clear-ish action ran.
 * The clear paths are conditional by design: `clearUserInput` and
 * `markInputPersisted` PRESERVE a live next-message draft (the sacred
 * invariant), and `resetSubmissionPhase` is the failed-send path that keeps the
 * text as typed. Reading the resulting state is the only honest way to know
 * which happened — anything else would drop a draft the slice just saved.
 */
function reconcile(conversationId: string, state: RootState): void {
  cancel(conversationId);
  const text =
    state.instanceUserInput.byConversationId[conversationId]?.text ?? "";
  if (text.length > 0) writeComposerDraft(conversationId, text);
  else clearComposerDraft(conversationId);
}

export const composerDraftMiddleware: Middleware<
  Record<string, never>,
  RootState
> = (api) => (next) => (action: unknown) => {
  const type =
    typeof action === "object" && action !== null && "type" in action
      ? (action as { type: unknown }).type
      : undefined;

  // Destroy paths run whether or not the knob is on — a stale record must never
  // outlive the conversation it belongs to.
  if (type === destroyInstance.type || type === removeInstanceUserInput.type) {
    const conversationId = (action as { payload: string }).payload;
    cancel(conversationId);
    clearComposerDraft(conversationId);
    return next(action);
  }

  if (!isDraftRestoreEnabled(api.getState())) return next(action);

  bindPagehideFlush();

  // CLEAR-BEFORE-SEND. Must land BEFORE the reducer and before the request, so
  // no queued write or peeked token from the old generation can resurrect the
  // message that is being sent right now.
  if (type === markInputSubmitted.type) {
    const { conversationId } = (
      action as { payload: { conversationId: string } }
    ).payload;
    cancel(conversationId);
    markComposerDraftSent(conversationId);
    return next(action);
  }

  const result = next(action);

  if (type === setUserInputText.type) {
    const { conversationId, text } = (
      action as { payload: { conversationId: string; text: string } }
    ).payload;
    scheduleWrite(conversationId, text);
    return result;
  }

  if (
    type === markInputPersisted.type ||
    type === clearUserInput.type ||
    type === resetSubmissionPhase.type
  ) {
    reconcile((action as { payload: string }).payload, api.getState());
  }

  return result;
};

/** Test seam ONLY — flushes pending debounces, as `pagehide` does. */
export function __flushComposerDraftWritesForTest(): void {
  flushAll();
}

/** Test seam ONLY — throws pending debounces away without writing them. */
export function __discardComposerDraftWritesForTest(): void {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  pending.clear();
}
