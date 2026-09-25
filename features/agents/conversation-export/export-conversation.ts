// export-conversation — download the WHOLE conversation as Markdown, HTML,
// PDF or Word. One Markdown source (`buildConversationMarkdown`); HTML and PDF
// through @ai-matrx/print (the one markdown → document composition, the same
// path the per-message "Download as HTML/PDF" actions use); DOCX from the same
// rendered HTML. Heavy modules load at click time.

import type { RootState } from "@/lib/redux/store";
import { toast } from "@/lib/toast";
import { extractFlatText } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { selectConversationTitle } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { isMessagePinned } from "@/features/agents/message-pins/pinned-messages-store";
import { buildConversationMarkdown } from "./conversation-markdown";

export type ConversationExportFormat = "md" | "html" | "pdf" | "docx";

export const CONVERSATION_EXPORT_FORMATS: Array<{
  format: ConversationExportFormat;
  label: string;
}> = [
  { format: "md", label: "Markdown (.md)" },
  { format: "pdf", label: "PDF (.pdf)" },
  { format: "docx", label: "Word (.docx)" },
  { format: "html", label: "Web page (.html)" },
];

export function conversationMarkdownFromState(
  state: RootState,
  conversationId: string,
): { title: string; markdown: string; messageCount: number } {
  const entry = state.messages.byConversationId[conversationId];
  const records = entry ? entry.orderedIds.map((id) => entry.byId[id]).filter(Boolean) : [];
  const title = selectConversationTitle(conversationId)(state) || "Conversation";
  const messages = records
    .filter((r) => !r.deletedAt)
    .map((r) => ({
      role: String(r.role),
      text: extractFlatText(r),
      createdAt: r.createdAt ?? null,
      pinned: isMessagePinned(r.id),
    }));
  const markdown = buildConversationMarkdown({ title, messages, exportedAt: new Date() });
  return {
    title,
    markdown,
    messageCount: messages.filter((m) => m.text.trim() && (m.role === "user" || m.role === "assistant")).length,
  };
}

function fileSafe(name: string): string {
  return (
    name
      .replace(/[^\w\s-]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80) || "conversation"
  );
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportConversation(
  getState: () => RootState,
  conversationId: string,
  format: ConversationExportFormat,
): Promise<void> {
  const { title, markdown, messageCount } = conversationMarkdownFromState(getState(), conversationId);
  if (messageCount === 0) {
    toast.error("Nothing to export yet", { description: "This conversation has no messages." });
    return;
  }
  const base = fileSafe(title);
  const toastId = toast.loading(`Preparing ${format.toUpperCase()}…`);
  try {
    if (format === "md") {
      download(new Blob([markdown], { type: "text/markdown;charset=utf-8" }), `${base}.md`);
    } else if (format === "html") {
      const { renderMarkdownDocument } = await import("@ai-matrx/print/markdown");
      download(
        new Blob([renderMarkdownDocument(markdown, { title })], { type: "text/html;charset=utf-8" }),
        `${base}.html`,
      );
    } else if (format === "pdf") {
      const [{ markdownToPdfBlob }, { markdownToHtml, getMarkdownStylesheet }] = await Promise.all([
        import("@ai-matrx/print/pdf"),
        import("@ai-matrx/print/markdown"),
      ]);
      download(
        await markdownToPdfBlob(markdown, { convertToHtml: markdownToHtml, loadCss: getMarkdownStylesheet }),
        `${base}.pdf`,
      );
    } else {
      const [{ renderMarkdownDocument }, { buildDocxFromHtml }] = await Promise.all([
        import("@ai-matrx/print/markdown"),
        import("./docx"),
      ]);
      download(await buildDocxFromHtml(renderMarkdownDocument(markdown, { title }), title), `${base}.docx`);
    }
    toast.success(`Conversation exported (${messageCount} messages)`, { id: toastId });
  } catch (error) {
    console.error("[exportConversation] failed", { format, error });
    toast.error(`Couldn't export as ${format.toUpperCase()}`, {
      id: toastId,
      description: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
