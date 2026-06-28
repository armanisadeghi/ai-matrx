"use client";

/**
 * AppletFollowUpInput
 *
 * Fixed bottom input bar for continuing the conversation after an applet response.
 * Uses local turn state + MarkdownStream `content` prop (stream-tasks Redux removed).
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
import { useAppSelector } from "@/lib/redux/hooks";
import { parseNdjsonStream } from "@/lib/api/stream-parser";
import { ENDPOINTS, BACKEND_URLS } from "@/lib/api/endpoints";
import { useApiAuth } from "@/hooks/useApiAuth";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import type {
  ChunkPayload,
  ErrorPayload,
} from "@/types/python-generated/stream-events";

export interface FollowUpTurn {
  userMessage: string;
  taskId: string;
  assistantContent: string;
  isStreaming: boolean;
  error?: string;
}

interface AppletFollowUpInputProps {
  conversationId: string | undefined;
  onNewTurn: (turn: FollowUpTurn) => void;
  onTurnUpdate: (taskId: string, updates: Partial<FollowUpTurn>) => void;
}

export default function AppletFollowUpInput({
  conversationId,
  onNewTurn,
  onTurnUpdate,
}: AppletFollowUpInputProps) {
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

    setInputValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    onNewTurn({
      userMessage: content,
      taskId,
      assistantContent: "",
      isStreaming: true,
    });
    setIsStreaming(true);

    const endpoint = `${getBackendUrl()}${ENDPOINTS.ai.conversationContinue(convId)}`;
    let assistantContent = "";

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

      for await (const event of events) {
        switch (event.event) {
          case "chunk": {
            const { text } = event.data as unknown as ChunkPayload;
            assistantContent += text;
            onTurnUpdate(taskId, { assistantContent, isStreaming: true });
            break;
          }
          case "tool_event":
            break;
          case "error": {
            const errData = event.data as unknown as ErrorPayload;
            onTurnUpdate(taskId, {
              error: errData.user_message || errData.message,
              isStreaming: false,
            });
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
      onTurnUpdate(taskId, {
        error: err instanceof Error ? err.message : "Request failed",
        isStreaming: false,
      });
    } finally {
      onTurnUpdate(taskId, { assistantContent, isStreaming: false });
      setIsStreaming(false);
    }
  }, [
    inputValue,
    isStreaming,
    getBackendUrl,
    getHeaders,
    onNewTurn,
    onTurnUpdate,
  ]);

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
