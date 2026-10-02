// conversation-transfer-rows — THE catalogue of the whole conversation's
// Alchemy transfer set (Arman, 2026-09-26). Every Conversation menu renders
// these rows — the answer menu's Conversation section (rich-document handlers,
// every layout) and the chat header's conversation menu — so they can never
// offer different sets. Light on purpose (icons and labels only): the runner,
// `./conversation-transfer`, loads on click.
//
//   copy      plain text · Markdown · formatted
//   prepare   Copy for AI… — the preparation workspace (trim, choose messages, AI prep)
//   download  text · Markdown · web page · JSON · PDF · Word · EPUB
//   send      Notes · document · task · new chat · email

import {
  ClipboardCopy,
  ClipboardType,
  FileCode2,
  FileDown,
  FileJson,
  FileText,
  FileType,
  BookOpen,
  Globe,
  ListTodo,
  Mail,
  MessageSquarePlus,
  NotebookPen,
  FileStack,
  Type,
  type LucideIcon,
} from "lucide-react";

export type ConversationCopyFormat = "plain" | "markdown" | "rich-html";
export type ConversationDownloadFormat = "plain" | "markdown" | "html" | "json" | "pdf" | "docx" | "epub";
/** Alchemy destination action ids (AlchemyHost binds them: createMatrxTransferActions + email). */
export type ConversationDestination = "matrx:notes" | "matrx:document" | "matrx:task" | "matrx:chat" | "email-markdown";

interface RowBase {
  /** Stable action id (the answer menu registers it; the header uses it as its item id). */
  id: string;
  label: string;
  icon: LucideIcon;
  iconColor: string;
}
export type ConversationTransferRow =
  | (RowBase & { group: "copy"; format: ConversationCopyFormat })
  | (RowBase & { group: "prepare" })
  | (RowBase & { group: "download"; format: ConversationDownloadFormat })
  | (RowBase & { group: "send"; destination: ConversationDestination });

const SLATE = "text-slate-500 dark:text-slate-400";

export const CONVERSATION_TRANSFER_ROWS: readonly ConversationTransferRow[] = [
  { id: "conversation-copy-plain", group: "copy", format: "plain", label: "Copy conversation as plain text", icon: Type, iconColor: SLATE },
  { id: "conversation-copy-markdown", group: "copy", format: "markdown", label: "Copy conversation as Markdown", icon: FileCode2, iconColor: SLATE },
  { id: "conversation-copy-formatted", group: "copy", format: "rich-html", label: "Copy conversation formatted", icon: ClipboardType, iconColor: "text-indigo-500 dark:text-indigo-400" },
  { id: "conversation-copy-for-ai", group: "prepare", label: "Copy conversation for AI…", icon: ClipboardCopy, iconColor: "text-violet-500 dark:text-violet-400" },
  { id: "conversation-download-plain", group: "download", format: "plain", label: "Download conversation as text", icon: FileText, iconColor: SLATE },
  { id: "conversation-download-markdown", group: "download", format: "markdown", label: "Download conversation as Markdown", icon: FileCode2, iconColor: SLATE },
  { id: "conversation-download-html", group: "download", format: "html", label: "Download conversation as web page", icon: Globe, iconColor: "text-orange-500 dark:text-orange-400" },
  { id: "conversation-download-json", group: "download", format: "json", label: "Download conversation as JSON", icon: FileJson, iconColor: "text-amber-600 dark:text-amber-400" },
  { id: "conversation-download-pdf", group: "download", format: "pdf", label: "Download conversation as PDF", icon: FileDown, iconColor: "text-red-500 dark:text-red-400" },
  { id: "conversation-download-docx", group: "download", format: "docx", label: "Download conversation as Word", icon: FileType, iconColor: "text-blue-600 dark:text-blue-400" },
  { id: "conversation-download-epub", group: "download", format: "epub", label: "Download conversation as EPUB", icon: BookOpen, iconColor: "text-emerald-600 dark:text-emerald-400" },
  { id: "conversation-save-to-notes", group: "send", destination: "matrx:notes", label: "Save conversation to Notes", icon: NotebookPen, iconColor: "text-amber-500 dark:text-amber-400" },
  { id: "conversation-create-document", group: "send", destination: "matrx:document", label: "Create a document from conversation", icon: FileStack, iconColor: "text-sky-600 dark:text-sky-400" },
  { id: "conversation-create-task", group: "send", destination: "matrx:task", label: "Create a task from conversation", icon: ListTodo, iconColor: "text-green-600 dark:text-green-400" },
  { id: "conversation-open-in-new-chat", group: "send", destination: "matrx:chat", label: "Open conversation in a new chat", icon: MessageSquarePlus, iconColor: "text-teal-600 dark:text-teal-400" },
  { id: "conversation-email-to-me", group: "send", destination: "email-markdown", label: "Email conversation to me", icon: Mail, iconColor: "text-rose-500 dark:text-rose-400" },
];


export function conversationTransferRow(id: string): ConversationTransferRow | undefined {
  return CONVERSATION_TRANSFER_ROWS.find((r) => r.id === id);
}
