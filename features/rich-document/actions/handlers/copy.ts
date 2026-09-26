// features/rich-document/actions/handlers/copy.ts
//
// Clipboard actions. All source-agnostic except `copy-with-thinking`
// which only makes sense for chat assistant messages (those have reasoning
// blocks; notes / prompts / artifacts don't).

import { Copy, FileText, Brain } from "lucide-react";
import { toast } from "@/lib/toast";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import { registerAction } from "../provider";
import { extractFlatText } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { getErrorMessage, contentForDestination } from "../utils";

registerAction({
  id: "copy",
  label: "Copy text",
  icon: Copy,
  iconColor: "text-blue-500 dark:text-blue-400",
  category: "copy",
  supportedSources: "*",
  renderSlot: "both",
  order: 0,
  run: async ({ content }) => {
    await copyToClipboard(content, {
      onSuccess: () => toast.success("Copied"),
      onError: (error) =>
        toast.error(getErrorMessage(error, "Failed to copy")),
    });
  },
});

// ONE formatted copy (ALC-15, chair ruling on finding 5): "Copy for Google
// Docs" and "Copy for Word" wrote byte-identical clipboard content, so two
// rows offered a choice that did not exist. The rich clipboard skin pastes
// correctly into Docs, Word, Pages and email alike.
registerAction({
  id: "copy-formatted",
  label: "Copy formatted",
  icon: FileText,
  iconColor: "text-green-500 dark:text-green-400",
  category: "copy",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 1,
  run: async ({ content }) => {
    await copyToClipboard(content, {
      isMarkdown: true,
      formatForGoogleDocs: true,
      onSuccess: () => toast.success("Copied with formatting"),
      onError: (error) =>
        toast.error(getErrorMessage(error, "Failed to copy with formatting")),
    });
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
        ? ctx.getState().messages.byConversationId[ctx.source.conversationId]
            ?.byId?.[ctx.source.messageId]
        : undefined;
    const fullContent = record
      ? extractFlatText(record, { includeThinking: true })
      : contentForDestination(ctx);
    await copyToClipboard(fullContent, {
      isMarkdown: true,
      includeThinking: true,
      onSuccess: () => toast.success("Copied with thinking"),
      onError: (error) =>
        toast.error(getErrorMessage(error, "Failed to copy with thinking")),
    });
  },
});
