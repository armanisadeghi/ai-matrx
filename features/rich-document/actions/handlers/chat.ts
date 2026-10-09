// features/rich-document/actions/handlers/chat.ts
//
// Chat-turn doors that used to be hand-built buttons on the /chat assistant
// bar: "Continue in chat mode" (open this conversation in the full chat page
// from any embedded surface). Absent on the chat page itself.

import { MessageSquareShare, RefreshCw } from "lucide-react";
import { selectIsLatestAssistantMessage } from "@ai-matrx/chat/agents/redux/execution-system/messages/messages.selectors";
import { selectRegenerateAnchor } from "@ai-matrx/chat/agents/redux/execution-system/message-crud/regenerate-anchor";
import { selectReservedConversationId } from "@ai-matrx/chat/agents/redux/execution-system/active-requests/active-requests.selectors";
import {
  isChatRoutePath,
  resolveContinueInChatConversationId,
} from "@ai-matrx/chat/agents/components/messages-display/assistant/continue-in-chat";
import { getEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { chatStateOf } from "../utils";
import { getAction, registerAction } from "@ai-matrx/rich-content/rich-document/actions/provider";
import type { RichDocumentActionContext } from "@ai-matrx/rich-content/rich-document/types";

function continueHref(ctx: RichDocumentActionContext): string | null {
  if (ctx.source.type !== "chat-message") return null;
  const requestId = ctx.source.streamRequestId ?? null;
  const state = chatStateOf(ctx, ["activeRequests"]);
  const reserved = requestId && state ? selectReservedConversationId(requestId)(state) : null;
  const id = resolveContinueInChatConversationId(
    ctx.source.conversationId,
    reserved,
  );
  return getEntityInfo("conversation").hrefFor?.(id) ?? null;
}

registerAction({
  id: "continue-in-chat",
  label: "Continue in chat mode",
  icon: MessageSquareShare,
  category: "share",
  supportedSources: ["chat-message"],
  renderSlot: "primary",
  order: 10,
  visible: (ctx) =>
    typeof window !== "undefined" &&
    !isChatRoutePath(window.location.pathname) &&
    continueHref(ctx) !== null,
  run: (ctx) => {
    const href = continueHref(ctx);
    if (href) window.open(href, "_blank", "noopener,noreferrer");
  },
});

// The latest answer's one-tap Regenerate (older answers use Fork) — an inline
// door onto the SAME registry action the ⋯ menu carries (answer-tools.ts).
registerAction({
  id: "regenerate-latest",
  writesSource: true,
  label: "Regenerate answer",
  icon: RefreshCw,
  category: "edit",
  supportedSources: ["chat-message"],
  renderSlot: "primary",
  order: 5,
  requiresAuth: true,
  visible: (ctx) => {
    if (ctx.source.type !== "chat-message") return false;
    if (ctx.extensions?.type !== "chat-message" || ctx.extensions.role !== "assistant") {
      return false;
    }
    const { conversationId, messageId } = ctx.source;
    const state = chatStateOf(ctx, ["messages"]);
    if (!state) return false;
    return (
      selectIsLatestAssistantMessage(conversationId, messageId)(state) &&
      selectRegenerateAnchor(state, conversationId, messageId) !== null
    );
  },
  run: (ctx) => getAction("regenerate-response")?.run(ctx),
});
