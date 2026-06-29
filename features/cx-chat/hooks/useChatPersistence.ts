"use client";

import { useCallback, useRef } from "react";
import type {
  CxConversationSummary,
  CxConversationWithMessages,
  CxMessageInsert,
  CxContentBlock,
  CxMessageRole,
} from "@/features/cx-chat/types/cx-tables";

/** Minimal chat message shape used by saveMessages */
interface ChatMessage {
  id: string;
  role: CxMessageRole;
  content: string;
  variables?: Record<string, string>;
  resources?: unknown[];
}

/**
 * Client-side hook for persisting chat data to cx_ tables via API routes.
 *
 * Handles: creating conversations, saving messages, loading history, rename, delete.
 */
export function useChatPersistence() {
  const pendingConversationId = useRef<string | null>(null);

  /** Create a new cx_conversation in the database */
  const createConversation = useCallback(
    async (params: {
      title?: string;
      systemInstruction?: string;
    }): Promise<string | null> => {
      try {
        const res = await fetch("/api/cx-chat/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: params.title,
            system_instruction: params.systemInstruction,
          }),
        });
        const json = await res.json();
        if (json.success && json.data?.id) {
          pendingConversationId.current = json.data.id;
          return json.data.id;
        }
        return null;
      } catch (error) {
        console.error("createConversation error:", error);
        return null;
      }
    },
    [],
  );

  /** Save messages to the database for a given conversation */
  const saveMessages = useCallback(
    async (
      conversationId: string,
      messages: ChatMessage[],
    ): Promise<boolean> => {
      try {
        // org is omitted here: these rows are POSTed to /api/cx-chat/messages
        // and chat.message inherits org from its conversation via DB trigger.
        const cxMessages: Omit<CxMessageInsert, "organization_id">[] = messages.map((msg, index) => {
          // Store text content as a jsonb content array
          const content: CxContentBlock[] = [
            {
              type: "text" as const,
              text: msg.content,
            },
          ];

          return {
            conversation_id: conversationId,
            role: msg.role,
            position: index,
            content,
            metadata: {
              ...(msg.variables ? { variables: msg.variables } : {}),
              ...(msg.resources ? { resources: msg.resources } : {}),
            },
          };
        });

        const res = await fetch("/api/cx-chat/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: cxMessages }),
        });
        const json = await res.json();
        return json.success;
      } catch (error) {
        console.error("saveMessages error:", error);
        return false;
      }
    },
    [],
  );

  /** Load chat history (sidebar) */
  const loadHistory = useCallback(
    async (limit = 50, offset = 0): Promise<CxConversationSummary[]> => {
      try {
        const params = new URLSearchParams({
          limit: String(limit),
          offset: String(offset),
        });

        const url = `/api/cx-chat/history?${params}`;
        console.log("[useChatPersistence] loadHistory →", url);
        const res = await fetch(url);
        console.log(
          "[useChatPersistence] loadHistory response:",
          res.status,
          res.statusText,
        );
        const json = await res.json();
        if (!json.success) {
          console.warn("[useChatPersistence] loadHistory failed:", json.error);
        }
        return json.success ? json.data : [];
      } catch (error) {
        console.error("[useChatPersistence] loadHistory error:", error);
        return [];
      }
    },
    [],
  );

  /** Load a full conversation by ID */
  const loadConversation = useCallback(
    async (
      conversationId: string,
    ): Promise<CxConversationWithMessages | null> => {
      try {
        const url = `/api/cx-chat/request?id=${conversationId}`;
        console.log("[useChatPersistence] loadConversation →", url);
        const res = await fetch(url);
        console.log(
          "[useChatPersistence] loadConversation response:",
          res.status,
          res.statusText,
        );
        const json = await res.json();
        if (!json.success) {
          console.warn(
            "[useChatPersistence] loadConversation failed:",
            json.error,
          );
        }
        return json.success ? json.data : null;
      } catch (error) {
        console.error("[useChatPersistence] loadConversation error:", error);
        return null;
      }
    },
    [],
  );

  /** Rename a conversation */
  const renameConversation = useCallback(
    async (conversationId: string, newTitle: string): Promise<boolean> => {
      try {
        const res = await fetch("/api/cx-chat/request", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: conversationId, title: newTitle }),
        });
        const json = await res.json();
        return json.success;
      } catch (error) {
        console.error("renameConversation error:", error);
        return false;
      }
    },
    [],
  );

  /** Delete a conversation (soft-delete) */
  const deleteConversation = useCallback(
    async (conversationId: string): Promise<boolean> => {
      try {
        const res = await fetch(`/api/cx-chat/request?id=${conversationId}`, {
          method: "DELETE",
        });
        const json = await res.json();
        return json.success;
      } catch (error) {
        console.error("deleteConversation error:", error);
        return false;
      }
    },
    [],
  );

  /** Update conversation status */
  const updateConversationStatus = useCallback(
    async (
      conversationId: string,
      status: "active" | "completed" | "archived",
    ): Promise<boolean> => {
      try {
        const res = await fetch("/api/cx-chat/request", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: conversationId, status }),
        });
        const json = await res.json();
        return json.success;
      } catch (error) {
        console.error("updateConversationStatus error:", error);
        return false;
      }
    },
    [],
  );

  return {
    createConversation,
    saveMessages,
    loadHistory,
    loadConversation,
    renameConversation,
    deleteConversation,
    updateConversationStatus,
    pendingConversationId: pendingConversationId.current,
  };
}
