// features/rich-document/actions/handlers/ask.ts
//
// "Quote into chat" and "Ask a follow-up about this" — the reader points at a
// passage (a selection from the right-click menu, or the whole content from a
// bar) and brings it into the conversation it came from.
//
// THE USER-INPUT LAW: a selection is machine-carried content, so it NEVER goes
// into the composer text. It rides as a context entry on the conversation
// (`quoted_passages`, accumulated), exactly as picked resources do; the person
// then types their own question. Absent where there is no conversation.

import { MessageSquareQuote, MessagesSquare } from "lucide-react";
import { toast } from "@/lib/toast";
import { setContextEntries } from "@ai-matrx/chat/agents/redux/execution-system/instance-context/instance-context.slice";
import { selectInstanceContextEntry } from "@ai-matrx/chat/agents/redux/execution-system/instance-context/instance-context.selectors";
import { registerAction } from "@ai-matrx/rich-content/rich-document/actions/provider";
import { chatIds, chatStateOf, deriveContentTitle } from "../utils";
import { unwrapKindEnvelopes } from "@/lib/markdown/plain-text";
import type { RichDocumentActionContext } from "@ai-matrx/rich-content/rich-document/types";

/** The context key every quote lands under — one list per conversation. */
export const QUOTED_PASSAGES_CONTEXT_KEY = "quoted_passages";

function quote(ctx: RichDocumentActionContext): boolean {
  const { conversationId, messageId } = chatIds(ctx);
  // The quote is context the MODEL reads, not a page a person reads: a kind
  // stays its data (`__kind` is part of the data), so this is the one
  // outbound path that skips `contentForDestination`'s kind → markdown step.
  const text = unwrapKindEnvelopes(ctx.content).trim();
  if (!conversationId || !text) return false;
  const state = chatStateOf(ctx, ["instanceContext"]);
  const existing = state ? selectInstanceContextEntry(conversationId, QUOTED_PASSAGES_CONTEXT_KEY)(state) : undefined;
  const prior = Array.isArray(existing?.value) ? existing.value : [];
  ctx.dispatch(
    setContextEntries({
      conversationId,
      entries: [
        {
          key: QUOTED_PASSAGES_CONTEXT_KEY,
          value: [
            ...prior,
            {
              text,
              source_message_id: messageId,
              source_title: deriveContentTitle(ctx) ?? null,
            },
          ],
          type: "json",
          label: "Quoted passages",
        },
      ],
    }),
  );
  ctx.onClose();
  return true;
}

function focusComposer(): void {
  const input = document.querySelector<HTMLTextAreaElement>(
    "textarea[data-agent-main-input]",
  );
  input?.focus();
}

const hasConversation = (ctx: RichDocumentActionContext) =>
  Boolean(chatIds(ctx).conversationId) && ctx.content.trim().length > 0;

registerAction({
  id: "ask-followup",
  label: "Ask a follow-up about this",
  icon: MessagesSquare,
  iconColor: "text-sky-500 dark:text-sky-400",
  category: "ask",
  supportedSources: ["chat-message", "working-document"],
  renderSlot: "overflow",
  order: 0,
  visible: hasConversation,
  run: (ctx) => {
    if (!quote(ctx)) return;
    focusComposer();
    toast.success("Passage attached to this chat", {
      description: "Type your follow-up question — the passage goes with it.",
    });
  },
});

registerAction({
  id: "quote-into-chat",
  label: "Quote into chat",
  icon: MessageSquareQuote,
  iconColor: "text-sky-500 dark:text-sky-400",
  category: "ask",
  supportedSources: ["chat-message", "working-document"],
  renderSlot: "overflow",
  order: 1,
  visible: hasConversation,
  run: (ctx) => {
    if (!quote(ctx)) return;
    toast.success("Quoted into this chat", {
      description: "It rides with your next message as a quoted passage.",
    });
  },
});
