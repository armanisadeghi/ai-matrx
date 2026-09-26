// features/rich-document/actions/handlers/answer-tools.ts
//
// RC-B9 — acting on AI answers, registered in the ONE action registry:
//
//   chat-message source
//     pin-message             Pin / unpin (per person, platform.user_entity_state)
//     regenerate-response     Plain regenerate of the latest answer (no edit)
//     export-conversation-*   The whole conversation as MD / PDF / DOCX / HTML
//
//   code block (source "raw" + metadata.codeBlock — see ../../code-block/)
//     code-block-open-in-editor   Floating Monaco window, no navigation, no save
//     code-block-apply-to-file    Replace the open editor tab (only when one exists)
//     code-block-run              Run in the conversation's bound sandbox (only when bound)
//     code-block-chart            Chart a CSV / TSV block
//
// Every action is ABSENT where it cannot work (visible → false) — never dead.

import {
  FileCode2,
  FileDown,
  FileInput,
  FileText,
  FileType,
  Globe,
  Pin,
  PinOff,
  Play,
  RefreshCw,
  BarChart3,
  SquareArrowOutUpRight,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { registerAction } from "../provider";
import { chatIds, getErrorMessage } from "../utils";
import type { RichDocumentActionContext } from "../../types";
import {
  isMessagePinned,
  togglePinnedMessage,
} from "@/features/agents/message-pins/pinned-messages-store";
import { selectRegenerateAnchor } from "@/features/agents/redux/execution-system/message-crud/regenerate-anchor";
import type { ConversationExportFormat } from "@/features/agents/conversation-export/export-conversation";
import { readCodeBlockFacts, type CodeBlockFacts } from "../../code-block/code-block-context";
import { runCommandFor, runnableSandboxId } from "../../code-block/code-run";
import { chartableTypes, parseDelimitedTable } from "@/components/mardown-display/blocks/chart/table-chart";

// ─── Pin ────────────────────────────────────────────────────────────────────

registerAction({
  id: "pin-message",
  writesSource: true,
  label: (ctx) => {
    const { messageId } = chatIds(ctx);
    return messageId && isMessagePinned(messageId) ? "Unpin message" : "Pin message";
  },
  icon: Pin,
  iconColor: "text-amber-500 dark:text-amber-400",
  category: "save",
  supportedSources: ["chat-message"],
  renderSlot: "overflow",
  order: -10,
  requiresAuth: true,
  visible: (ctx) => Boolean(chatIds(ctx).messageId),
  run: async (ctx) => {
    ctx.onClose();
    const { messageId } = chatIds(ctx);
    if (!messageId) return;
    const pinnedNow = await togglePinnedMessage(messageId);
    if (pinnedNow) toast.success("Pinned", { description: "Find it with the Pinned filter above the chat." });
  },
});

// ─── Regenerate ─────────────────────────────────────────────────────────────

function isAssistant(ctx: RichDocumentActionContext): boolean {
  return ctx.extensions?.type === "chat-message" && ctx.extensions.role === "assistant";
}

/** Shared by the ⋯ menu action and the inline bar button. */
export async function confirmAndRegenerate(
  ctx: Pick<RichDocumentActionContext, "dispatch" | "getState">,
  conversationId: string,
  assistantMessageId: string,
): Promise<void> {
  const { confirm } = await import("@/components/dialogs/confirm/ConfirmDialogHost");
  const ok = await confirm({
    title: "Regenerate this answer?",
    description:
      "The current answer is archived (not deleted) and the agent answers the same question again. This runs the model again and uses credits.",
    confirmLabel: "Regenerate",
  });
  if (!ok) return;
  try {
    const { regenerateAnswer } = await import(
      "@/features/agents/redux/execution-system/message-crud/regenerate-answer"
    );
    await ctx.dispatch(regenerateAnswer({ conversationId, assistantMessageId })).unwrap();
  } catch (err) {
    console.error("[regenerate-response] failed", err);
    toast.error(getErrorMessage(err, "Couldn't regenerate the answer"));
  }
}

registerAction({
  id: "regenerate-response",
  writesSource: true,
  label: "Regenerate answer",
  icon: RefreshCw,
  iconColor: "text-violet-500 dark:text-violet-400",
  category: "edit",
  supportedSources: ["chat-message"],
  renderSlot: "overflow",
  order: 1,
  requiresAuth: true,
  visible: (ctx) => {
    if (!isAssistant(ctx)) return false;
    const { conversationId, messageId } = chatIds(ctx);
    if (!conversationId || !messageId) return false;
    return selectRegenerateAnchor(ctx.getState(), conversationId, messageId) !== null;
  },
  run: async (ctx) => {
    ctx.onClose();
    const { conversationId, messageId } = chatIds(ctx);
    if (!conversationId || !messageId) return;
    await confirmAndRegenerate(ctx, conversationId, messageId);
  },
});

// ─── Export the whole conversation ──────────────────────────────────────────

const EXPORTS: Array<{ format: ConversationExportFormat; label: string; icon: typeof FileText; color: string }> = [
  { format: "md", label: "Export conversation as Markdown", icon: FileCode2, color: "text-slate-500 dark:text-slate-400" },
  { format: "pdf", label: "Export conversation as PDF", icon: FileDown, color: "text-red-500 dark:text-red-400" },
  { format: "docx", label: "Export conversation as Word", icon: FileType, color: "text-blue-600 dark:text-blue-400" },
  { format: "html", label: "Export conversation as web page", icon: Globe, color: "text-orange-500 dark:text-orange-400" },
];

EXPORTS.forEach(({ format, label, icon, color }, i) => {
  registerAction({
    id: `export-conversation-${format}`,
    label,
    icon,
    iconColor: color,
    category: "export",
    supportedSources: ["chat-message"],
    renderSlot: "overflow",
    order: 30 + i,
    visible: (ctx) => Boolean(chatIds(ctx).conversationId),
    run: async (ctx) => {
      ctx.onClose();
      const { conversationId } = chatIds(ctx);
      if (!conversationId) return;
      const { exportConversation } = await import(
        "@/features/agents/conversation-export/export-conversation"
      );
      await exportConversation(ctx.dispatch, ctx.getState, conversationId, format);
    },
  });
});

// ─── Code block actions ─────────────────────────────────────────────────────

function codeFacts(ctx: RichDocumentActionContext): CodeBlockFacts | null {
  return readCodeBlockFacts(ctx.metadata);
}

function extensionFor(language: string): string {
  const map: Record<string, string> = {
    typescript: "ts", tsx: "tsx", javascript: "js", jsx: "jsx", python: "py", bash: "sh", shell: "sh",
    json: "json", html: "html", css: "css", sql: "sql", markdown: "md", yaml: "yml", go: "go", rust: "rs",
    java: "java", csharp: "cs", cpp: "cpp", c: "c", ruby: "rb", php: "php", swift: "swift", kotlin: "kt",
  };
  return map[language.toLowerCase()] ?? "txt";
}

registerAction({
  id: "code-block-open-in-editor",
  label: "Open in code editor",
  icon: SquareArrowOutUpRight,
  iconColor: "text-blue-600 dark:text-blue-400",
  category: "edit",
  supportedSources: ["raw"],
  renderSlot: "overflow",
  order: 0,
  visible: (ctx) => Boolean(codeFacts(ctx)?.code.trim()),
  run: (ctx) => {
    const facts = codeFacts(ctx);
    if (!facts) return;
    const language = facts.language || "plaintext";
    const name = `snippet.${extensionFor(language)}`;
    ctx.dispatch(
      openOverlay({
        overlayId: "codeEditorWindow",
        instanceId: `code-block-editor-${Date.now().toString(36)}`,
        data: {
          windowInstanceId: `code-block-editor-${Date.now().toString(36)}`,
          files: [{ name, path: name, language, content: facts.code }],
          title: facts.title ?? "Code from answer",
        },
      }),
    );
  },
});

type CodeTabsShape = {
  codeTabs?: {
    activeId: string | null;
    byId: Record<string, { id: string; name: string; content: string; readOnly?: boolean; kind?: string }>;
  };
};

function activeEditableTab(ctx: RichDocumentActionContext) {
  const tabs = (ctx.getState() as unknown as CodeTabsShape).codeTabs;
  const tab = tabs?.activeId ? tabs.byId[tabs.activeId] : null;
  if (!tab || tab.readOnly) return null;
  if (tab.kind && tab.kind !== "editor") return null;
  return tab;
}

registerAction({
  id: "code-block-apply-to-file",
  label: (ctx) => `Apply to ${activeEditableTab(ctx)?.name ?? "open file"}`,
  icon: FileInput,
  iconColor: "text-emerald-600 dark:text-emerald-400",
  category: "edit",
  supportedSources: ["raw"],
  renderSlot: "overflow",
  order: 1,
  // Only where a target file exists: an editable tab open in the /code
  // workspace (page or window). Elsewhere the action is absent.
  visible: (ctx) => Boolean(codeFacts(ctx)?.code.trim()) && activeEditableTab(ctx) !== null,
  run: async (ctx) => {
    const facts = codeFacts(ctx);
    const tab = activeEditableTab(ctx);
    if (!facts || !tab) return;
    const { confirm } = await import("@/components/dialogs/confirm/ConfirmDialogHost");
    const ok = await confirm({
      title: `Replace ${tab.name} with this code?`,
      description:
        "The open file's editor content is replaced with this block. Nothing is saved until you save the file, and Undo in the toast restores it.",
      confirmLabel: "Apply",
    });
    if (!ok) return;
    const { updateTabContent } = await import("@/features/code/redux/tabsSlice");
    const before = tab.content;
    ctx.dispatch(updateTabContent({ id: tab.id, content: facts.code, source: "ai" }));
    toast.success(`Applied to ${tab.name}`, {
      description: "Unsaved — save the file to keep it.",
      action: {
        label: "Undo",
        onClick: () => ctx.dispatch(updateTabContent({ id: tab.id, content: before, source: "ai-undo" })),
      },
    });
  },
});

function sandboxFor(ctx: RichDocumentActionContext, facts: CodeBlockFacts): string | null {
  if (!facts.conversationId) return null;
  const state = ctx.getState() as unknown as {
    conversations?: { byConversationId?: Record<string, { sandboxBinding?: Parameters<typeof runnableSandboxId>[0] }> };
  };
  return runnableSandboxId(state.conversations?.byConversationId?.[facts.conversationId]?.sandboxBinding ?? null);
}

registerAction({
  id: "code-block-run",
  label: (ctx) => {
    const facts = codeFacts(ctx);
    return facts ? `Run in sandbox (${runCommandFor(facts.language)?.split(" ")[0] ?? ""})` : "Run";
  },
  icon: Play,
  iconColor: "text-green-600 dark:text-green-400",
  category: "edit",
  supportedSources: ["raw"],
  renderSlot: "overflow",
  order: 2,
  // Present only where the platform can really execute: the conversation is
  // bound to a sandbox AND the language has an interpreter there.
  visible: (ctx) => {
    const facts = codeFacts(ctx);
    return Boolean(facts && facts.onRunResult && runCommandFor(facts.language) && sandboxFor(ctx, facts));
  },
  run: async (ctx) => {
    const facts = codeFacts(ctx);
    if (!facts?.onRunResult) return;
    const sandboxId = sandboxFor(ctx, facts);
    if (!sandboxId) return;
    facts.onRunResult({ status: "running" });
    try {
      const { runCodeInSandbox } = await import("../../code-block/code-run");
      const result = await runCodeInSandbox({ sandboxId, language: facts.language, code: facts.code });
      facts.onRunResult({ status: "done", result });
    } catch (err) {
      facts.onRunResult({ status: "error", message: getErrorMessage(err, "The sandbox did not run the code") });
    }
  },
});

registerAction({
  id: "code-block-chart",
  label: "Chart this data",
  icon: BarChart3,
  iconColor: "text-indigo-500 dark:text-indigo-400",
  category: "edit",
  supportedSources: ["raw"],
  renderSlot: "overflow",
  order: 3,
  visible: (ctx) => {
    const facts = codeFacts(ctx);
    if (!facts?.onToggleChart) return false;
    if (!/^(csv|tsv)$/i.test(facts.language)) return false;
    const table = parseDelimitedTable(facts.code);
    return Boolean(table && chartableTypes(table).length > 0);
  },
  run: (ctx) => codeFacts(ctx)?.onToggleChart?.(),
});
