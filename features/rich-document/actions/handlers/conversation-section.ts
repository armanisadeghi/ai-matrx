// features/rich-document/actions/handlers/conversation-section.ts
//
// The answer menu's "Conversation" section — everything that acts on the
// WHOLE conversation a message belongs to, beside the per-message rows:
//
//   conversation-find          Find in conversation (the transcript's find bar)
//   conversation-pinned-only   Pinned only (filter the transcript; present once something is pinned)
//   conversation-share         Share conversation (the canonical ShareModal)
//   conversation-copy-link     Copy conversation link
//   conversation-rename        Rename conversation (the ONE rename dialog)
//   conversation-duplicate     Duplicate conversation
//   (+ export-conversation-*   registered in ./answer-tools.ts)
//
// ONE implementation per verb: every run calls the same verb the header menu
// (ConversationPageMenu → buildConversationMenu) calls —
// features/agents/components/conversation-actions/conversation-verbs.ts and the
// per-conversation view-state store. Present only when the source carries a
// conversationId; absent everywhere else, never dead.

import { Copy, Link as LinkIcon, Pencil, Pin, Search, Share2 } from "lucide-react";
import { registerAction } from "../provider";
import { chatIds } from "../utils";
import type { RichDocumentActionContext } from "../../types";
import {
  canonicalConversationHref,
  conversationTitleFromState,
  copyConversationLink,
  duplicateConversationVerb,
  openConversationRename,
  shareConversation,
} from "@/features/agents/components/conversation-actions/conversation-verbs";
import {
  getConversationViewState,
  setConversationFindOpen,
  setConversationPinnedOnly,
  subscribeConversationViewState,
} from "@/features/agents/components/messages-display/conversation-tools/conversation-view-state";
import {
  isMessagePinned,
  subscribePinnedMessages,
} from "@/features/agents/message-pins/pinned-messages-store";
import { selectConversationMessages } from "@/features/agents/redux/execution-system/messages/messages.selectors";

function conversationOf(ctx: RichDocumentActionContext): string | null {
  return chatIds(ctx).conversationId;
}

const hasConversation = (ctx: RichDocumentActionContext) => Boolean(conversationOf(ctx));

function pinnedCount(ctx: RichDocumentActionContext, conversationId: string): number {
  return selectConversationMessages(conversationId)(ctx.getState()).filter((m) =>
    isMessagePinned(m.id),
  ).length;
}

registerAction({
  id: "conversation-find",
  label: "Find in conversation",
  icon: Search,
  iconColor: "text-sky-600 dark:text-sky-400",
  category: "app",
  supportedSources: ["chat-message"],
  renderSlot: "overflow",
  order: 20,
  visible: hasConversation,
  run: (ctx) => {
    ctx.onClose();
    const id = conversationOf(ctx);
    if (id) setConversationFindOpen(id, true);
  },
});

registerAction({
  id: "conversation-pinned-only",
  label: (ctx) => {
    const id = conversationOf(ctx);
    const n = id ? pinnedCount(ctx, id) : 0;
    return n > 0 ? `Pinned only (${n})` : "Pinned only";
  },
  icon: Pin,
  iconColor: "text-amber-500 dark:text-amber-400",
  category: "app",
  supportedSources: ["chat-message"],
  renderSlot: "overflow",
  order: 21,
  // As in the header: present once something is pinned, or while the filter is on.
  visible: (ctx) => {
    const id = conversationOf(ctx);
    if (!id) return false;
    return pinnedCount(ctx, id) > 0 || getConversationViewState(id).pinnedOnly;
  },
  active: (ctx) => {
    const id = conversationOf(ctx);
    return Boolean(id && getConversationViewState(id).pinnedOnly);
  },
  subscribe: (onChange) => {
    const a = subscribePinnedMessages(onChange);
    const b = subscribeConversationViewState(onChange);
    return () => {
      a();
      b();
    };
  },
  run: (ctx) => {
    ctx.onClose();
    const id = conversationOf(ctx);
    if (id) setConversationPinnedOnly(id, !getConversationViewState(id).pinnedOnly);
  },
});

registerAction({
  id: "conversation-share",
  label: "Share conversation",
  icon: Share2,
  iconColor: "text-teal-600 dark:text-teal-400",
  category: "share",
  supportedSources: ["chat-message"],
  renderSlot: "overflow",
  order: 22,
  requiresAuth: true,
  visible: hasConversation,
  run: (ctx) => {
    ctx.onClose();
    const id = conversationOf(ctx);
    if (id) shareConversation(ctx.dispatch, id, conversationTitleFromState(ctx.getState(), id));
  },
});

registerAction({
  id: "conversation-copy-link",
  label: "Copy conversation link",
  icon: LinkIcon,
  iconColor: "text-slate-500 dark:text-slate-400",
  category: "share",
  supportedSources: ["chat-message"],
  renderSlot: "overflow",
  order: 23,
  visible: hasConversation,
  run: async (ctx) => {
    ctx.onClose();
    const id = conversationOf(ctx);
    if (id) await copyConversationLink(canonicalConversationHref(id));
  },
});

registerAction({
  id: "conversation-rename",
  label: "Rename conversation",
  icon: Pencil,
  iconColor: "text-slate-500 dark:text-slate-400",
  category: "edit",
  supportedSources: ["chat-message"],
  renderSlot: "overflow",
  order: 24,
  requiresAuth: true,
  visible: hasConversation,
  run: (ctx) => {
    ctx.onClose();
    const id = conversationOf(ctx);
    if (id) openConversationRename(id, conversationTitleFromState(ctx.getState(), id));
  },
});

registerAction({
  id: "conversation-duplicate",
  label: "Duplicate conversation",
  icon: Copy,
  iconColor: "text-slate-500 dark:text-slate-400",
  category: "edit",
  supportedSources: ["chat-message"],
  renderSlot: "overflow",
  order: 25,
  requiresAuth: true,
  visible: hasConversation,
  run: async (ctx) => {
    ctx.onClose();
    const id = conversationOf(ctx);
    if (id) await duplicateConversationVerb(ctx.dispatch, id, { surfaceKey: ctx.surfaceKey ?? undefined });
  },
});
