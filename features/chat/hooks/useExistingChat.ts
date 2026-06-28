"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { useRouter } from "next/navigation";
import useChatBasics from "@/features/chat/hooks/useChatBasics";
import { useAppDispatch } from "@/lib/redux/hooks";
import { saveMessageThunk } from "@/lib/redux/features/aiChats/thunks/entity/createMessageThunk";

const INFO = true;
const DEBUG = false;
const VERBOSE = false;

interface ExistingChatProps {
  existingConversationId: string;
}

export function useExistingChat({ existingConversationId }: ExistingChatProps) {
  const [firstLoadComplete, setFirstLoadComplete] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const dispatch = useAppDispatch();
  const router = useRouter();

  const { chatActions, conversationId, routeLoadComplete, messageKey } =
    useChatBasics();

  // Coordinate (active-conversation switch + message fetch) EXACTLY ONCE per
  // URL conversation id. The old code fired on mount, then a second effect
  // re-fired it as soon as `firstLoadComplete` flipped — because the Redux
  // active `conversationId` hadn't caught up to `existingConversationId` yet,
  // so `existingConversationId !== conversationId` was transiently true. That
  // re-fetched the whole conversation a second time on every open (the
  // "SHOULD NOT SEE THIS" path). Gating on a ref keyed by the URL id means a
  // lagging Redux value can never trigger a fetch — only a genuine id change
  // (navigating to a different existing conversation) does.
  const coordinatedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (coordinatedIdRef.current === existingConversationId) return;
    coordinatedIdRef.current = existingConversationId;
    dispatch(
      chatActions.coordinateActiveConversationAndMessageFetch(
        existingConversationId,
      ),
    );
    setFirstLoadComplete(true);
  }, [existingConversationId, dispatch, chatActions]);

  // Reflect external-loading purely from whether the Redux active conversation
  // has caught up to the URL id. This only toggles a flag — it never triggers
  // a fetch — so the lag window shows a spinner instead of double-fetching.
  useEffect(() => {
    if (!firstLoadComplete) return;
    dispatch(
      chatActions.setExternalConversationLoading(
        existingConversationId !== conversationId,
      ),
    );
  }, [
    existingConversationId,
    conversationId,
    firstLoadComplete,
    dispatch,
    chatActions,
  ]);

  const submitChatMessage = useCallback(async () => {
    try {
      setIsSubmitting(true);

      if (!messageKey) {
        console.error(
          "USE EXISTING CHAT ERROR! submitChatMessage failed:",
          "Message key was not found",
        );
        return false;
      }

      const result = await dispatch(
        saveMessageThunk({ messageTempId: messageKey }),
      ).unwrap();

      if (VERBOSE)
        console.log(
          "🚀 ~ submitChatMessage ~ result:",
          JSON.stringify(result, null, 2),
        );

      if (result && result.success) {
        const taskId = uuidv4();
        dispatch(
          chatActions.updateConversationCustomData({
            keyOrId: conversationId,
            customData: { taskId },
          }),
        );

        // Legacy stream-tasks submit removed — message is saved; streaming UI
        // will not update until legacy chat migrates to the agents execution path.
        if (DEBUG) {
          console.warn(
            "[useExistingChat] Message saved but stream submit is disabled (stream-tasks removed). taskId:",
            taskId,
          );
        }
        return true;
      } else {
        console.error(
          "USE EXISTING CHAT ERROR! submitChatMessage failed:",
          result,
        );
        return false;
      }
    } catch (error) {
      console.error(
        "USE EXISTING CHAT ERROR! submitChatMessage failed:",
        error,
      );
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [dispatch, chatActions, conversationId, messageKey]);

  return {
    submitChatMessage,
    isSubmitting,
    routeLoadComplete,
    chatActions,
    conversationId,
  };
}

export type ExistingChatResult = ReturnType<typeof useExistingChat>;
export default useExistingChat;
