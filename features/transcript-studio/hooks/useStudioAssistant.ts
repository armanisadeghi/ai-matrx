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
  selectSessionById,
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
import { buildSessionResourceContextEntries } from "../service/sessionResourceContext";
import {
  fetchProject,
  selectProjectById,
} from "@/features/agent-context/redux/projectsSlice";
import {
  loadProjectTasks,
  selectTopLevelTasksByProjectId,
} from "@/features/agent-context/redux/tasksSlice";

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
  /**
   * Agent this surface mints a FRESH assistant conversation with when the
   * session has none yet. Lets a non-Scribe consumer (e.g. a War Room tile)
   * default to its own persona without affecting the standalone Scribe. Has no
   * effect once a session already has a conversation — the user switches agents
   * via the AssistantAgentBar after that.
   */
  defaultAgentId?: string;
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
  const defaultAgentId = options?.defaultAgentId;

  const conversationId = useAppSelector(
    selectAssistantConversationId(sessionId),
  );
  const workingDocument = useAppSelector(selectWorkingDocument(sessionId));
  const workingDocIdRef = useRef<string | null>(workingDocument?.id ?? null);
  if (workingDocument?.id) workingDocIdRef.current = workingDocument.id;

  // The project this session is attached to (if any). Drives the inline session
  // brief + deferred task list so the agent sees its project/tasks up front
  // instead of blind-querying the DB and guessing the right one.
  const projectId = useAppSelector((s: RootState) =>
    sessionId ? (selectSessionById(sessionId)(s)?.projectId ?? null) : null,
  );

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
      await dispatch(
        ensureAssistantConversationThunk({ sessionId, defaultAgentId }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, conversationId, defaultAgentId, dispatch]);

  // Hydrate the attached project + its tasks once per project, so the resource
  // context builder has them in Redux to assemble the brief. Idempotent —
  // fetchProject no-ops when the project is already fresh.
  useEffect(() => {
    if (!projectId) return;
    void dispatch(fetchProject(projectId));
    void dispatch(loadProjectTasks({ projectId }));
  }, [projectId, dispatch]);

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
  // Re-run the context rebuild when the attached project or its task set lands /
  // changes, so the inline brief reflects the latest project + tasks.
  const projectName = useAppSelector((s: RootState) =>
    projectId ? (selectProjectById(s, projectId)?.name ?? "") : "",
  );
  const projectTaskCount = useAppSelector((s: RootState) =>
    projectId ? selectTopLevelTasksByProjectId(s, projectId).length : 0,
  );

  useEffect(() => {
    if (!sessionId || !conversationId) return;
    const state = store.getState();
    const entries = buildAssistantContextEntries(
      state,
      sessionId,
      workingDocIdRef.current,
      [
        ...buildSessionResourceContextEntries(state, sessionId),
        ...(buildExtraEntries?.(state) ?? []),
      ],
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
    projectId,
    projectName,
    projectTaskCount,
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
      [
        ...buildSessionResourceContextEntries(state, sessionId),
        ...(buildExtraEntries?.(state) ?? []),
      ],
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
