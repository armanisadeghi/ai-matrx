// conversation-transfer — the WHOLE conversation as ONE Alchemy source, and
// the full Alchemy transfer set over it (Arman, 2026-09-26: "when you go to the
// conversation menu, you actually need to see a full alchemy set for it,
// including the export for ai").
//
// The rows every Conversation menu shows are ONE catalogue
// (`./conversation-transfer-rows`); this module RUNS a row:
//
//   copy / download   @ai-matrx/alchemy/operate — the one engine per format
//   prepare           the canonical preparation workspace (trim, choose messages, AI prep)
//   send              the Alchemy destination actions (Notes, document, task, new chat, email)
//
// The content is the ordered messages with their roles, read after EVERY
// message is paged in (`loadFullConversationHistory`); a history that could
// not be fully read says so at the top of what is produced, never passed off
// as the whole conversation. Bytes come from the one engine per format — the
// app builds no document, clipboard write or download of its own.

import type { ConversationTransferRow } from "./conversation-transfer-rows";
import type { Coverage, Payload, Section, Source } from "@ai-matrx/alchemy/operate";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { toast } from "@/lib/toast";
import { unwrapKindEnvelopes } from "@/lib/markdown/plain-text";
import { extractFlatText } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { selectConversationTitle } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { isMessagePinned } from "@/features/agents/message-pins/pinned-messages-store";
import { stripTurnTrust } from "@/features/education/tutor/turnTrust";
import { openAlchemySession } from "@/components/agent-copy/alchemy-session";
import { buildConversationMarkdown } from "./conversation-markdown";
import { documentMarkdown } from "./document-markdown";
import { loadFullConversationHistory } from "./load-full-history";

// ─── The one source ──────────────────────────────────────────────────────────

export interface ConversationMessageRow {
  role: "user" | "assistant";
  author: string;
  text: string;
  created_at: string | null;
  pinned: boolean;
}

export interface CapturedConversation {
  conversationId: string;
  title: string;
  /** False when older history could not be read (said at the top of every output). */
  complete: boolean;
  messages: ConversationMessageRow[];
  /** The ordered messages with roles as ONE Markdown transcript. */
  markdown: string;
  /** File-safe name stem. */
  fileBase: string;
}

const PARTIAL_NOTE =
  "> Earlier messages could not be loaded, so this starts part-way through the conversation.";

function fileSafe(name: string): string {
  return (
    name
      .replace(/[^\w\s-]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80) || "conversation"
  );
}

/** The conversation as it stands in the store (no paging). */
export function conversationFromState(
  state: RootState,
  conversationId: string,
  complete = true,
): CapturedConversation {
  const entry = state.messages.byConversationId[conversationId];
  const records = entry ? entry.orderedIds.map((id) => entry.byId[id]).filter(Boolean) : [];
  const title = selectConversationTitle(conversationId)(state) || "Conversation";
  const all = records
    .filter((r) => !r.deletedAt)
    .map((r) => ({
      role: String(r.role),
      // Envelopes and the tutor's trust comment are storage plumbing — a
      // reader gets the table, not the tag (the chat renderer drops both).
      text: stripTurnTrust(unwrapKindEnvelopes(extractFlatText(r))),
      createdAt: r.createdAt ?? null,
      pinned: isMessagePinned(r.id),
    }));
  const built = buildConversationMarkdown({ title, messages: all, exportedAt: new Date() });
  const markdown = complete ? built : built.replace(/\n/, `\n\n${PARTIAL_NOTE}\n`);
  const messages: ConversationMessageRow[] = all
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.text.trim())
    .map((m) => ({
      role: m.role as "user" | "assistant",
      author: m.role === "user" ? "You" : "Assistant",
      text: m.text.trim(),
      created_at: m.createdAt,
      pinned: m.pinned,
    }));
  return { conversationId, title, complete, messages, markdown, fileBase: fileSafe(title) };
}

/** Page in EVERY message first, with progress, then read the conversation. */
export async function captureConversation(
  dispatch: AppDispatch,
  getState: () => RootState,
  conversationId: string,
  onProgress?: (loaded: number) => void,
): Promise<CapturedConversation> {
  const history = await loadFullConversationHistory(dispatch, getState, conversationId, onProgress);
  return conversationFromState(getState(), conversationId, history.complete);
}

