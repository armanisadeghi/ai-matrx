"use client";

/**
 * useMessageActions — the universal message-level action surface.
 *
 * One hook for every operation a user can perform on an assistant message:
 *
 *   - saveFullContent(newText)         — edit the whole message content
 *   - forkAtThisMessage()              — fork the conversation at this position
 *   - editAndResubmit(newText)         — fork + replace this message + fire
 *                                        the next turn from the new branch
 *   - deleteConversation()             — soft-delete the whole conversation
 *                                        (rare; typically handled at the
 *                                        conversation-list level)
 *
 * Every action returns a Promise that resolves with the outcome so the
 * caller can surface UI feedback (toast, navigation, etc.).
 *
 * Every action that mutates the DB also auto-flips the conversation's
 * cache-bust flag via the underlying thunks, so the next outbound AI
 * request carries `cache_bypass` and the server's agent cache rebuilds
 * from the authoritative DB.
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch } from "@/lib/redux/hooks";
import type { Json } from "@/types/database.types";
import { editMessage } from "@/features/agents/redux/execution-system/message-crud/edit-message.thunk";
import { forkConversation } from "@/features/agents/redux/execution-system/message-crud/fork-conversation.thunk";
import { softDeleteConversation } from "@/features/agents/redux/execution-system/message-crud/soft-delete-conversation.thunk";
import { launchConversation } from "@/features/agents/redux/execution-system/thunks/launch-conversation.thunk";
import type { ConversationInvocation } from "@/features/agents/types/conversation-invocation.types";

export interface UseMessageActionsArgs {
  conversationId: string;
  messageId: string;
  /** Optional — the message's `position` in the conversation. Required for fork. */
  position?: number;
  /** Optional — the surface key for the fork destination (so focus jumps). */
  surfaceKey?: string;
  /**
   * Optional — factory that builds a `ConversationInvocation` for the
   * "edit and resubmit" flow. The caller owns agent id + variables +
   * display config; the hook only adds the forked conversationId + the
   * new user message.
   *
   * When omitted, `editAndResubmit` will still fork + edit but will NOT
   * fire a follow-up turn.
   */
  buildInvocationForResubmit?: (
    forkedConversationId: string,
  ) => ConversationInvocation;
  /** Optional — where to navigate after a fork. Default: no navigation. */
  onNavigateToFork?: (forkedConversationId: string) => void;
}

export interface UseMessageActionsReturn {
  saveFullContent: (newContent: Json) => Promise<void>;
  forkAtThisMessage: () => Promise<string | null>;
  editAndResubmit: (newUserInput: string) => Promise<string | null>;
  deleteConversation: () => Promise<boolean>;
}

export function useMessageActions({
  conversationId,
  messageId,
  position,
  surfaceKey,
  buildInvocationForResubmit,
  onNavigateToFork,
}: UseMessageActionsArgs): UseMessageActionsReturn {
  const dispatch = useAppDispatch();
  const router = useRouter();

  // ── Save full content (used by the full-screen markdown editor) ──────────
  const saveFullContent = useCallback(
    async (newContent: Json): Promise<void> => {
      await dispatch(
        editMessage({
          conversationId,
          messageId,
          newContent,
        }),
      ).unwrap();
    },
    [conversationId, messageId, dispatch],
  );

  // ── Fork "at this message" ──────────────────────────────────────────────
  const forkAtThisMessage = useCallback(async (): Promise<string | null> => {
    if (typeof position !== "number") {
      // eslint-disable-next-line no-console
      console.warn(
        "[useMessageActions] forkAtThisMessage called without `position` — skipping. Pass the message position when constructing the hook.",
      );
      return null;
    }
    const result = await dispatch(
      forkConversation({
        conversationId,
        atPosition: position,
        surfaceKey,
      }),
    ).unwrap();

    if (onNavigateToFork) {
      onNavigateToFork(result.conversationId);
    } else {
      // Default behaviour: push the current route's agent-aware conversation
      // URL pattern. Callers that want custom navigation pass `onNavigateToFork`.
      router.push(`/agents/runs/${result.conversationId}`);
    }
    return result.conversationId;
  }, [
    conversationId,
    position,
    surfaceKey,
    dispatch,
    onNavigateToFork,
    router,
  ]);

  // ── Edit + resubmit (= fork at this message → fire a new turn) ───────────
  //
  // Semantics: the forked conversation's messages BEFORE this one are
  // preserved unchanged. The forked branch's continuation uses the user's
  // edited input as the next turn. The original conversation is untouched.
  const editAndResubmit = useCallback(
    async (newUserInput: string): Promise<string | null> => {
      if (typeof position !== "number") {
        // eslint-disable-next-line no-console
        console.warn(
          "[useMessageActions] editAndResubmit called without `position` — skipping.",
        );
        return null;
      }
      // 1. Fork at the position BEFORE this message so the user's new
      //    input becomes the next turn (replacing what originally came
      //    next in the source conversation).
      const forkPosition = Math.max(0, position - 1);
      const fork = await dispatch(
        forkConversation({
          conversationId,
          atPosition: forkPosition,
          surfaceKey,
        }),
      ).unwrap();

      // 2. Fire the new turn on the fork. The caller supplies the
      //    invocation factory because agent id + variables + display
      //    config live at the surface layer.
      if (buildInvocationForResubmit) {
        const invocation = buildInvocationForResubmit(fork.conversationId);
        // Inject the user input + pin the identity to the fork.
        const withInput: ConversationInvocation = {
          ...invocation,
          identity: {
            ...invocation.identity,
            conversationId: fork.conversationId,
          },
          inputs: invocation.inputs
            ? { ...invocation.inputs, userInput: newUserInput }
            : { userInput: newUserInput },
        };
        await dispatch(launchConversation(withInput)).unwrap();
      }

      if (onNavigateToFork) {
        onNavigateToFork(fork.conversationId);
      } else {
        router.push(`/agents/runs/${fork.conversationId}`);
      }
      return fork.conversationId;
    },
    [
      conversationId,
      position,
      surfaceKey,
      dispatch,
      buildInvocationForResubmit,
      onNavigateToFork,
      router,
    ],
  );

  // ── Soft-delete the conversation ─────────────────────────────────────────
  const deleteConversation = useCallback(async (): Promise<boolean> => {
    const result = await dispatch(
      softDeleteConversation({ conversationId }),
    ).unwrap();
    return result.deleted;
  }, [conversationId, dispatch]);

  return {
    saveFullContent,
    forkAtThisMessage,
    editAndResubmit,
    deleteConversation,
  };
}
