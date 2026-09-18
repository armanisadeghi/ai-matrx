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
  /**
   * Does the SERVER certainly already hold a row for this conversation?
   *
   * Left undefined, the hook infers it from "nothing about this id is in
   * memory" — right for a route that resumes a conversation from a URL or a
   * history row, and WRONG for a surface holding a RESERVATION: an id the
   * server minted so the surface has a stable room, whose `chat.conversation`
   * row is written lazily by the first turn. The inference cannot tell those
   * apart, so it called an unwritten row a failed read and the vision
   * interview room wore "Couldn't load this conversation… your sign-in lost
   * access to it" over a Try-again that could never succeed, on every fresh
   * session (census W1, 2026-09-15; 0 of 8 bindings on that session had a row).
   *
   * A surface that KNOWS which of the two it is holding says so here, and an
   * empty room then reads as empty instead of broken. A surface that does not
   * know must leave it undefined: the inference is the honest default, because
   * the cost of wrongly expecting a row is one truthful banner, while the cost
   * of wrongly NOT expecting one is a real failed read rendering as an empty
   * conversation — a screen that lies (law 4).
   */
  expectMaterialized?: boolean;
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
  expectMaterialized,
}: UseConversationResumeOptions): UseConversationResumeResult {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  // Starts TRUE whenever there is something to resume — before `enabled` flips,
  // the surface must show its skeleton, never an empty room that then fills in.
  const [isResuming, setIsResuming] = useState(() => conversationId != null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  /**
   * THE INVARIANT: a conversation that has not been loaded is never left
   * permanently un-loadable.
   *
   * This ref is a record of a COMPLETED resume, never of a started one. It
   * used to be written the moment the effect began its async work — and the
   * effect's own cleanup aborts that work, so any re-run (a dep change such as
   * `enabled` flipping while the auth session re-hydrates, or a StrictMode
   * double-mount) aborted attempt #1 and then short-circuited attempt #2 on a
   * latch nothing released: the room rendered with zero messages and full
   * chrome, forever (owner, 2026-09-13). Only a settled resume may write it,
   * so every non-success exit — abort, error, early return — leaves the
   * conversation loadable by the next run.
   */
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
          loadedKeyRef.current = conversationId;
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
            // Nothing was in memory for this id, so the surface is reopening a
            // conversation the SERVER is supposed to have. A bundle with no
            // row is then a failed read, not a fresh mint, and the transcript
            // must say so instead of rendering an empty room.
            //
            // Unless the caller KNOWS otherwise — a reservation has no row yet
            // by design, and an empty read of one is not a failure (see the
            // option's own doc).
            expectMaterialized: expectMaterialized ?? !exists,
          }),
        ).unwrap();
        if (ctrl.signal.aborted) return;
        setIsResuming(false);
        loadedKeyRef.current = conversationId;

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
        // The latch is written only on success, so a failed attempt never held
        // it — this stays as a belt-and-braces assertion of the invariant.
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
    expectMaterialized,
    dispatch,
    store,
  ]);

  return { isResuming, error };
}
