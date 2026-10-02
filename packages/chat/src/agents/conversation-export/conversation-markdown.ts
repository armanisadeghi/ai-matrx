// conversation-markdown — the whole conversation as ONE Markdown document.
// Every export format is built from this text: .md as-is, .html/.pdf through
// @ai-matrx/print (the one markdown → document composition), .docx through the
// same rendered HTML. One source, so the formats never disagree.

export interface ExportableMessage {
  role: string;
  text: string;
  createdAt?: string | null;
  pinned?: boolean;
}

export interface ConversationMarkdownInput {
  title: string;
  messages: ExportableMessage[];
  /** Heading for assistant turns — the agent's name when known. */
  assistantLabel?: string;
  exportedAt?: Date;
}

function formatWhen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";
}

export function buildConversationMarkdown(input: ConversationMarkdownInput): string {
  const title = input.title.trim() || "Conversation";
  const assistant = input.assistantLabel?.trim() || "Assistant";
  const lines: string[] = [`# ${title}`, ""];
  if (input.exportedAt) {
    lines.push(`_Exported ${formatWhen(input.exportedAt.toISOString())}_`, "");
  }
  for (const m of input.messages) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const body = m.text.trim();
    if (!body) continue;
    const who = m.role === "user" ? "You" : assistant;
    lines.push(`## ${who}${m.pinned ? " (pinned)" : ""}`);
    const when = formatWhen(m.createdAt);
    if (when) lines.push(`_${when}_`);
    lines.push("", body, "", "---", "");
  }
  // Drop the trailing rule.
  while (lines.length && (lines[lines.length - 1] === "" || lines[lines.length - 1] === "---")) lines.pop();
  return `${lines.join("\n")}\n`;
}
