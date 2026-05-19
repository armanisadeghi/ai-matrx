// features/rich-document/actions/handlers/copy.ts
//
// Clipboard actions. All source-agnostic except `copy-with-thinking`
// which only makes sense for chat assistant messages (those have reasoning
// blocks; notes / prompts / artifacts don't).

import { Copy, FileText, FileType, Brain } from "lucide-react";
import { toast } from "sonner";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import { registerAction } from "../registry";
import { getErrorMessage } from "../utils";

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

registerAction({
  id: "copy-google-docs",
  label: "Copy for Google Docs",
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
      onSuccess: () => toast.success("Formatted for Google Docs"),
      onError: (error) =>
        toast.error(getErrorMessage(error, "Failed to copy for Docs")),
    });
  },
});

registerAction({
  id: "copy-word",
  label: "Copy for Word",
  icon: FileType,
  iconColor: "text-blue-600 dark:text-blue-400",
  category: "copy",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 2,
  run: async ({ content }) => {
    await copyToClipboard(content, {
      isMarkdown: true,
      formatForGoogleDocs: true,
      onSuccess: () => toast.success("Formatted for Microsoft Word"),
      onError: (error) =>
        toast.error(getErrorMessage(error, "Failed to copy for Word")),
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
  visible: (ctx) => {
    // Hide on user messages — only assistant turns carry thinking blocks.
    // We can't distinguish role from the source alone today; the chat
    // surface only mounts this action against assistant messages (the
    // legacy registry already lived under assistantOnlyItems). Once we
    // generalize role-awareness into a source extension we can tighten
    // this; for now we trust the consumer to omit/include via `exclude`.
    if (ctx.source.type !== "chat-message") return false;
    return true;
  },
  run: async ({ content }) => {
    await copyToClipboard(content, {
      isMarkdown: true,
      includeThinking: true,
      onSuccess: () => toast.success("Copied with thinking"),
      onError: (error) =>
        toast.error(getErrorMessage(error, "Failed to copy with thinking")),
    });
  },
});
