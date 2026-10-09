// features/rich-document/actions/handlers/copy.ts
//
// Clipboard actions. All source-agnostic except `copy-with-thinking`
// which only makes sense for chat assistant messages (those have reasoning
// blocks; notes / prompts / artifacts don't).

import { Copy, Brain } from "lucide-react";
import { copyRichContent } from "@ai-matrx/rich-content/copy/copy-commands";
import { registerAction } from "@ai-matrx/rich-content/rich-document/actions/provider";
import { extractFlatText } from "@ai-matrx/chat/agents/redux/execution-system/messages/messages.selectors";
import { chatStateOf, contentForDestination } from "../utils";
import { kindTextToMarkdown } from "@/features/content-ir/surfaces/kind-text-to-markdown";

// THE one-click Copy (Arman, 2026-10-04): formatted for Docs / Gmail AND the
// knob's plain flavor (`copy.default_flavor`, default markdown) for a plain
// field — one clipboard item, both flavors. "Copy markdown" and "Copy text"
// (transfer.ts) are the explicit choices, the top two rows of Copy as.
// "Copy formatted" and "Copy as rich text" are gone: this IS that copy.
registerAction({
  id: "copy",
  label: "Copy",
  icon: Copy,
  iconColor: "text-blue-500 dark:text-blue-400",
  category: "copy",
  supportedSources: "*",
  renderSlot: "both",
  order: 0,
  run: async (ctx) => {
    await copyRichContent(contentForDestination(ctx), "default");
  },
});

registerAction({
  id: "copy-with-thinking",
  label: "Copy with thinking",
  icon: Brain,
  iconColor: "text-purple-500 dark:text-purple-400",
  category: "copy",
  // Only chat assistant messages have reasoning traces — this action would
  // be no-op nonsense on notes / prompts / artifacts.
  supportedSources: ["chat-message"],
  renderSlot: "overflow",
  order: 3,
  // Only assistant turns carry reasoning traces.
  visible: (ctx) =>
    ctx.source.type === "chat-message" &&
    ctx.extensions?.type === "chat-message" &&
    ctx.extensions.role === "assistant",
  run: async (ctx) => {
    // The reasoning lives on the stored record, not in the rendered text —
    // read it from the store (the whole record, thinking included).
    const record =
      ctx.source.type === "chat-message"
        ? chatStateOf(ctx, ["messages"])?.messages.byConversationId[ctx.source.conversationId]
            ?.byId?.[ctx.source.messageId]
        : undefined;
    const fullContent = record
      ? kindTextToMarkdown(extractFlatText(record, { includeThinking: true }))
      : contentForDestination(ctx);
    await copyRichContent(fullContent, "default", { includeThinking: true, toast: "Copied with thinking" });
  },
});
