"use client";

/**
 * useStudioAssistant
 *
 * Wires a session to the audio-first assistant conversation:
 *   - Ensures the session's working document exists (studio_documents).
 *   - Creates one assistant conversation instance per session (kept in the
 *     studio slice so it survives screen swaps).
 *   - Rebuilds the named context objects (recording_NN_raw / session_cleaned /
 *     working_document) before every turn so new recordings + cleanups + the
 *     latest document content reach the agent.
 *   - Sends a turn (typed or spoken-then-transcribed) via executeInstance.
 *
 * The assistant edits the working_document server-side via ctx_patch; those
 * writes land in studio_documents and arrive back through realtime, so this
 * hook doesn't apply the agent's edits itself.
 */

import { useCallback, useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { executeInstance } from "@/features/agents/redux/execution-system/thunks/execute-instance.thunk";
import { setContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { selectPrimaryRequest } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import type { StudioDocument } from "../types";
import {
  selectAssistantConversationId,
  selectRecordingSegmentCount,
  selectSessionCleanedText,
  selectWorkingDocument,
} from "../redux/selectors";
import { studioDocumentUpserted } from "../redux/slice";
import { persistAssistantConversationThunk } from "../redux/assistantAgent.thunk";
import {
  ensureAssistantConversationThunk,
  ensureWorkingDocumentThunk,
} from "../redux/thunks";
import {
  buildAssistantContextEntries,
  type AssistantContextEntry,
} from "../service/assistantContextBuilder";

/**
 * Optional extras for non-Scribe consumers (e.g. the War Room tile Agent+
 * panel). `buildExtraEntries` is called against fresh `store.getState()` every
 * time the context is rebuilt, so the extras always reflect current Redux — and
 * it is appended to the studio entries, never replacing them. Scribe omits this
 * entirely, so its context is unchanged.
 */
export interface UseStudioAssistantOptions {
  /** Stable (memoized) builder for extra context entries. Keep it referentially
   *  stable — it's a dependency of the context-refresh effect. */
  buildExtraEntries?: (state: RootState) => AssistantContextEntry[];
}

interface UseStudioAssistantReturn {
  conversationId: string | null;
  workingDocument: StudioDocument | null;
  /** Rebuild + push the named context objects for the current state. */
  refreshContext: () => void;
  /** Send a turn. Optionally set the user input first (e.g. spoken text). */
  send: (text?: string) => Promise<void>;
  ready: boolean;
}

export function useStudioAssistant(
  sessionId: string | null,
  options?: UseStudioAssistantOptions,
): UseStudioAssistantReturn {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const buildExtraEntries = options?.buildExtraEntries;

  const conversationId = useAppSelector(
    selectAssistantConversationId(sessionId),
  );
  const workingDocument = useAppSelector(selectWorkingDocument(sessionId));
  const workingDocIdRef = useRef<string | null>(workingDocument?.id ?? null);
  if (workingDocument?.id) workingDocIdRef.current = workingDocument.id;

  // One-time setup per session: ensure the working document, then resolve the
  // durable assistant conversation (reuse the persisted id + rehydrate history,
  // or mint + persist a new one). The ensure thunk is itself de-duplicated by
  // sessionId, so the two mounts of this hook (ScribeScreen + AssistantScreen)
  // can never create two conversations.
  useEffect(() => {
    if (!sessionId) return;
    if (conversationId) return;
    let cancelled = false;
    void (async () => {
      try {
        const doc = await dispatch(
          ensureWorkingDocumentThunk({ sessionId }),
        ).unwrap();
        if (!cancelled && doc) workingDocIdRef.current = doc.id;
      } catch {
        // Non-fatal — the assistant can still chat without a doc id; the
        // working_document context object is simply omitted until it lands.
      }
      if (cancelled) return;
      await dispatch(ensureAssistantConversationThunk({ sessionId }));
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, conversationId, dispatch]);

  // Keep the in-Redux named context objects fresh whenever the underlying
  // studio data changes — realtime working-document patches, new recordings,
  // or a cleanup run. The standard chat input (SmartAgentInput → smartExecute)
  // does NOT call refreshContext on submit, so the only way a typed turn ships
  // current content is by having it already pushed into the instance context
  // here. (The strip's spoken/review sends still go through `send`, which also
  // refreshes — this just covers the typed-input path.)
  const recordingCount = useAppSelector(selectRecordingSegmentCount(sessionId));
  // Cleaned text (not just count) so re-cleans — which keep the row count
  // steady — still refresh the context.
  const cleanedText = useAppSelector(selectSessionCleanedText(sessionId));
  const workingDocContent = workingDocument?.content ?? "";

  useEffect(() => {
    if (!sessionId || !conversationId) return;
    const state = store.getState();
    const entries = buildAssistantContextEntries(
      state,
      sessionId,
      workingDocIdRef.current,
      buildExtraEntries?.(state) ?? [],
    );
    // NEVER clobber good context with an empty set. A transient build (doc not
    // yet loaded, etc.) returning [] would otherwise wipe the conversation's
    // context dict, so the very next turn ships with no `context` key and the
    // server returns "No context objects are available" (the intermittent BUG).
    // Skipping the empty push is safe: working_document is always present once
    // the doc id is known, so legitimately-empty never happens post-ensure.
    if (entries.length > 0) {
      dispatch(setContextEntries({ conversationId, entries }));
    }
  }, [
    sessionId,
    conversationId,
    workingDocContent,
    recordingCount,
    cleanedText,
    buildExtraEntries,
    dispatch,
    store,
  ]);

  // Persist the conversation to the session row ONLY once the server confirms
  // the turn (the request reaches "streaming" → the cx_conversation row now
  // exists). Minting writes only Redux (optimistic); saving the client-minted
  // placeholder id before the server creates the row is what made conversations
  // "disappear" (loadConversation 406s on 0 rows). Idempotent, once per
  // conversation.
  const requestStatus = useAppSelector((s) =>
    conversationId ? selectPrimaryRequest(conversationId)(s)?.status : undefined,
  );
  const persistedConvRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!sessionId || !conversationId) return;
    if (persistedConvRef.current.has(conversationId)) return;
    const serverConfirmed =
      requestStatus === "streaming" ||
      requestStatus === "awaiting-tools" ||
      requestStatus === "complete";
    if (!serverConfirmed) return;
    persistedConvRef.current.add(conversationId);
    void dispatch(
      persistAssistantConversationThunk({ sessionId, conversationId }),
    );
  }, [sessionId, conversationId, requestStatus, dispatch]);

  const refreshContext = useCallback(() => {
    if (!sessionId || !conversationId) return;
    const state = store.getState();
    const entries = buildAssistantContextEntries(
      state,
      sessionId,
      workingDocIdRef.current,
      buildExtraEntries?.(state) ?? [],
    );
    if (entries.length > 0) {
      dispatch(setContextEntries({ conversationId, entries }));
    }
  }, [sessionId, conversationId, buildExtraEntries, dispatch, store]);

  const send = useCallback(
    async (text?: string) => {
      if (!conversationId) return;
      if (text != null && text.trim()) {
        dispatch(setUserInputText({ conversationId, text }));
      }
      refreshContext();
      await dispatch(executeInstance({ conversationId }));
    },
    [conversationId, dispatch, refreshContext],
  );

  return {
    conversationId: conversationId ?? null,
    workingDocument: workingDocument ?? null,
    refreshContext,
    send,
    ready: Boolean(conversationId),
  };
}

// Re-export so screens can keep the document fresh from realtime if they need
// to nudge a manual upsert (rare — realtime handles the common case).
export { studioDocumentUpserted };
