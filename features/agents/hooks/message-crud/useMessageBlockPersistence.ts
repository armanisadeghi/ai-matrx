"use client";

/**
 * useMessageBlockPersistence — the hook every stateful render block uses to
 * persist its internal state back into the message's content blocks.
 *
 * Why: stateful artifacts (quizzes, flashcards, editable tables, forms, etc.)
 * lose their state on re-render because the message's content is re-parsed
 * from markdown on every open. This hook lets a block:
 *   1. Read its own persisted state from the message's content (keyed by a
 *      stable `_matrxBlockId`).
 *   2. Patch that state back into the message when the user interacts, which
 *      round-trips through `cx_message_edit` so the DB is authoritative.
 *   3. Mint a stable id on first write if the block doesn't have one yet.
 *
 * Side-effect: the agent's conversation history now reflects the user's
 * current artifact state on the next turn — the model can see how the user
 * is performing on the quiz, what they wrote in the form, etc.
 *
 * Usage inside a stateful block:
 *
 *   const { blockState, patchBlock } = useMessageBlockPersistence({
 *     conversationId,
 *     messageId,
 *     blockId,            // may be undefined on first render
 *     blockType: "quiz",
 *     indexHint: 3,       // position in the content array
 *   });
 *
 *   // Read persisted state on mount
 *   useEffect(() => {
 *     if (blockState?.state) setQuizState(blockState.state);
 *   }, []);
 *
 *   // Persist on change (debounced by the caller)
 *   useEffect(() => {
 *     patchBlock({ state: quizState });
 *   }, [quizState]);
 */

import { useCallback, useMemo } from "react";
import { v4 as uuidv4 } from "uuid";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectMessageContent } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { editMessage } from "@/features/agents/redux/execution-system/message-crud/edit-message.thunk";

// =============================================================================
// Block shape
// =============================================================================

/**
 * The persisted shape of a block inside `cx_message.content`. Blocks that
 * opt into persistence carry a stable `_matrxBlockId` and an arbitrary
 * `_matrxState` bag. All other fields are left as-is — the hook never
 * removes or rewrites unrelated block fields.
 */
export interface PersistedBlock {
  _matrxBlockId?: string;
  _matrxBlockType?: string;
  _matrxState?: Record<string, unknown>;
  type?: string;
  [key: string]: unknown;
}

// =============================================================================
// Hook
// =============================================================================

export interface UseMessageBlockPersistenceArgs {
  conversationId?: string;
  messageId?: string;
  /**
   * Stable block id if the caller already has one. When undefined, the hook
   * mints a UUID on first write and stamps it into the block on that
   * same round trip.
   */
  blockId?: string;
  /** Discriminator on the block's `type` field (e.g. "quiz", "flashcards"). */
  blockType?: string;
  /**
   * Fallback position when the block has no id AND no type match — used only
   * for the initial write. Once the id is stamped, subsequent reads locate
   * the block by id regardless of position.
   */
  indexHint?: number;
}

export interface UseMessageBlockPersistenceReturn {
  /** The persisted block, located by id or by (type + index). `undefined` if the message isn't loaded yet. */
  blockState: PersistedBlock | undefined;
  /** Merge `patch` into the block's state + round-trip via `editMessage`. */
  patchBlock: (patch: Partial<PersistedBlock>) => Promise<void>;
  /** True when persistence can actually happen (both ids present + message has content). */
  canPersist: boolean;
}

export function useMessageBlockPersistence({
  conversationId,
  messageId,
  blockId,
  blockType,
  indexHint,
}: UseMessageBlockPersistenceArgs): UseMessageBlockPersistenceReturn {
  const dispatch = useAppDispatch();

  const content = useAppSelector(
    conversationId && messageId
      ? selectMessageContent(conversationId, messageId)
      : () => undefined,
  );

  const blocks: PersistedBlock[] = useMemo(() => {
    return Array.isArray(content) ? (content as PersistedBlock[]) : [];
  }, [content]);

  // Locate by id first; fall back to (type + index) for pre-id blocks.
  const blockState = useMemo<PersistedBlock | undefined>(() => {
    if (blocks.length === 0) return undefined;
    if (blockId) {
      const byId = blocks.find((b) => b._matrxBlockId === blockId);
      if (byId) return byId;
    }
    if (blockType) {
      if (typeof indexHint === "number") {
        const sameType = blocks.filter((b) => b.type === blockType);
        if (indexHint < sameType.length) return sameType[indexHint];
      }
      const first = blocks.find((b) => b.type === blockType);
      if (first) return first;
    }
    return undefined;
  }, [blocks, blockId, blockType, indexHint]);

  const canPersist = Boolean(conversationId && messageId && blocks.length > 0);

  const patchBlock = useCallback(
    async (patch: Partial<PersistedBlock>): Promise<void> => {
      if (!conversationId || !messageId) return;
      if (blocks.length === 0) return;

      // Resolve target id — existing or freshly minted.
      const targetId = blockState?._matrxBlockId ?? blockId ?? uuidv4();

      // Build the new content array with the target block's patch merged in.
      // Untouched blocks keep their references, so any selector watching
      // another block stays stable.
      let wrote = false;
      const nextContent: PersistedBlock[] = blocks.map((b) => {
        const isTarget = b === blockState;
        if (!isTarget) return b;
        wrote = true;
        const merged: PersistedBlock = {
          ...b,
          ...patch,
          _matrxBlockId: targetId,
          ...(blockType && !b._matrxBlockType
            ? { _matrxBlockType: blockType }
            : {}),
          _matrxState: {
            ...(b._matrxState ?? {}),
            ...(patch._matrxState ?? {}),
          },
        };
        return merged;
      });

      // The block wasn't in the content (e.g., first render of a purely
      // client-generated artifact). Append.
      if (!wrote) {
        nextContent.push({
          _matrxBlockId: targetId,
          _matrxBlockType: blockType,
          type: blockType,
          ...patch,
          _matrxState: patch._matrxState ?? {},
        });
      }

      await dispatch(
        editMessage({
          conversationId,
          messageId,
          newContent: nextContent,
        }),
      );
    },
    [
      blocks,
      blockState,
      blockId,
      blockType,
      conversationId,
      messageId,
      dispatch,
    ],
  );

  return { blockState, patchBlock, canPersist };
}