/** Page chrome a conversation prints with: its title on top, page numbers below. */
export function conversationDocumentSource(markdown: string, title: string): string {
  const safe = title.replace(/"/g, "'");
  return `---\ntitle: "${safe}"\nheader: "{title} | | {date}"\nfooter: "Page {page} of {pages}"\ndate: today\n---\n\n${markdown}`;
}

/** The structured twin: the ordered messages with their roles. */
export function conversationJson(conv: CapturedConversation): Payload {
  return {
    kind: "json",
    value: {
      title: conv.title,
      complete: conv.complete,
      messages: conv.messages.map((m) => ({ ...m })),
    },
  };
}

/**
 * One section per message: the preparation workspace's "choose messages". A
 * section is the message's character range of the transcript
 * (`/text/<start>-<end>`, @ai-matrx/alchemy prose sections), so every text
 * format of the prepared draft stays the transcript's own text — Markdown is
 * Markdown, never JSON — and an unticked message is gone from all of them.
 */
export function conversationSections(conv: CapturedConversation): Section[] {
  const text = conv.markdown;
  const starts: number[] = [];
  let cursor = 0;
  for (const m of conv.messages) {
    const at = text.indexOf(`\n## ${m.author}`, cursor);
    if (at === -1) return [];
    starts.push(at + 1);
    cursor = at + 1;
  }
  return conv.messages.map((m, i) => {
    const words = m.text.replace(/\s+/g, " ").slice(0, 60);
    const end = i + 1 < starts.length ? starts[i + 1]! : text.length;
    return {
      id: `message-${i + 1}`,
      label: `${i + 1}. ${m.author}: ${words}${m.text.length > 60 ? "…" : ""}`,
      path: `/text/${starts[i]}-${end}`,
      includedByDefault: true,
    };
  });
}

/**
 * The payload a format is built from: prose formats from the transcript (the
 * document formats with the page chrome), JSON from the structured messages.
 */
export function conversationPayloadFor(conv: CapturedConversation, format: string): Payload {
  if (format === "json" || format === "compact-json") return conversationJson(conv);
  const prose = documentMarkdown(conv.markdown);
  if (format === "pdf" || format === "docx" || format === "epub") {
    return { kind: "markdown", text: conversationDocumentSource(prose, conv.title) };
  }
  return { kind: "markdown", text: format === "html" ? prose : conv.markdown };
}

type Capture = () => Promise<CapturedConversation>;

/** An Alchemy `Source` over the captured conversation (one capture per session). */
function sourceOf(
  id: string,
  label: string,
  read: () => Promise<{ payload: Payload; sections?: Section[]; coverage?: Coverage }>,
): Source {
  return {
    id,
    label,
    capture: async ({ signal }) => {
      signal.throwIfAborted();
      const { payload, sections, coverage } = await read();
      signal.throwIfAborted();
      const { directSource } = await import("@ai-matrx/alchemy/operate");
      return directSource(payload, { id, sourceId: id, label, ...(sections ? { sections } : {}), ...(coverage ? { coverage } : {}) });
    },
  };
}

/** Everything a transfer session needs, over ONE lazily captured conversation. */
export function conversationTransferSources(conversationId: string, title: string, read: Capture) {
  let once: Promise<CapturedConversation> | null = null;
  const conv = () => (once ??= read());
  const key = `conversation:${conversationId}`;
  const primary = sourceOf(key, title, async () => ({ payload: { kind: "markdown", text: (await conv()).markdown } }));
  const formatSources = Object.fromEntries(
    (["plain", "markdown", "rich-html", "html", "json", "pdf", "docx", "epub"] as const).map((f) => [
      f,
      sourceOf(`${key}:${f}`, title, async () => ({ payload: conversationPayloadFor(await conv(), f) })),
    ]),
  );
  // Copy for AI: the transcript itself (text formats are real text), one
  // section per message, counted in messages.
  const chooseMessages = sourceOf(`${key}:choose`, title, async () => {
    const c = await conv();
    const n = c.messages.length;
    return {
      payload: { kind: "markdown", text: c.markdown },
      sections: conversationSections(c),
      coverage: { status: c.complete ? "complete" : "partial", included: n, total: c.complete ? n : null, unit: "message" },
    };
  });
  return { primary, formatSources, chooseMessages };
}

// ─── Running a row ───────────────────────────────────────────────────────────

export interface ConversationTransferHost {
  dispatch: AppDispatch;
  getState: () => RootState;
}

const MIME_LABEL: Record<string, string> = {
  plain: "text",
  markdown: "Markdown",
  "rich-html": "formatted text",
  html: "web page",
  json: "JSON",
  pdf: "PDF",
  docx: "Word",
  epub: "EPUB",
};

function outcomeError(outcome: { status: string; message?: string; reason?: string }): string | null {
  if (outcome.status === "error") return outcome.message ?? "It did not work. Try again.";
  return null;
}

/** Copy or download through the one engine per format. */
async function deliver(
  host: ConversationTransferHost,
  conversationId: string,
  mode: "copy" | "download",
  format: string,
): Promise<void> {
  const toastId = toast.loading("Loading every message in this conversation…");
  const signal = new AbortController().signal;
  const operate = import("@ai-matrx/alchemy/operate");
  let conv: CapturedConversation | null = null;
  const sealed = (async () => {
    conv = await captureConversation(host.dispatch, host.getState, conversationId, (loaded) =>
      toast.loading(`Loading every message in this conversation… ${loaded} loaded`, { id: toastId }),
    );
    if (conv.messages.length === 0) throw new Error("This conversation has no messages yet.");
    toast.loading(`Preparing ${MIME_LABEL[format] ?? format} of ${conv.messages.length} messages…`, { id: toastId });
    const { capture, createDraft, sealDraft, formatAdapter } = await operate;
    const { snapshot } = await capture(conversationPayloadFor(conv, format), signal);
    const adapter = formatAdapter(format);
    return sealDraft(createDraft(snapshot), format, { filename: `${conv.fileBase}.${adapter.extension}` }, signal);
  })();
  try {
    const { createDelivery } = await operate;
    const delivery = createDelivery();
    const outcome =
      mode === "copy"
        ? await delivery.copyPending(sealed, signal, { html: format === "rich-html" })
        : await delivery.download(await sealed, signal);
    await sealed.catch(() => undefined);
    const failed = outcomeError(outcome as { status: string; message?: string });
    if (failed) throw new Error(failed);
    const captured = conv as CapturedConversation | null;
    const count = captured?.messages.length ?? 0;
    const done = mode === "copy" ? `Conversation copied (${count} messages)` : `Conversation downloaded as ${MIME_LABEL[format] ?? format} (${count} messages)`;
    if (captured && !captured.complete) {
      toast.warning(`${done} — earlier history could not be loaded`, {
        id: toastId,
        description: "It says so at the top. Try again to include everything.",
      });
    } else {
      toast.success(done, { id: toastId });
    }
  } catch (error) {
    // The sealed promise's own failure is the real reason (a copy reports only "refused").
    const reason = await sealed.then(
      () => (error instanceof Error ? error.message : "Unknown error"),
      (e: unknown) => (e instanceof Error ? e.message : "Unknown error"),
    );
    toast.error(mode === "copy" ? "Couldn't copy the conversation" : `Couldn't download as ${MIME_LABEL[format] ?? format}`, {
      id: toastId,
      description: reason,
    });
  }
}

/** Run one catalogue row for a conversation. */
export async function runConversationTransfer(
  host: ConversationTransferHost,
  conversationId: string,
  row: ConversationTransferRow,
): Promise<void> {
  if (row.group === "copy") return deliver(host, conversationId, "copy", row.format);
  if (row.group === "download") return deliver(host, conversationId, "download", row.format);
  const title = selectConversationTitle(conversationId)(host.getState()) || "Conversation";
  const sources = conversationTransferSources(conversationId, title, () =>
    captureConversation(host.dispatch, host.getState, conversationId),
  );
  const opened = openAlchemySession({
    key: `conversation:${conversationId}:${Date.now()}`,
    label: title,
    // Copy for AI prepares the ordered messages with their roles, one section
    // per message — the workspace's "Sections" is how she chooses messages.
    // A destination sends the readable transcript.
    source: row.group === "prepare" ? sources.chooseMessages : sources.primary,
    formatSources: sources.formatSources,
    intent: row.group === "prepare" ? { kind: "prepare" } : { kind: "action", actionId: row.destination, label: row.label },
  });
  if (!opened) {
    toast.error(`${row.label} is not available here`, {
      description: "Open the conversation in the chat to use Alchemy with it.",
    });
  }
}
