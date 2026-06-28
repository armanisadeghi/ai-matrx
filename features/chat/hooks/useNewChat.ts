"use client";

import { useCallback, useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useChatBasics from "@/features/chat/hooks/useChatBasics";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";

const INFO = true;
const DEBUG = false;
const VERBOSE = false;

export function useNewChat() {
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [readyToNavigate, setReadyToNavigate] = useState<boolean>(false);
  const [taskId, setTaskId] = useState<string>("");
  const dispatch = useAppDispatch();

  const { chatActions, conversationId, initialLoadComplete, chatSelectors } =
    useChatBasics();
  const isStreaming = useAppSelector(chatSelectors.isStreaming);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const createQueryString = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([name, value]) => {
        if (value) {
          params.set(name, value);
        } else {
          params.delete(name);
        }
      });
      return params.toString();
    },
    [searchParams],
  );

  const queryString = createQueryString({
    live: "true",
  });

  // Legacy stream-tasks removed — assign a client task id for message persistence only.
  useEffect(() => {
    const newTaskId = uuidv4();
    setTaskId(newTaskId);
    dispatch(
      chatActions.updateConversationCustomData({
        keyOrId: conversationId,
        customData: { taskId: newTaskId },
      }),
    );
  }, [dispatch, chatActions, conversationId]);

  useEffect(() => {
    if (isStreaming) return;
    if (!isStreaming && readyToNavigate) {
      router.push(`${pathname}/${conversationId}`);
    }
  }, [
    isStreaming,
    readyToNavigate,
    conversationId,
    pathname,
    router,
    queryString,
  ]);

  const submitChatMessage = useCallback(async () => {
    try {
      setIsSubmitting(true);

      const result = await dispatch(
        chatActions.saveConversationAndMessage({ taskId }),
      ).unwrap();

      if (result && result.success) {
        const conversation = result.conversationData.data;
        const conversationId = conversation.id;
        const message = result.messageData.data;
        router.push(`${pathname}/${conversationId}`);

        if (DEBUG)
          console.log(
            "Task fields set with conversation_id:",
            conversationId,
            "message_object:",
            message,
          );
        return true;
      } else {
        console.error("USE NEW CHAT ERROR! submitChatMessage failed:", result);
        return false;
      }
    } catch (error) {
      console.error("USE NEW CHAT ERROR! submitChatMessage failed:", error);
      return false;
    } finally {
      setReadyToNavigate(true);
      setIsSubmitting(false);
    }
  }, [dispatch, chatActions, router, pathname, taskId]);

  return {
    submitChatMessage,
    isSubmitting,
    initialLoadComplete,
    chatActions,
    conversationId,
    taskId,
  };
}

export type NewChatResult = ReturnType<typeof useNewChat>;
export default useNewChat;
