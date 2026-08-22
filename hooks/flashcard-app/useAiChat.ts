// hooks/flashcard-app/useAiChat.ts
//
// The legacy flashcard-app "Ask AI" chat, routed through THE UNIVERSAL LAW
// (common-docs/systems/agents/mandates/RUNTIME.md): every AI invocation
// resolves through a Mandate. This hook used to hold an OpenAI browser client
// and an in-code system prompt (F12); now it runs the same
// `flashcards.help_live` lane every study surface uses
// (features/education/tutor/lanes/helpLive.ts) — the agent, its prompt and its
// model live in the DATABASE and are swapped at /agents/mandates.
//
// Live posture: the answer streams into `<LiveRunDisplay conversationId>` the
// host mounts (no spinner while AI works); the finished answer is then written
// to the per-card Redux chat and the live instance is released, so the text is
// never on screen twice.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { FlashcardData } from "@/types/flashcards.types";
import { addMessage } from "@/lib/redux/slices/flashcardChatSlice";
import { selectActiveFlashcardChat } from "@/lib/redux/selectors/flashcardSelectors";
import { helpLive } from "@/features/education/tutor/lanes/helpLive";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import { toast } from "@/lib/toast";

export interface UseAiChat {
  isLoading: boolean;
  /** Live handle — mount `<LiveRunDisplay conversationId={…} />` while set. */
  conversationId: string | null;
  /** Opens the chat for a card with the lane's default "I'm confused" ask. */
  sendInitialMessage: (flashcard: FlashcardData) => Promise<void>;
  /** Sends what the learner typed (or a quick-action prompt) about a card. */
  sendMessage: (message: string, flashcard: FlashcardData) => Promise<void>;
}

export const useAiChat = (): UseAiChat => {
  const dispatch = useAppDispatch();
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  // The kept-alive instance THIS hook owns (lane runs with keepInstance:true
  // whenever a binder is supplied) — released on completion, re-run, unmount.
  const ownedRef = useRef<string | null>(null);
  const currentChat = useAppSelector(selectActiveFlashcardChat);

  const release = useCallback(() => {
    const owned = ownedRef.current;
    ownedRef.current = null;
    setConversationId(null);
    if (owned) dispatch(destroyInstanceIfAllowed(owned));
  }, [dispatch]);

  useEffect(() => release, [release]);

  const ask = useCallback(
    async (flashcard: FlashcardData, question?: string): Promise<void> => {
      const flashcardId = flashcard.id;
      if (isLoading || !flashcardId) return;
      setIsLoading(true);
      release();
      try {
        const result = await dispatch(
          helpLive({
            front: flashcard.front,
            back: flashcard.back,
            cardId: flashcardId,
            question,
            onConversationCreated: (cid) => {
              ownedRef.current = cid;
              setConversationId(cid);
            },
          }),
        );
        if (!result) {
          toast.error("Your tutor couldn't answer right now. Try again.");
          return;
        }
        dispatch(
          addMessage({
            flashcardId,
            message: { role: "assistant", content: result.answer },
          }),
        );
      } finally {
        release();
        setIsLoading(false);
      }
    },
    [dispatch, isLoading, release],
  );

  const sendInitialMessage = useCallback(
    async (flashcard: FlashcardData): Promise<void> => {
      if (currentChat.length > 0) return;
      await ask(flashcard);
    },
    [ask, currentChat.length],
  );

  const sendMessage = useCallback(
    async (message: string, flashcard: FlashcardData): Promise<void> => {
      const trimmed = message.trim();
      if (!trimmed) return;
      await ask(flashcard, trimmed);
    },
    [ask],
  );

  return { isLoading, conversationId, sendInitialMessage, sendMessage };
};
