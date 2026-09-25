// features/rich-document/actions/utils.ts
//
// Shared utilities for the action handler modules. Ported from
// messageActionRegistry.ts (lines 143–234 of the original file) with the
// chat-specific bits factored out so they're reusable across all sources.

import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { extractErrorMessage } from "@/utils/errors";
import {
  selectConversationTitle,
} from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { selectMessagePosition } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { buildConversationMessageTitle } from "@/features/agents/utils/conversation-message-title";
import type {
  ChatMessageExtensions,
  RichDocumentActionContext,
} from "../types";

/** Storage key for "do this action after the user signs in" payloads. */
export const PENDING_ACTION_KEY = "matrx_pending_post_auth_action";

/** Coerce any thrown value into a user-facing string. */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string") return error || fallback;
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    const msg =
      (typeof e.message === "string" && e.message) ||
      (typeof e.details === "string" && e.details) ||
      (typeof e.hint === "string" && e.hint) ||
      null;
    if (msg) return msg;
  }
  return fallback;
}

/**
 * Serialize a thrown value into a log-friendly object. Supabase errors and
 * `createAsyncThunk` rejectWithValue payloads are often class instances with
 * non-enumerable fields that JSON.stringify silently collapses.
 */
export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    return {
      code: e.code ?? null,
      message: e.message ?? null,
      details: e.details ?? null,
      hint: e.hint ?? null,
      status: e.status ?? null,
      name: e.name ?? null,
    };
  }
  return { raw: extractErrorMessage(error) };
}

/**
 * Gate an action behind auth. When signed out, opens the authGate overlay
 * and (for chat sources only) stashes the pending action in sessionStorage
 * so `resumePendingAuthAction` can replay it after sign-in. For other
 * sources the resume path isn't wired yet — the user just sees the gate.
 *
 * Returns `true` when the action may proceed, `false` when it should bail.
 */
export function requireAuth(
  ctx: RichDocumentActionContext,
  actionKey: string,
  featureName: string,
  description: string,
): boolean {
  if (ctx.isAuthenticated) return true;

  // Only chat surfaces have a resume path today (see resumePendingAuthAction
  // in the legacy messageActionRegistry.ts). For other sources we still open
  // the gate so the user knows what's blocking them, but don't queue.
  if (ctx.source.type === "chat-message") {
    try {
      sessionStorage.setItem(
        PENDING_ACTION_KEY,
        JSON.stringify({
          action: actionKey,
          savedContent: ctx.content,
        }),
      );
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }

  ctx.dispatch(
    openOverlay({
      overlayId: "authGate",
      data: { featureName, featureDescription: description },
    }),
  );
  return false;
}

/**
 * Extract the first fenced code block from a markdown string. Returns the
 * raw code and the detected language. Falls back to the full content when
 * no fence is present.
 */
export function extractFirstCodeBlock(content: string): {
  code: string;
  language?: string;
} {
  const match = content.match(/```([\w.+-]+)?\s*\n([\s\S]*?)```/);
  if (!match) return { code: content };
  return {
    code: match[2] ?? "",
    language: match[1]?.toLowerCase() || undefined,
  };
}

/**
 * Resolve an action label to a string. Supports both static labels and
 * `(ctx) => string` callbacks so labels like "Edit history (3)" can pull
 * counts from the live context.
 */
export function resolveActionLabel(
  label: string | ((ctx: RichDocumentActionContext) => string),
  ctx: RichDocumentActionContext,
): string {
  return typeof label === "function" ? label(ctx) : label;
}

/**
 * Build the "Task Related To:" title used by save-to-task. Lifts the first
 * meaningful line from the content (strips markdown chrome) and truncates.
 */
export function buildTaskTitle(content: string): string {
  const firstLine =
    content
      .trim()
      .split(/\n+/)[0]
      ?.replace(/^[#>*\-\s]+/, "")
      .slice(0, 60) || "";
  return firstLine
    ? `Task Related To: ${firstLine}${firstLine.length >= 60 ? "…" : ""}`
    : "Task Related To AI message";
}

// ============================================================================
// SOURCE HELPERS — shared by the handlers that migrated from the chat-only
// messageActionRegistry. Chat facts come from ctx.source + the chat extension;
// every other source answers null / undefined and the handler degrades.
// ============================================================================

/** The chat extension, when this context is a chat message. */
export function chatExtensions(
  ctx: RichDocumentActionContext,
): ChatMessageExtensions | null {
  return ctx.extensions?.type === "chat-message" ? ctx.extensions : null;
}

/** Conversation + message ids for provenance; nulls for non-chat sources. */
export function chatIds(ctx: RichDocumentActionContext): {
  conversationId: string | null;
  messageId: string | null;
} {
  if (ctx.source.type !== "chat-message") {
    return {
      conversationId:
        ctx.source.type === "working-document" ? ctx.source.conversationId : null,
      messageId: null,
    };
  }
  return {
    conversationId: ctx.source.conversationId || null,
    messageId: ctx.source.messageId || null,
  };
}

/** True when the chat message is the user's own turn. */
export function isChatUserMessage(ctx: RichDocumentActionContext): boolean {
  return chatExtensions(ctx)?.role === "user";
}

/**
 * Canonical title for anything created FROM this content. Chat: "{conversation
 * title} Message {n}" (the shared builder); every other source: undefined —
 * callers supply their destination-appropriate fallback.
 */
export function deriveContentTitle(
  ctx: RichDocumentActionContext,
): string | undefined {
  const { conversationId, messageId } = chatIds(ctx);
  if (!conversationId || ctx.source.type !== "chat-message") return undefined;
  const state = ctx.getState();
  const conversationTitle = selectConversationTitle(conversationId)(state);
  const messagePosition = messageId
    ? selectMessagePosition(conversationId, messageId)(state)
    : undefined;
  return buildConversationMessageTitle(conversationTitle, messagePosition);
}

/** Filesystem-safe filename fragment from a derived title. */
export function toSafeFileName(title: string): string {
  return title.replace(/[\\/:*?"<>|]+/g, "-").trim();
}

/** `{title}` when one derives, else `{fallbackPrefix}-{timestamp}`. */
export function contentFileName(
  ctx: RichDocumentActionContext,
  fallbackPrefix = "message",
): string {
  const title = deriveContentTitle(ctx);
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return title ? toSafeFileName(title) : `${fallbackPrefix}-${ts}`;
}

/**
 * Chat write-back is off for structured payloads (the JSON raw view must never
 * be saved back as a text block) and for user turns outside their own
 * three-outcome editor (a silent save with no resubmit choice reads as a bug).
 */
export function chatWriteBackBlocked(ctx: RichDocumentActionContext): boolean {
  const ext = chatExtensions(ctx);
  if (!ext) return false;
  return ext.contentIsStructuredRaw || ext.role === "user";
}
