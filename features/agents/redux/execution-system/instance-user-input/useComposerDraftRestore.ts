"use client";

// features/agents/redux/execution-system/instance-user-input/useComposerDraftRestore.ts
//
// The composer's half of the durable draft. Mounted once by `AgentTextarea`, so
// every surface that mounts the shared composer gets the restore.
//
// A SILENT RESTORE IS ITS OWN KIND OF LIE (the rule `lib/drafts/useTextDraft.ts`
// was written under): text the user did not just type appearing in their box
// with no explanation is indistinguishable from a bug. So this reports it and
// the composer says one quiet line. The same applies to the failure: when the
// browser refuses storage, the composer says drafts are not being kept rather
// than pretending they are.

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  isComposerDraftStorageAvailable,
  peekComposerDraft,
  registerComposerDraftAlias,
  releaseComposerDraftAlias,
} from "./composer-draft-store";
import { applyComposerDraft } from "./restore-composer-draft.thunk";
import {
  flushComposerDraftWrite,
  isDraftRestoreEnabled,
} from "./composer-draft.middleware";
import { selectUserInputText } from "./instance-user-input.selectors";

export type ComposerDraftRestoreState = {
  /** A draft was put back just now — say so on screen. */
  restored: boolean;
  /** How much was put back, so the line can be specific. */
  restoredChars: number;
  /** False when the browser refuses storage: the composer must say drafts are off. */
  storageAvailable: boolean;
  /** The knob (`userPreferences.prompts.restoreUnsentDrafts`). */
  enabled: boolean;
  /** Dismiss the notice without touching the text. */
  acknowledge: () => void;
};

/**
 * @param alias the surface's stable key (the composer passes its `surfaceKey`).
 *   It keeps the draft findable in a room that mints a fresh client-only
 *   conversation id on every mount — `/chat/new`, the Scout interview room, the
 *   Conductor. It is used ONLY while the conversation has no messages, and is
 *   RELEASED at the first turn, because a surface key is not unique per
 *   conversation. See `composer-draft-store.ts` § TWO KEYS.
 */
export function useComposerDraftRestore(
  conversationId: string,
  alias?: string,
): ComposerDraftRestoreState {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const text = useAppSelector(selectUserInputText(conversationId));
  // THE HANDOFF LINE. No messages = the id is client-only and will be re-minted
  // on reload, so the surface alias is the only findable key. With messages the
  // conversation is real and its own id is the only correct key.
  // Read inline rather than through `selectMessageCount`: that selectors module
  // pulls the whole content-ir kind registry (and with it the Supabase client)
  // for one array length, which has no business in the composer's draft keeper.
  // It returns a primitive, so there is no reference churn.
  const hasMessages = useAppSelector(
    (state) =>
      (state.messages.byConversationId[conversationId]?.orderedIds?.length ??
        0) > 0,
  );
  const liveAlias = hasMessages ? undefined : alias;

  const [restoredValue, setRestoredValue] = useState<string | null>(null);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const attemptedRef = useRef<string | null>(null);

  const enabled = isDraftRestoreEnabled(store.getState());

  // Defined BEFORE the alias effect ON PURPOSE: React runs cleanups in
  // definition order, so an unmount flushes the pending keystroke while the
  // alias is still registered. The other way round, a draft typed in the last
  // 400ms before the composer went away would land under the conversation key
  // only — and that key is the one a re-minted room will never ask for again.
  useEffect(() => {
    return () => flushComposerDraftWrite(conversationId);
  }, [conversationId]);

  // Registered BEFORE the first keystroke so every write is mirrored to it,
  // and released the moment the conversation becomes real.
  useEffect(() => {
    if (!liveAlias) return undefined;
    registerComposerDraftAlias(conversationId, liveAlias);
    return () => releaseComposerDraftAlias(conversationId);
  }, [conversationId, liveAlias]);

  useEffect(() => {
    // Once per conversation id per mount. A second pass could only re-restore
    // something the user has since deleted on purpose.
    if (attemptedRef.current === conversationId) return;
    attemptedRef.current = conversationId;
    setRestoredValue(null);
    setStorageAvailable(isComposerDraftStorageAvailable());
    if (!enabled) return;
    const token = peekComposerDraft(conversationId, liveAlias);
    if (!token) return;
    // Compare-and-apply — the thunk refuses the token if a send, another tab or
    // a destroy moved underneath it. See restore-composer-draft.thunk.ts.
    if (dispatch(applyComposerDraft(token)) === "restored") {
      setRestoredValue(token.value);
    }
  }, [conversationId, liveAlias, dispatch, enabled]);

  // The notice belongs to the restored text and nothing else: the moment the
  // person edits it, it has stopped being news.
  useEffect(() => {
    if (restoredValue !== null && text !== restoredValue) setRestoredValue(null);
  }, [text, restoredValue]);

  const acknowledge = useCallback(() => setRestoredValue(null), []);

  return {
    restored: restoredValue !== null,
    restoredChars: restoredValue?.length ?? 0,
    storageAvailable,
    enabled,
    acknowledge,
  };
}
