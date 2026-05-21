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
import { createManualInstance } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { executeInstance } from "@/features/agents/redux/execution-system/thunks/execute-instance.thunk";
import { setContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { setShowMicrophone } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import type { StudioDocument } from "../types";
import { AUDIO_ASSISTANT_AGENT_ID } from "../constants";
import {
  selectAssistantConversationId,
  selectWorkingDocument,
} from "../redux/selectors";
import {
  assistantConversationIdSet,
  studioDocumentUpserted,
} from "../redux/slice";
import { ensureWorkingDocumentThunk } from "../redux/thunks";
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

  // One-time setup per session: ensure the working document + a conversation
  // instance. Guarded against double-run in StrictMode by the slice values.
  const settingUpRef = useRef(false);
  useEffect(() => {
    if (!sessionId) return;
    if (conversationId) return;
    if (settingUpRef.current) return;
    settingUpRef.current = true;
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
      // A concurrent mount may have created the conversation already.
      const existing =
        store.getState().transcriptStudio.assistantConversationIdBySession[
          sessionId
        ];
      if (existing) {
        settingUpRef.current = false;
        return;
      }
      try {
        const newConversationId = await dispatch(
          createManualInstance({
            agentId: AUDIO_ASSISTANT_AGENT_ID,
            apiEndpointMode: "agent",
            sourceFeature: "transcript-studio",
            allowChat: true,
            autoRun: false,
            displayMode: "chat-assistant",
          }),
        ).unwrap();
        if (cancelled) return;
        dispatch(
          assistantConversationIdSet({
            sessionId,
            conversationId: newConversationId,
          }),
        );
        dispatch(
          setShowMicrophone({ conversationId: newConversationId, value: true }),
        );
      } finally {
        settingUpRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, conversationId, dispatch, store]);

  // Keep the in-Redux working_document context value fresh after each realtime
  // patch so the next turn ships the latest content (not a stale snapshot).
  useEffect(() => {
    if (!sessionId || !conversationId || !workingDocument) return;
    const entries = buildAssistantContextEntries(
      store.getState(),
      sessionId,
      workingDocIdRef.current,
    );
    dispatch(setContextEntries({ conversationId, entries }));
  }, [sessionId, conversationId, workingDocument, dispatch, store]);

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
