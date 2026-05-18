"use client";

/**
 * MessageOptionsMenu — the "more options" (⋯) overflow menu attached to a
 * message. Role-aware: assistant messages get the assistant action set,
 * user messages get the user action set (which includes Edit & Resubmit).
 *
 * Creator detection — when the viewer owns the agent definition tied to
 * this conversation, extra analytics / debug items are shown (stream
 * debug, response analysis). These open floating window-panels and reuse
 * the same core panels that power the Creator Run Panel on
 * /agent/[id]/run and /build.
 *
 * Props are passed directly — no Redux instance-registration pattern.
 */

import React, { useEffect } from "react";
import AdvancedMenu from "@/components/official/AdvancedMenu";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectUser, selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { selectAgentIdFromInstance } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { selectAgentIsConfirmedOwner } from "@/features/agents/redux/agent-definition/selectors";
import { selectMessageStreamRequestId } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import {
  getAssistantMessageActions,
  getUserMessageActions,
  resumePendingAuthAction,
  type MessageActionContext,
} from "./messageActionRegistry";

export interface MessageOptionsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  role: "user" | "assistant";
  /** Flat-text rendering of the message content (for copy/print/TTS). */
  content: string;
  /** Server-assigned `cx_message.id`. Null hides mutation actions. */
  messageId: string | null;
  /** Server-assigned `cx_conversation.id`. Null hides mutation actions. */
  conversationId: string | null;
  /** Optional JSON metadata to include in saves/exports. */
  metadata?: Record<string, unknown> | null;
  anchorElement?: HTMLElement | null;
  /** True when a full-page print handler is available (assistant only). */
  showFullPrint?: boolean;
  onFullPrint?: () => void;
  isCapturing?: boolean;
  /**
   * UI surface this menu belongs to. Forwarded into the action context so
   * fork outcomes route through the surfaces registry.
   */
  surfaceKey?: string;
  /**
   * Called when the user picks "Delete message". The host owns the
   * destructive-vs-fork dialog state. Omit to hide the item.
   */
  onRequestDelete?: () => void;
  /**
   * Called when the user picks "Edit history". The host owns the dialog
   * state so it survives this menu closing. Omit to hide the item.
   */
  onRequestEditHistory?: () => void;
  /** Number of archived versions on this message. */
  contentHistoryCount?: number;
}

export function MessageOptionsMenu({
  isOpen,
  onClose,
  role,
  content,
  messageId,
  conversationId,
  metadata = null,
  anchorElement,
  showFullPrint = false,
  onFullPrint,
  isCapturing = false,
  surfaceKey,
  onRequestDelete,
  onRequestEditHistory,
  contentHistoryCount = 0,
}: MessageOptionsMenuProps) {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const isAuthenticated = !!user?.email;
  // Gates the "Server API (test)" menu section that exposes the new
  // Python-backed conversation endpoints (fork, batch-delete, hide,
  // replace-with-summary, restore). Super admin only — hidden for
  // everyone else.
  const isAdmin = useAppSelector(selectIsSuperAdmin);

  // ── Creator detection — conversation → agent → isConfirmedOwner ──────────
  // `agentId` sits on the execution instance (cx_conversation.agent_id mirrored
  // locally). `selectAgentIsConfirmedOwner` only returns true once the agent
  // record has loaded with `is_owner === true` — it stays false while the
  // access metadata is pending, so creator items don't flash for
  // non-creators on first render.
  const agentId = useAppSelector((s) =>
    conversationId ? selectAgentIdFromInstance(conversationId)(s) : undefined,
  );
  const isCreator = useAppSelector((s) =>
    agentId ? selectAgentIsConfirmedOwner(s, agentId) : false,
  );

  // Request that produced this message. `_streamRequestId` is client-only
  // (lives in Redux, not the DB), so it's only populated for messages that
  // streamed this session — sufficient for creator debugging right after a
  // turn, gracefully degrades otherwise.
  const streamRequestId = useAppSelector((s) =>
    conversationId && messageId
      ? (selectMessageStreamRequestId(conversationId, messageId)(s) ?? null)
      : null,
  );

  useEffect(() => {
    resumePendingAuthAction(isAuthenticated, content, dispatch);
  }, [isAuthenticated, content, dispatch]);

  const ctx: MessageActionContext = {
    content,
    isAuthenticated,
    messageId,
    conversationId,
    metadata,
    dispatch,
    onClose,
    showFullPrint,
    onFullPrint,
    isCapturing,
    isCreator,
    streamRequestId,
    surfaceKey: surfaceKey ?? null,
    onRequestDelete,
    onRequestEditHistory,
    contentHistoryCount,
    isAdmin,
  };

  const menuItems =
    role === "user"
      ? getUserMessageActions(ctx)
      : getAssistantMessageActions(ctx);

  return (
    <AdvancedMenu
      isOpen={isOpen}
      onClose={onClose}
      items={menuItems}
      title={role === "user" ? "Your message" : "Message options"}
      position="bottom-left"
      anchorElement={anchorElement}
    />
  );
}

export default MessageOptionsMenu;
