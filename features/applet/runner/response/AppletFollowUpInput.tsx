"use client";

/**
 * AppletFollowUpInput
 *
 * Fixed bottom input bar for continuing the conversation after an applet response.
 * Sits in the fixed bottom bar rendered by AppletRunComponent.
 *
 * conversationId may arrive slightly after mount (it comes from the stream headers/body).
 * We hold it in a ref so sends wait for it gracefully without stale closures.
 *
 * Each follow-up turn dispatches to a fresh Redux listenerId — the initial response is
 * never mutated. The turn list is managed by the parent (AppletRunComponent) so it renders
 * in the scrollable content area above this bar.
 */

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  KeyboardEvent,
} from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { parseNdjsonStream } from "@/lib/api/stream-parser";
import { ENDPOINTS, BACKEND_URLS } from "@/lib/api/endpoints";
import { useApiAuth } from "@/hooks/useApiAuth";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import {
  addResponse,
  appendTextChunk,
  updateErrorResponse,
  markResponseEnd,
} from "@/lib/redux/stream-tasks/slices/socketResponseSlice";
import {
  initializeTask,
  setTaskListenerIds,
  setTaskStreaming,
  completeTask,
} from "@/lib/redux/stream-tasks/slices/socketTasksSlice";
import type {
  ChunkPayload,
  ErrorPayload,
} from "@/types/python-generated/stream-events";

export interface FollowUpTurn {
  userMessage: string;
  taskId: string;
}

interface AppletFollowUpInputProps {
  conversationId: string | undefined;
  onNewTurn: (turn: FollowUpTurn) => void;
}

export default function AppletFollowUpInput({
  conversationId,
  onNewTurn,
}: AppletFollowUpInputProps) {
  const dispatch = useAppDispatch();
  const { getHeaders } = useApiAuth();
  const resolvedBaseUrl = useAppSelector(
    selectResolvedBaseUrl as (state: unknown) => string | undefined,
  );

  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const conversationIdRef = useRef<string | undefined>(conversationId);

  useEffect(() => {
    conversationIdRef.current = conversationId;
    if (conversationId && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [conversationId]);

  const getBackendUrl = useCallback(() => {
    return resolvedBaseUrl ?? BACKEND_URLS.production;
  }, [resolvedBaseUrl]);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  const sendFollowUp = useCallback(async () => {
    const content = inputValue.trim();
    const convId = conversationIdRef.current;

    if (!content || isStreaming || !convId) return;

    const taskId = uuidv4();
    const listenerId = taskId;

    setInputValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    onNewTurn({ userMessage: content, taskId });
    setIsStreaming(true);

    dispatch(
      initializeTask({
        taskId,
        service: "applet_agent",
        taskName: "conversation_continue",
        connectionId: "fastapi",
      }),
    );
    dispatch(addResponse({ listenerId, taskId }));
    dispatch(setTaskListenerIds({ taskId, listenerIds: [listenerId] }));

    const endpoint = `${getBackendUrl()}${ENDPOINTS.ai.conversationContinue(convId)}`;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { ...getHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ user_input: content, stream: true }),
      });

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}: ${await response.text().catch(() => "")}`,
        );
      }

      const { events } = parseNdjsonStream(response);
      let isFirstChunk = true;

      for await (const event of events) {
        switch (event.event) {
          case "chunk": {
            if (isFirstChunk) {
              dispatch(setTaskStreaming({ taskId, isStreaming: true }));
              isFirstChunk = false;
            }
            const { text } = event.data as unknown as ChunkPayload;
            dispatch(appendTextChunk({ listenerId, text }));
            break;
          }
          case "tool_event":
            break;
          case "error": {
            const errData = event.data as unknown as ErrorPayload;
            dispatch(
              updateErrorResponse({
                listenerId,
                error: {
                  message: errData.message,
                  type: errData.error_type,
                  user_message: errData.user_message,
                },
              }),
            );
            break;
          }
          case "completion":
          case "heartbeat":
          case "end":
            break;
        }
      }
    } catch (err) {
      console.error("[AppletFollowUpInput] Conversation continue failed:", err);
      dispatch(
        updateErrorResponse({
          listenerId,
          error: {
            message: err instanceof Error ? err.message : "Request failed",
            type: "stream_error",
          },
        }),
      );
    } finally {
      dispatch(setTaskStreaming({ taskId, isStreaming: false }));
      dispatch(markResponseEnd(listenerId));
      dispatch(completeTask(taskId));
      setIsStreaming(false);
    }
  }, [inputValue, isStreaming, dispatch, getBackendUrl, getHeaders, onNewTurn]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendFollowUp();
      }
    },
    [sendFollowUp],
  );

  return (
    <div className="relative rounded-xl border border-border bg-card shadow-sm focus-within:ring-1 focus-within:ring-primary/50 transition-shadow">
      <textarea
        ref={textareaRef}
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          adjustHeight();
        }}
        onKeyDown={handleKeyDown}
        placeholder={
          conversationId
            ? "Follow up on this response..."
            : "Preparing conversation..."
        }
        disabled={isStreaming || !conversationId}
        rows={1}
        style={{ fontSize: "16px" }}
        className="w-full resize-none bg-transparent px-4 pt-3 pb-11 text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-50 scrollbar-none"
      />
      <div className="absolute bottom-2.5 right-2.5">
        <button
          onClick={sendFollowUp}
          disabled={!inputValue.trim() || isStreaming || !conversationId}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40 hover:opacity-90"
        >
          {isStreaming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
