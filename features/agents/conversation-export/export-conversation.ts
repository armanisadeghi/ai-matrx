// export-conversation — download the WHOLE conversation as Markdown, HTML,
// PDF or Word. One Markdown source (`buildConversationMarkdown`); PDF, Word
// and HTML through `@ai-matrx/print/document` — the platform's ONE document
// exporter (a native Word file with real headings, tables and page numbers,
// not an HTML chunk; never a second DOCX generator in the app). Heavy modules
// load at click time.

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { unwrapKindEnvelopes } from "@/lib/markdown/plain-text";
import { loadFullConversationHistory } from "./load-full-history";
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
      // Envelopes are storage plumbing — a reader gets the table, not the tag.
      text: unwrapKindEnvelopes(extractFlatText(r)),
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

/** Page chrome a conversation prints with: its title on top, page numbers below. */
export function conversationDocumentSource(markdown: string, title: string): string {
  const safe = title.replace(/"/g, "'");
  return `---\ntitle: "${safe}"\nheader: "{title} | | {date}"\nfooter: "Page {page} of {pages}"\ndate: today\n---\n\n${markdown}`;
}

/**
 * Export EVERY message: older history is paged in first (with progress), and
 * a history that could not be fully read is said out loud — in the toast AND
 * at the top of the file — never passed off as the whole conversation.
 */
export async function exportConversation(
  dispatch: AppDispatch,
  getState: () => RootState,
  conversationId: string,
  format: ConversationExportFormat,
): Promise<void> {
  const toastId = toast.loading("Loading every message in this conversation…");
  const history = await loadFullConversationHistory(dispatch, getState, conversationId, (loaded) =>
    toast.loading(`Loading every message in this conversation… ${loaded} loaded`, { id: toastId }),
  );
  const built = conversationMarkdownFromState(getState(), conversationId);
  const { title, messageCount } = built;
  const markdown = history.complete
    ? built.markdown
    : built.markdown.replace(
        /\n/,
        "\n\n> Earlier messages could not be loaded, so this export starts part-way through the conversation.\n",
      );
  if (messageCount === 0) {
    toast.error("Nothing to export yet", { id: toastId, description: "This conversation has no messages." });
    return;
  }
  const base = fileSafe(title);
  toast.loading(`Preparing ${format.toUpperCase()} of ${messageCount} messages…`, { id: toastId });
  try {
    if (format === "md") {
      download(new Blob([markdown], { type: "text/markdown;charset=utf-8" }), `${base}.md`);
    } else {
      const [{ exportDocument }, { prepareDocumentMarkdown }, { drawDisplayMath }] = await Promise.all([
        import("@ai-matrx/print/document"),
        import("./document-markdown"),
        import("./draw-math"),
      ]);
      // Real tables, drawn formulas — never envelopes or raw `$$` (verify-RC-B9 F1).
      const prepared = await prepareDocumentMarkdown(markdown, { renderDisplayMath: drawDisplayMath });
      const exp = await exportDocument(conversationDocumentSource(prepared, title), format, {
        fileName: base,
      });
      download(new Blob([exp.bytes as BlobPart], { type: exp.mime }), exp.fileName);
    }
    if (history.complete) {
      toast.success(`Conversation exported (${messageCount} messages)`, { id: toastId });
    } else {
      toast.warning(`Exported ${messageCount} messages — earlier history could not be loaded`, {
        id: toastId,
        description: "The file says so at the top. Try again to include everything.",
      });
    }
  } catch (error) {
    console.error("[exportConversation] failed", { format, error });
    toast.error(`Couldn't export as ${format.toUpperCase()}`, {
      id: toastId,
      description: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
