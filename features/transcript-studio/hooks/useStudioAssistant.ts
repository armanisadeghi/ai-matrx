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
import { executeInstance } from "@/features/agents/redux/execution-system/thunks/execute-instance.thunk";
import { setContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import type { StudioDocument } from "../types";
import {
  selectAssistantConversationId,
  selectCleanedSegments,
  selectRecordingSegmentCount,
  selectScribeCleanupDocument,
  selectWorkingDocument,
} from "../redux/selectors";
import { studioDocumentUpserted } from "../redux/slice";
import {
  ensureAssistantConversationThunk,
  ensureWorkingDocumentThunk,
} from "../redux/thunks";
import { buildAssistantContextEntries } from "../service/assistantContextBuilder";

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
): UseStudioAssistantReturn {
  const dispatch = useAppDispatch();
  const store = useAppStore();

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
  const cleanedCount = useAppSelector(
    (s) => selectCleanedSegments(sessionId)(s).length,
  );
  const cleanupContent = useAppSelector(
    (s) => selectScribeCleanupDocument(sessionId)(s)?.content ?? "",
  );
  const workingDocContent = workingDocument?.content ?? "";

  useEffect(() => {
    if (!sessionId || !conversationId) return;
    const entries = buildAssistantContextEntries(
      store.getState(),
      sessionId,
      workingDocIdRef.current,
    );
    dispatch(setContextEntries({ conversationId, entries }));
  }, [
    sessionId,
    conversationId,
    workingDocContent,
    recordingCount,
    cleanedCount,
    cleanupContent,
    dispatch,
    store,
  ]);

  const refreshContext = useCallback(() => {
    if (!sessionId || !conversationId) return;
    const entries = buildAssistantContextEntries(
      store.getState(),
      sessionId,
      workingDocIdRef.current,
    );
    dispatch(setContextEntries({ conversationId, entries }));
  }, [sessionId, conversationId, dispatch, store]);

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
