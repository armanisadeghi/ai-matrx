"use client";

// features/agents/hooks/useConversationResume.ts
//
// THE one way any surface reopens an EXISTING conversation.
//
// `useAgentLauncher` mints a conversation — it is how a surface STARTS one.
// Continuing one the user already had is a different job with its own
// hard-won sequence, and it used to live inline inside `ChatRoomClient`, which
// meant every other surface that wanted to resume (the Masterwork Scout
// interview, a War Room thread, any future "pick up where you left off" door)
// either re-rolled it wrong or minted a NEW conversation and silently orphaned
// the old one. That orphaning is exactly the defect Arman hit on 2026-08-17:
// he had dictated 37k characters into a Scout interview and there was no way
// back to it.
//
// The sequence this owns, in order, because each step exists for a bug:
//   1. Already live in memory WITH messages → do NOT re-fetch. A URL promotion
//      right after the first submit has an in-flight stream in Redux, and
//      `loadConversation` would clobber it ("the stream is missed" bug). Just
//      re-point surface focus.
//   2. No instance yet → `createManualInstance` under the SAME id so the
//      surface never re-keys.
//   3. `loadConversation` — one RPC bundle: conversation row, messages,
//      variables, overrides, display/context, observability.
//   4. `surfaceColdPendingCalls` — a client-delegated tool prompt the user
//      never answered (closed the tab mid-prompt) is re-surfaced so the run
//      can actually resume.
//   5. `reconnectServerOperation` — the server may STILL be working on the
//      last turn (streams detach on disconnect); ask /runtime for truth and
//      follow it to terminal.
//
// Steps 4 and 5 are why "just call loadConversation" is not resuming. They are
// table stakes, not features — see
// common-docs/policies/table-stakes-are-never-a-question.md.

import { useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { createManualInstance } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import { surfaceColdPendingCalls } from "@/features/agents/redux/execution-system/thunks/surface-cold-pending-calls.thunk";
import { reconnectServerOperation } from "@/features/agents/runtime-reconnect/reconnect-server-operation.thunk";
import { setFocus } from "@/features/agents/redux/execution-system/conversation-focus/conversation-focus.slice";
import { patchConversation } from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import type { ConversationSandboxBinding } from "@/lib/sandbox/conversation-binding-row";

export interface UseConversationResumeOptions {
  /** The conversation to reopen. `null` disables the hook entirely. */
  conversationId: string | null;
  /** The agent that owns it — needed to build the instance when it is cold. */
  agentId: string | null;
  /** Surface key that should end up focused on this conversation. */
  surfaceKey: string;
  /**
   * Gate. The hook does nothing until this is true — callers pass their auth /
   * initialisation readiness so a resume never races a half-built store.
   */
  enabled?: boolean;
  /** How many recent messages to hydrate. RPC clamps to [1, 200]. */
  messageLimit?: number;
  /** Fires once the hydrate settles (success or failure). */
  onSettled?: (ok: boolean) => void;
  /**
   * The conversation's compute binding as the SERVER already knows it, read at
   * SSR straight off `chat.conversation` (`sandbox_instance_id` /
   * `app_instance_id`). Applied to the record the moment the instance exists —
   * BEFORE the bundle RPC — so a chat that was on a sandbox comes back up on
   * that sandbox instead of appearing unbound (or, worse, appearing to be on
   * the user's shared default) for the first seconds of the session.
   *
   * The bundle re-derives the same value from the same columns through the same
   * function, so this is an earlier read of one truth, never a second one.
   */
  sandboxSeed?: ConversationSandboxBinding | null;
}

export interface UseConversationResumeResult {
  /** True while a genuinely cold conversation is being hydrated. */
  isResuming: boolean;
  /** Structured failure from the hydrate, or null. */
  error: string | null;
}

export function useConversationResume({
  conversationId,
  agentId,
  surfaceKey,
  enabled = true,
  messageLimit = 12,
  onSettled,
  sandboxSeed = null,
}: UseConversationResumeOptions): UseConversationResumeResult {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  // Starts TRUE whenever there is something to resume — before `enabled` flips,
  // the surface must show its skeleton, never an empty room that then fills in.
  const [isResuming, setIsResuming] = useState(() => conversationId != null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const loadedKeyRef = useRef<string | null>(null);
  const onSettledRef = useRef(onSettled);
  // Held in refs, NEVER in the dependency array: a fresh identity every render
  // would re-run the resume effect, and that effect's cleanup aborts the load in
  // flight — the room would sit on its skeleton forever. Written in an effect
  // (never during render) so React's ref rule holds; this effect is declared
  // ABOVE the resume effect, so both refs are current before it runs.
  const sandboxSeedRef = useRef(sandboxSeed);
  useEffect(() => {
    onSettledRef.current = onSettled;
    sandboxSeedRef.current = sandboxSeed;
  }, [onSettled, sandboxSeed]);

  useEffect(() => {
    if (!enabled || !conversationId || !agentId) return undefined;
    if (loadedKeyRef.current === conversationId) return undefined;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    loadedKeyRef.current = conversationId;
    setError(null);
    setIsResuming(true);

    void (async () => {
      try {
        const state = store.getState();
        const exists = !!state.conversations?.byConversationId?.[conversationId];
        const liveMessageCount =
          state.messages?.byConversationId?.[conversationId]?.orderedIds
            ?.length ?? 0;

        // The server's binding, applied as early as the record allows.
        const applySandboxSeed = () => {
          const seed = sandboxSeedRef.current;
          if (!seed) return;
          const record =
            store.getState().conversations?.byConversationId?.[conversationId];
          if (!record || record.sandboxBinding?.rowId === seed.rowId) {
            return;
          }
          dispatch(
            patchConversation({
              conversationId,
              sandboxBinding: seed,
              // It came FROM the row, so it is by definition already written.
              sandboxBindingPersisted: true,
            }),
          );
        };

        // (1) Live in memory with messages — a re-fetch would clobber an
        // in-flight stream. Re-point focus and stop.
        if (exists && liveMessageCount > 0) {
          applySandboxSeed();
          setIsResuming(false);
          if (ctrl.signal.aborted) return;
          dispatch(setFocus({ surfaceKey, conversationId }));
          onSettledRef.current?.(true);
          return;
        }

        // (2) Cold — build the instance under the SAME id.
        if (ctrl.signal.aborted) return;
        if (!exists) {
          await dispatch(
            createManualInstance({
              agentId,
              conversationId,
              apiEndpointMode: "agent",
              responseDensity: "compact",
            }),
          ).unwrap();
        }
        applySandboxSeed();

        // (3) Hydrate everything from the DB.
        if (ctrl.signal.aborted) return;
        await dispatch(
          loadConversation({
            conversationId,
            surfaceKey,
            messageLimit,
            signal: ctrl.signal,
          }),
        ).unwrap();
        if (ctrl.signal.aborted) return;
        setIsResuming(false);

        // (4) + (5) Fire-and-forget resume of anything still in flight.
        void dispatch(surfaceColdPendingCalls(conversationId));
        void dispatch(
          reconnectServerOperation({ conversationId, source: "cold-load" }),
        );
        onSettledRef.current?.(true);
      } catch (err) {
        if (ctrl.signal.aborted) return;
        setIsResuming(false);
        // Loud: a resume that fails silently is how a user loses their words.
        console.error("[useConversationResume] failed to resume", {
          conversationId,
          surfaceKey,
          err,
        });
        setError(
          err instanceof Error
            ? err.message
            : "We couldn't reopen that conversation.",
        );
        if (loadedKeyRef.current === conversationId) loadedKeyRef.current = null;
        onSettledRef.current?.(false);
      }
    })();

    return () => {
      ctrl.abort();
    };
  }, [
    enabled,
    conversationId,
    agentId,
    surfaceKey,
    messageLimit,
    dispatch,
    store,
  ]);

  return { isResuming, error };
}
