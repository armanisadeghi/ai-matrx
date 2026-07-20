/**
 * messageActionRegistry — menu item factories for message action menus.
 *
 * Two entry points:
 *   - `getAssistantMessageActions(ctx)` — items for assistant-authored messages
 *     (edit content, fork, copy, export, save, etc.)
 *   - `getUserMessageActions(ctx)` — items for user-authored messages
 *     (edit & resubmit, fork at this question, copy, export, save, delete)
 *
 * Actions that mutate the conversation (edit, fork, delete) dispatch the
 * DB-faithful CRUD thunks from `features/agents/redux/execution-system/message-crud`
 * and round-trip through Supabase. Actions that don't touch the conversation
 * (copy, audio, export, notes, TTS) execute directly.
 *
 * Every action requires both `conversationId` and `messageId` (the server
 * `cx_message.id`). Items that can't run without those ids hide themselves.
 */

import {
  Copy,
  FileText,
  Eye,
  Globe,
  Brain,
  Edit,
  Send,
  Mail,
  Printer,
  ScanLine,
  Bug,
  Megaphone,
  Settings,
  GitBranch,
  GitFork,
  FileType,
  Activity,
  BarChart3,
  Trash2,
  EyeOff,
  Scissors,
  Undo2,
  ListFilter,
  History,
  Layers,
  Boxes,
} from "lucide-react";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import {
  NotesRouteIcon,
  TasksRouteIcon,
  DocumentsRouteIcon,
  FilesRouteIcon,
  CodeRouteIcon,
} from "@/components/branding/RouteFaviconIcon";
import { fileHandler } from "@/features/files";
import { printMarkdownContent } from "@/features/conversation/utils/markdown-print";
import { loadWordPressCSS } from "@/features/html-pages/css/wordpress-styles";
import { NotesAPI } from "@/features/notes/service/notesApi";
import { CodeFilesAPI } from "@/features/code-files/service/codeFilesApi";
import { setPendingSource } from "@/features/tasks/redux/taskUiSlice";
import { toast } from "@/lib/toast";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { createFullScreenEditorCallbackGroup } from "@/features/overlays/callbacks/fullScreenEditor";
import type { MenuItem } from "@/components/official/AdvancedMenu";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import type { Json } from "@/types/database.types";
import {
  extractFlatText,
  selectMessagePosition,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { selectConversationTitle } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { CHAT_SAVES_FOLDER } from "@/features/notes/constants/defaultFolders";
import { buildConversationMessageTitle } from "@/features/agents/utils/conversation-message-title";
import { buildTaskSeedFromMessage } from "./buildTaskSeedFromMessage";
import { openAssistantMessageEditor } from "./openAssistantMessageEditor";
import { hasConvertibleContent } from "./convertibleContent";
import { messageMayContainKindBlock } from "@/features/content-ir/studio/message-kind-gate";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { shapeInstancesHref } from "@/features/content-ir/studio/constants";

const PENDING_ACTION_KEY = "matrx_pending_post_auth_action";

// ============================================================================
// CONTEXT
// ============================================================================

export interface MessageActionContext {
  /** Flat-text rendering of the message (for copy/print/email). */
  content: string;
  /**
   * Aggregated flat text of the ENTIRE multi-iteration assistant turn, when
   * the host bar rendered one (AssistantTurnGroup). Consumption-only actions
   * (copy, save, export, create-task) prefer `turnContent ?? content` so they
   * match what the user reads on screen. Actions that WRITE BACK to the
   * message (edit content, HTML preview save) must keep using `content` —
   * they mutate a single `cx_message` row.
   */
  turnContent?: string | null;
  /** Is the viewer signed in? Gates auth-required actions. */
  isAuthenticated: boolean;
  /** Server `cx_message.id`. Required for any mutation path; null hides those items. */
  messageId: string | null;
  /** Server `cx_conversation.id`. Required for any mutation path; null hides those items. */
  conversationId: string | null;
  /** `cx_message.metadata` — arbitrary JSON; included in saves and exports. */
  metadata: Record<string, unknown> | null;
  dispatch: AppDispatch;
  /** Store snapshot reader — used for synchronous state reads (e.g. resolving a forked message's id). */
  getState: () => RootState;
  onClose: () => void;

  /** True when the renderer has a full-page print handler ready. */
  showFullPrint: boolean;
  onFullPrint?: () => void;
  isCapturing?: boolean;

  /**
   * True only when the viewer owns the agent definition that authored the
   * conversation. Creator-only debugging / analysis items (stream debug,
   * response analysis) are hidden otherwise.
   */
  isCreator: boolean;
  /**
   * The request that produced this message — comes from
   * `MessageRecord._streamRequestId`. `null` on messages from a previous
   * session (activeRequests is in-memory only), or on user messages. When
   * null, creator panels fall back to the latest request for the
   * conversation.
   */
  streamRequestId: string | null;
  /**
   * UI surface this action menu belongs to. Used to route fork / delete
   * outcomes through the surfaces registry so the right kind of state
   * update happens (URL replace for pages, focus update for windows /
   * widgets). `null` disables surface-aware navigation.
   */
  surfaceKey: string | null;
  /**
   * Optional callback fired when an action wants to open the
   * destructive-vs-fork dialog for this message. Provided by the host
   * action bar (which owns the dialog state). When omitted, destructive
   * actions fall through to a direct delete with no fork option.
   */
  onRequestDelete?: () => void;
  /**
   * Optional callback fired when the user wants to view + restore prior
   * versions of this message (cx_message.content_history). Owned by the
   * host action bar so the dialog survives `MessageOptionsMenu` close.
   * When omitted, the menu item is hidden.
   */
  onRequestEditHistory?: () => void;
  /** Number of archived versions in cx_message.content_history. */
  contentHistoryCount: number;
  /**
   * Optional callback fired when the user picks "Convert to flashcards /
   * quiz" on an assistant message (the ratified click-to-convert pattern —
   * content starts generic markdown, converts on explicit click). The host
   * action bar owns the ConvertContentDialog (the ONE convert-source dialog,
   * features/education/convert) so it survives this menu closing. Omitted →
   * the item hides.
   */
  onRequestConvert?: () => void;
  /**
   * True when the viewer is a super admin. Gates the "Server API (test)"
   * section that exposes the new Python-backed conversation endpoints
   * (`/cx/conversations/{id}/fork`, `.../messages/delete`, etc.) as
   * one-click items so we can A/B them against the legacy Supabase RPCs
   * before consolidating. Hidden for everyone else.
   */
  isAdmin: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string") return error || fallback;
  if (error && typeof error === "object") {
    // `createAsyncThunk`'s `rejectWithValue({ message })` surfaces the
    // payload as-is on `.unwrap()` rejection; Supabase `PostgrestError`
    // also lives on error objects with non-enumerable keys.
    const e = error as Record<string, unknown>;
    const msg =
      (typeof e.message === "string" && e.message) ||
      (typeof e.details === "string" && e.details) ||
      (typeof e.hint === "string" && e.hint) ||
      null;
    if (msg) return msg;
  }
  return fallback;
}

function requireAuth(
  ctx: MessageActionContext,
  actionKey: string,
  featureName: string,
  description: string,
): boolean {
  if (!ctx.isAuthenticated) {
    try {
      sessionStorage.setItem(
        PENDING_ACTION_KEY,
        // Save the TURN text — consumption actions operate on the whole turn,
        // so the resumed action must too (the resume caller passes the same
        // turn-preferred text for the equality check).
        JSON.stringify({
          action: actionKey,
          savedContent: ctx.turnContent ?? ctx.content,
        }),
      );
    } catch {
      /* ignore */
    }
    ctx.dispatch(
      openOverlay({
        overlayId: "authGate",
        data: { featureName, featureDescription: description },
      }),
    );
    return false;
  }
  return true;
}

function wrapTextAsContent(text: string): Json {
  return [{ type: "text", text }];
}

/**
 * Canonical title for anything created from this message —
 * "{conversation title} Message {n}" via the shared builder. `undefined`
 * when the conversation is unlabeled; callers fall back per destination.
 */
function deriveMessageTitle(ctx: MessageActionContext): string | undefined {
  const state = ctx.getState();
  const conversationTitle = ctx.conversationId
    ? selectConversationTitle(ctx.conversationId)(state)
    : null;
  const messagePosition =
    ctx.conversationId && ctx.messageId
      ? selectMessagePosition(ctx.conversationId, ctx.messageId)(state)
      : undefined;
  return buildConversationMessageTitle(conversationTitle, messagePosition);
}

/** Filesystem-safe filename fragment from a derived title. */
function toSafeFileName(title: string): string {
  return title.replace(/[\\/:*?"<>|]+/g, "-").trim();
}

/**
 * Extract the first fenced code block from a markdown string (```lang\n…\n```).
 * Returns the raw code and, if present, the detected language. When the
 * content is already plain (no fence), falls back to the full content.
 */
function extractFirstCodeBlock(content: string): {
  code: string;
  language?: string;
} {
  const match = content.match(/```([\w.+-]+)?\s*\n([\s\S]*?)```/);
  if (!match) return { code: content };
  return {
    code: match[2] ?? "",
    language: match[1]?.toLowerCase() || undefined,
  };
}

// ============================================================================
// SHARED ITEMS — apply to both user and assistant messages
// ============================================================================

function copyItems(ctx: MessageActionContext): MenuItem[] {
  // Copy matches what the user reads — the whole turn, like the bar's Copy.
  const content = ctx.turnContent ?? ctx.content;
  return [
    {
      key: "copy-plain",
      icon: Copy,
      iconColor: "text-blue-500 dark:text-blue-400",
      label: "Copy text",
      action: async () => {
        await copyToClipboard(content, {
          onSuccess: () => {},
          onError: (error) => {
            throw new Error(getErrorMessage(error, "Failed to copy text"));
          },
        });
      },
      category: "Copy",
      successMessage: "Copied",
      errorMessage: "Failed to copy",
    },
    {
      key: "copy-docs",
      icon: FileText,
      iconColor: "text-green-500 dark:text-green-400",
      label: "Copy for Google Docs",
      action: async () => {
        await copyToClipboard(content, {
          isMarkdown: true,
          formatForGoogleDocs: true,
          onSuccess: () => {},
          onError: (error) => {
            throw new Error(getErrorMessage(error, "Failed to copy for Docs"));
          },
        });
      },
      category: "Copy",
      successMessage: "Formatted for Google Docs",
      errorMessage: "Failed to copy",
    },
    {
      key: "copy-word",
      icon: FileType,
      iconColor: "text-blue-600 dark:text-blue-400",
      label: "Copy for Word",
      action: async () => {
        await copyToClipboard(content, {
          isMarkdown: true,
          formatForGoogleDocs: true,
          onSuccess: () => {},
          onError: (error) => {
            throw new Error(getErrorMessage(error, "Failed to copy for Word"));
          },
        });
      },
      category: "Copy",
      successMessage: "Formatted for Microsoft Word",
      errorMessage: "Failed to copy",
    },
  ];
}

function actionsItems(ctx: MessageActionContext): MenuItem[] {
  const {
    content,
    conversationId,
    messageId,
    metadata,
    isAuthenticated,
    dispatch,
    onClose,
    showFullPrint,
    onFullPrint,
    isCapturing,
  } = ctx;
  // Actions consume the whole turn; `content` stays single-message for the
  // HTML publish flow because its Save writes back to this one cx_message row.
  const turnText = ctx.turnContent ?? content;

  // Publish HTML and Share as webpage are the SAME flow presented two ways —
  // one opener so they can never drift.
  const openHtmlPublish = () => {
    // No `onSave` in data — a function can't survive Redux. The
    // HtmlPreviewBridge self-handles the markdown save via `editMessage`
    // from the conversationId + messageId we pass here.
    dispatch(
      openOverlay({
        overlayId: "htmlPreview",
        instanceId: `html-preview-${messageId ?? "default"}`,
        data: {
          content,
          messageId: messageId ?? undefined,
          conversationId: conversationId ?? undefined,
          title: "HTML Preview & Publishing",
          description: "Edit markdown, preview HTML, and publish your content",
          showSaveButton: Boolean(conversationId && messageId),
          isAgentSystem: true,
        },
      }),
    );
    onClose();
  };

  const items: MenuItem[] = [
    {
      key: "add-to-tasks",
      icon: TasksRouteIcon,
      label: "Create Task",
      action: () => {
        if (
          !requireAuth(
            ctx,
            "add-to-tasks",
            "Create task",
            "Sign in to create and track tasks from your messages.",
          )
        )
          return;
        const state = ctx.getState();
        const conversationTitle = ctx.conversationId
          ? selectConversationTitle(ctx.conversationId)(state)
          : null;
        const messagePosition =
          ctx.conversationId && ctx.messageId
            ? selectMessagePosition(ctx.conversationId, ctx.messageId)(state)
            : undefined;

        dispatch(
          setPendingSource(
            buildTaskSeedFromMessage({
              content: turnText,
              messageId: ctx.messageId,
              conversationId: ctx.conversationId,
              conversationTitle,
              messagePosition,
              metadata: ctx.metadata,
            }),
          ),
        );
        onClose();
      },
      category: "Actions",
      showToast: false,
    },
    {
      key: "set-context-value",
      icon: Layers,
      iconColor: "text-emerald-500 dark:text-emerald-400",
      label: "Set Context Value",
      action: () => {
        if (
          !requireAuth(
            ctx,
            "set-context-value",
            "Set context value",
            "Sign in to save message content into a scope's context item.",
          )
        )
          return;
        dispatch(
          openOverlay({
            overlayId: "setContextValueWindow",
            data: { initialContent: turnText },
          }),
        );
        onClose();
      },
      category: "Actions",
      showToast: false,
    },
    {
      key: "html-preview",
      icon: Eye,
      iconColor: "text-indigo-500 dark:text-indigo-400",
      label: "Publish HTML",
      action: openHtmlPublish,
      category: "Actions",
      showToast: false,
    },
    {
      key: "share-webpage",
      icon: Globe,
      iconColor: "text-teal-500 dark:text-teal-400",
      label: "Share as webpage",
      action: async () => {
        if (
          !requireAuth(
            ctx,
            "share-webpage",
            "Share as webpage",
            "Sign in to publish this response as a public webpage.",
          )
        )
          return;
        onClose();
        const toastId = toast.loading("Publishing webpage…");
        try {
          const { shareMessageAsWebpage } =
            await import("./shareMessageAsWebpage");
          const { url } = await shareMessageAsWebpage({
            content: turnText,
            title: deriveMessageTitle(ctx) ?? "Shared AI response",
            messageId,
            conversationId,
          });
          let copied = false;
          try {
            await navigator.clipboard.writeText(url);
            copied = true;
          } catch {
            /* clipboard can be blocked; the toast still links the page */
          }
          toast.success(
            copied ? "Public link copied to clipboard" : "Webpage published",
            {
              id: toastId,
              description: url,
              action: {
                label: "Open",
                onClick: () =>
                  window.open(url, "_blank", "noopener,noreferrer"),
              },
            },
          );
        } catch (err) {
          toast.error("Failed to publish webpage", {
            id: toastId,
            description: getErrorMessage(err, "Unknown error"),
          });
        }
      },
      category: "Actions",
      showToast: false,
    },
    {
      key: "copy-html",
      icon: Globe,
      iconColor: "text-orange-500 dark:text-orange-400",
      label: "Copy HTML page",
      action: async () => {
        await copyToClipboard(turnText, {
          isMarkdown: true,
          formatForWordPress: true,
          showHtmlPreview: true,
          onShowHtmlPreview: async (filteredHtml) => {
            const cssContent = await loadWordPressCSS();
            const html = `<!DOCTYPE html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>Content</title><style>${cssContent}</style></head><body>${filteredHtml}</body></html>`;
            await copyToClipboard(html, {
              onSuccess: () => {},
              onError: () => {},
            });
          },
          onSuccess: () => {},
          onError: (error) => {
            throw new Error(getErrorMessage(error, "Failed to copy HTML"));
          },
        });
      },
      // Grouped with the other clipboard actions.
      category: "Copy",
      successMessage: "HTML page copied",
      errorMessage: "Failed to copy HTML",
    },
    {
      key: "email-to-me",
      icon: Mail,
      iconColor: "text-sky-500 dark:text-sky-400",
      label: "Email to me",
      action: async () => {
        if (!isAuthenticated) {
          dispatch(
            openOverlay({
              overlayId: "emailDialog",
              data: {
                content: turnText,
                metadata: metadata ?? null,
              },
            }),
          );
          return;
        }
        const response = await fetch("/api/chat/email-response", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: turnText,
            metadata: { ...metadata, timestamp: new Date().toLocaleString() },
          }),
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.msg || "Failed to send email");
        onClose();
      },
      category: "Actions",
      successMessage: "Email sent!",
      errorMessage: "Failed to send email",
    },
    {
      key: "print",
      icon: Printer,
      iconColor: "text-slate-500 dark:text-slate-400",
      label: "Print",
      action: () => {
        printMarkdownContent(turnText, "Message");
        onClose();
      },
      category: "Actions",
      showToast: false,
    },
  ];

  if (showFullPrint && onFullPrint) {
    items.push({
      key: "full-print",
      icon: ScanLine,
      iconColor: "text-slate-600 dark:text-slate-300",
      label: isCapturing ? "Generating PDF…" : "Full Print (all blocks)",
      action: () => {
        if (!isCapturing) {
          onFullPrint();
          onClose();
        }
      },
      disabled: isCapturing,
      category: "Actions",
      showToast: false,
    });
  }

  return items;
}

function saveAsItems(ctx: MessageActionContext): MenuItem[] {
  const { conversationId, messageId, dispatch, onClose } = ctx;
  // Save destinations open a refine editor (or save verbatim) — seed the whole
  // turn rather than silently dropping earlier iterations.
  const content = ctx.turnContent ?? ctx.content;
  const saveCodeInstanceId = messageId
    ? `save-code-${messageId}`
    : `save-code-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return [
    {
      key: "save-as-note",
      icon: NotesRouteIcon,
      label: "Note",
      action: () => {
        if (
          !requireAuth(
            ctx,
            "save-as-note",
            "Save as Note",
            "Sign in to save this response as a note.",
          )
        )
          return;

        dispatch(
          openOverlay({
            overlayId: "quickNoteSaveWindow",
            data: {
              initialContent: content,
              defaultFolder: CHAT_SAVES_FOLDER,
              defaultNoteName: deriveMessageTitle(ctx),
              initialEditorMode: undefined,
            },
          }),
        );
        onClose();
      },
      category: "Save as",
      showToast: false,
      hidden: !conversationId || !messageId,
    },
    {
      key: "add-docs",
      icon: DocumentsRouteIcon,
      label: "Document",
      action: async () => {
        if (
          !requireAuth(
            ctx,
            "add-docs",
            "Save as Document",
            "Sign in to save this response as a document.",
          )
        )
          return;
        // Lazy-import so Univer (heavy) stays out of the chat bundle until used.
        const { pushMarkdownToDocument } =
          await import("@/features/data-tables/export-targets");
        const res = await pushMarkdownToDocument(
          content,
          deriveMessageTitle(ctx),
        );
        if (!res.ok || !res.href) {
          // showToast is false on this item, so AdvancedMenu won't surface a
          // thrown error — toast it ourselves.
          toast.error("Failed to create document", { description: res.error });
          return;
        }
        const href = res.href;
        toast.success("Saved as Document", {
          description: "Your content is ready as a normal document.",
          action: {
            label: "Open",
            onClick: () => window.open(href, "_blank", "noopener,noreferrer"),
          },
        });
        onClose();
      },
      category: "Save as",
      showToast: false,
      errorMessage: "Failed to create document",
    },
    {
      key: "save-file",
      icon: FileText,
      iconColor: "text-slate-500 dark:text-slate-400",
      label: "Markdown",
      action: () => {
        const title = deriveMessageTitle(ctx);
        const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const name = title ? toSafeFileName(title) : `message-${ts}`;
        const blob = new Blob([content], {
          type: "text/markdown;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${name}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        onClose();
      },
      category: "Save as",
      successMessage: "Markdown downloaded!",
      errorMessage: "Failed to save file",
    },
    {
      key: "save-to-code",
      icon: CodeRouteIcon,
      label: "Code",
      action: () => {
        if (
          !requireAuth(
            ctx,
            "save-to-code",
            "Save as Code",
            "Sign in to save and organize your code snippets.",
          )
        )
          return;
        const { code, language } = extractFirstCodeBlock(content);
        dispatch(
          openOverlay({
            overlayId: "saveToCode",
            instanceId: saveCodeInstanceId,
            data: {
              initialContent: code.trim() ? code : content,
              initialLanguage: language ?? "plaintext",
              suggestedName: undefined,
              defaultFolderId: null,
            },
          }),
        );
      },
      category: "Save as",
      showToast: false,
    },
    {
      key: "save-as-file",
      icon: FilesRouteIcon,
      label: "File",
      action: async () => {
        if (
          !requireAuth(
            ctx,
            "save-as-file",
            "Save as File",
            "Sign in to save this response into your files.",
          )
        )
          return;
        const title = deriveMessageTitle(ctx);
        const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const name = title ? toSafeFileName(title) : `message-${ts}`;
        const file = new File([content], `${name}.md`, {
          type: "text/markdown",
        });
        const uploaded = await fileHandler.upload(
          { kind: "file", file },
          { folderPath: "Chat Saves" },
        );
        const fileId = uploaded.fileId;
        toast.success("Saved to Files", {
          description: `${name}.md in Chat Saves`,
          action: fileId
            ? {
                label: "Open",
                onClick: () =>
                  window.open(
                    `/files/f/${fileId}`,
                    "_blank",
                    "noopener,noreferrer",
                  ),
              }
            : undefined,
        });
        onClose();
      },
      category: "Save as",
      showToast: false,
      errorMessage: "Failed to save file",
    },
    {
      key: "save-code-scratch",
      icon: CodeRouteIcon,
      label: "Scratch Code",
      action: async () => {
        if (
          !requireAuth(
            ctx,
            "save-code-scratch",
            "Save as Scratch Code",
            "Sign in to save code snippets to your code files.",
          )
        )
          return;
        const { code, language } = extractFirstCodeBlock(content);
        if (!code.trim()) throw new Error("No code to save");
        await CodeFilesAPI.create({
          name: `snippet-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${
            language === "typescript"
              ? "ts"
              : language === "javascript"
                ? "js"
                : language === "python"
                  ? "py"
                  : "txt"
          }`,
          language: language ?? "plaintext",
          content: code,
          tags: [],
        });
      },
      category: "Save as",
      successMessage: "Saved code to Scratch!",
      errorMessage: "Failed to save code",
    },
    {
      key: "save-scratch",
      icon: NotesRouteIcon,
      label: "Scratch Note",
      action: async () => {
        if (
          !requireAuth(
            ctx,
            "save-scratch",
            "Save as Scratch Note",
            "Sign in to save notes to your Scratch folder.",
          )
        )
          return;
        // Identical to Save as Note, minus the questions: folder is Scratch,
        // title auto-derived, saved immediately.
        await NotesAPI.create({
          label: deriveMessageTitle(ctx) ?? "New Note",
          content,
          folder_name: "Scratch",
          tags: [],
        });
      },
      category: "Save as",
      successMessage: "Saved to Scratch!",
      errorMessage: "Failed to save",
    },
    {
      key: "save-as-pdf",
      icon: FileType,
      iconColor: "text-red-500 dark:text-red-400",
      label: "PDF Document",
      action: async () => {
        if (
          !requireAuth(
            ctx,
            "save-as-pdf",
            "Save as PDF Document",
            "Sign in to save this response as a PDF in your files.",
          )
        )
          return;
        onClose();
        const toastId = toast.loading("Generating PDF…");
        try {
          // Markdown → styled offscreen render → multi-page PDF blob.
          const { markdownToPdfBlob } =
            await import("@/lib/block-print/markdown-pdf");
          const blob = await markdownToPdfBlob(content);

          const title = deriveMessageTitle(ctx);
          const ts = new Date()
            .toISOString()
            .replace(/[:.]/g, "-")
            .slice(0, 19);
          const name = title ? toSafeFileName(title) : `message-${ts}`;
          const file = new File([blob], `${name}.pdf`, {
            type: "application/pdf",
          });
          const uploaded = await fileHandler.upload(
            { kind: "file", file },
            { folderPath: "Chat Saves" },
          );
          const fileId = uploaded.fileId;
          toast.success("PDF saved to Files", {
            id: toastId,
            description: `${name}.pdf in Chat Saves`,
            action: fileId
              ? {
                  label: "Open",
                  onClick: () =>
                    window.open(
                      `/files/f/${fileId}`,
                      "_blank",
                      "noopener,noreferrer",
                    ),
                }
              : undefined,
          });
        } catch (err) {
          toast.error("Failed to create PDF", {
            id: toastId,
            description: getErrorMessage(err, "Unknown error"),
          });
        }
      },
      category: "Save as",
      showToast: false,
    },
  ];
}

function appItems(ctx: MessageActionContext): MenuItem[] {
  const { dispatch, onClose } = ctx;
  return [
    {
      key: "submit-feedback",
      icon: Bug,
      iconColor: "text-orange-500 dark:text-orange-400",
      label: "Submit feedback",
      action: () => {
        dispatch(openOverlay({ overlayId: "feedbackDialog", data: null }));
        onClose();
      },
      category: "App",
      showToast: false,
    },
    {
      key: "announcements",
      icon: Megaphone,
      iconColor: "text-purple-500 dark:text-purple-400",
      label: "Announcements",
      action: () => {
        dispatch(openOverlay({ overlayId: "announcements" }));
        onClose();
      },
      category: "App",
      showToast: false,
    },
    {
      key: "user-preferences",
      icon: Settings,
      iconColor: "text-slate-500 dark:text-slate-400",
      label: "Preferences",
      action: () => {
        dispatch(openOverlay({ overlayId: "userPreferences", data: null }));
        onClose();
      },
      category: "App",
      showToast: false,
    },
  ];
}

// ============================================================================
// EDIT-PATH ITEMS — differ by role
// ============================================================================

/**
 * Edit the assistant message in-place — via `openAssistantMessageEditor`, the
 * SAME opener the action-bar pencil uses (`mode: "assistant-message"`, same
 * instance id, same save contract):
 *   - On save, the OverlayController self-handles via `editMessage`
 *     (cx_message_edit RPC). No callback rides `openOverlay` data — passing an
 *     `onSave` function through Redux is the bug that silently broke every
 *     editor save (see features/overlays/callbacks/fullScreenEditor.ts).
 *   - `editMessage` marks the conversation's cache-bypass flag so the next AI
 *     turn sees the updated content.
 */
function editContentItem(ctx: MessageActionContext): MenuItem {
  const { content, conversationId, messageId, metadata, dispatch, onClose } =
    ctx;
  return {
    key: "edit-content",
    icon: Edit,
    iconColor: "text-emerald-500 dark:text-emerald-400",
    label: "Edit content",
    action: () => {
      // Shared opener — identical contract (mode, instance, save path) to the
      // action-bar pencil, so the two edit entry points can never drift.
      openAssistantMessageEditor(dispatch, {
        content,
        conversationId,
        messageId,
        metadata,
      });
      onClose();
    },
    category: "Edit",
    showToast: false,
    hidden: !conversationId || !messageId,
  };
}

/**
 * USER MESSAGES ONLY — edit the prompt and choose an outcome from the editor
 * footer (Save only / Save & resubmit / Fork & resubmit). Opens the SAME
 * three-outcome editor as the inline `UserActionBar` pencil + paper-plane
 * buttons — one shared definition (`USER_EDIT_ACTIONS` + `routeUserEditAction`)
 * drives all three surfaces so they can't drift, and there's no follow-up
 * confirmation dialog. `onAction` rides the callback group (a function can't
 * travel through `openOverlay` data); the group auto-disposes on save
 * (removeAfterTrigger), a cancel-without-save leaks one tiny group.
 */
function editAndResubmitUserItem(ctx: MessageActionContext): MenuItem {
  const {
    content,
    conversationId,
    messageId,
    metadata,
    surfaceKey,
    dispatch,
    onClose,
  } = ctx;
  return {
    key: "edit-resubmit",
    icon: Send,
    iconColor: "text-cyan-500 dark:text-cyan-400",
    label: "Edit & resubmit",
    action: async () => {
      onClose();
      if (!conversationId || !messageId) return;
      const { USER_EDIT_ACTIONS, routeUserEditAction } =
        await import("./userEditActions");
      const { callbackGroupId } = createFullScreenEditorCallbackGroup({
        onAction: (actionId, newContent) => {
          void routeUserEditAction(dispatch, {
            actionId,
            conversationId,
            messageId,
            newContent,
            surfaceKey,
          });
        },
      });
      dispatch(
        openOverlay({
          overlayId: "fullScreenEditor",
          instanceId: `user-edit-${messageId}`,
          data: {
            content,
            mode: "free",
            conversationId,
            messageId,
            callbackGroupId,
            primaryActions: USER_EDIT_ACTIONS,
            tabs: ["write", "matrx_split", "markdown", "wysiwyg", "preview"],
            initialTab: "matrx_split",
            analysisData: metadata as Record<string, unknown> | undefined,
            showCopyButton: true,
          },
        }),
      );
    },
    category: "Edit",
    showToast: false,
    hidden: !conversationId || !messageId,
  };
}

/**
 * View archived versions of this message from `cx_message.content_history`
 * and restore any of them. The dialog itself is owned by the host action
 * bar (`AssistantActionBar`) so it stays mounted after the menu closes —
 * this factory only wires the click into the host callback.
 *
 * Hidden when there is no history yet or the host didn't provide a
 * callback (older surfaces). The label includes the version count so
 * users can see at a glance whether anything is recoverable.
 */
function editHistoryItem(ctx: MessageActionContext): MenuItem {
  const { onRequestEditHistory, onClose, contentHistoryCount } = ctx;
  return {
    key: "edit-history",
    icon: History,
    iconColor: "text-amber-500 dark:text-amber-400",
    label:
      contentHistoryCount > 0
        ? `Edit history (${contentHistoryCount})`
        : "Edit history",
    action: () => {
      onRequestEditHistory?.();
      onClose();
    },
    category: "Edit",
    showToast: false,
    hidden: !onRequestEditHistory || contentHistoryCount === 0,
  };
}

/**
 * USER MESSAGES ONLY — edit the user's prompt AND resubmit from that point.
 *
 * The canonical (and ONLY) entry point for this flow is the inline Edit button
 * on `UserActionBar`, which opens ONE editor whose footer offers Save / Save &
 * Resubmit / Create Fork and routes the chosen `onAction` through the callback
 * registry — no follow-up confirmation dialog. The old menu-item factory was
 * DELETED here: it was never registered, and it carried the exact broken
 * pattern that fix removed — an `onSave` function stuffed into `openOverlay`
 * data, which the controller silently drops. Keeping a dead copy of the
 * landmine invites a future dev to re-register it. See
 * `features/agents/components/messages-display/user/UserActionBar.tsx`
 * (`handleEdit` / `handleEditAction`).
 */

/**
 * ASSISTANT MESSAGES — fork the conversation including this response, then ask
 * where to go (stay / jump). No re-run: an assistant message already ends the
 * turn, so the branch is a complete conversation ready to continue.
 *
 * User messages must NOT use this: forking a question with no reply after it
 * leaves the branch ending on an unanswered message — a dead-end. They use
 * `forkUserMessageItem` (fork + regenerate) instead.
 */
function forkAtMessageItem(ctx: MessageActionContext): MenuItem {
  const { conversationId, messageId, surfaceKey, dispatch, onClose } = ctx;
  return {
    key: "fork-at-message",
    icon: GitBranch,
    iconColor: "text-violet-500 dark:text-violet-400",
    label: "Fork at this message",
    action: async () => {
      // Close the menu immediately. The fork RPC + the post-fork
      // "Branch created" modal both run after this point, and the
      // menu and the dialog share z-index 9999 — leaving the menu
      // mounted causes the dialog to render behind it (depending on
      // portal order, often unclickable). The dispatch / confirm
      // host are global, so unmounting the menu is safe.
      onClose();
      if (!conversationId || !messageId) return;
      try {
        const { forkConversation } =
          await import("@/features/agents/redux/execution-system/message-crud/fork-conversation.thunk");
        const entry = ctx.getState().messages.byConversationId[conversationId];
        const msg = entry?.byId?.[messageId];
        const position = msg?.position ?? 0;
        const result = await dispatch(
          forkConversation({ conversationId, atPosition: position }),
        ).unwrap();

        // Post-fork affordance: explicitly ask the user where to go
        // next. The previous toast-based version was easy to miss;
        // forking only has two sensible follow-ups (stay or jump) so
        // a modal prompt is the right tool here. The branch is also
        // reachable from the conversation sidebar regardless of which
        // option they pick.
        if (surfaceKey && result?.conversationId) {
          const { promptForkOutcome } = await import("./promptForkOutcome");
          await promptForkOutcome({
            dispatch,
            surfaceKey,
            newConversationId: result.conversationId,
          });
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[fork-at-message] failed", err);
      }
    },
    category: "Edit",
    // The post-fork toast handles success messaging; suppress the
    // generic "Conversation forked" success toast so we don't double up.
    showToast: false,
    errorMessage: "Failed to fork conversation",
    hidden: !conversationId || !messageId,
  };
}

/**
 * USER MESSAGES — fork at this question and REGENERATE its answer on the
 * branch (no edit). Uses the shared `forkAndResubmitFromMessage` thunk so the
 * branch never dead-ends on an unanswered question. This is the answer to
 * "what am I supposed to do with a fork that ends on my own message?" — you
 * get a fresh answer to the same question on a new branch, original intact.
 */
function forkUserMessageItem(ctx: MessageActionContext): MenuItem {
  const { conversationId, messageId, surfaceKey, dispatch, onClose } = ctx;
  return {
    key: "fork-at-message",
    icon: GitBranch,
    iconColor: "text-violet-500 dark:text-violet-400",
    label: "Fork & regenerate from here",
    action: async () => {
      onClose();
      if (!conversationId || !messageId) return;
      try {
        const { forkAndResubmitFromMessage } =
          await import("@/features/agents/redux/execution-system/message-crud/fork-and-resubmit-from-message.thunk");
        await dispatch(
          forkAndResubmitFromMessage({ conversationId, messageId, surfaceKey }),
        ).unwrap();
      } catch (err) {
        console.error("[fork-user-message] failed", err);
      }
    },
    category: "Edit",
    showToast: false,
    errorMessage: "Failed to fork conversation",
    hidden: !conversationId || !messageId,
  };
}

/**
 * Delete this message. The host (UserActionBar / AssistantActionBar) owns
 * the destructive-vs-fork dialog and passes `onRequestDelete` into the
 * context. We just call back to it here so the menu can stay simple.
 *
 * If `onRequestDelete` isn't wired (e.g. older host), the item hides —
 * better than a dead button.
 */
function deleteMessageItem(ctx: MessageActionContext): MenuItem {
  const { conversationId, messageId, onRequestDelete, onClose } = ctx;
  const enabled = Boolean(conversationId && messageId && onRequestDelete);
  return {
    key: "delete-message",
    icon: Trash2,
    iconColor: "text-red-500 dark:text-red-400",
    label: "Delete message",
    action: () => {
      onClose();
      onRequestDelete?.();
    },
    category: "Edit",
    showToast: false,
    hidden: !enabled,
  };
}

// ============================================================================
// CREATOR-ONLY ITEMS — visible only to the agent's owner
//
// These surface the same analytics and debugging tools that live in the
// Creator Run Panel on /agent/[id]/run and /build, but pinned to the
// request that produced a specific message. Every item opens a floating
// window-panel — the core logic stays in one place (`StreamDebugPanel`,
// `RequestStatsPanel`, etc.) and the window components are thin wrappers.
//
// Only items that make sense per-message are exposed here. Input-bound
// settings (system prompt editor, run settings, context slots, widget
// invoker, reset conversation) are intentionally omitted because they
// are not tied to an individual message.
// ============================================================================

function creatorItems(ctx: MessageActionContext): MenuItem[] {
  const { conversationId, messageId, streamRequestId, dispatch, onClose } = ctx;
  if (!ctx.isCreator) return [];
  if (!conversationId) return [];

  return [
    {
      key: "analyze-response",
      icon: BarChart3,
      iconColor: "text-emerald-500 dark:text-emerald-400",
      label: "Analyze response",
      action: () => {
        dispatch(
          openOverlay({
            overlayId: "messageAnalysisWindow",
            data: {
              conversationId,
              requestId: streamRequestId ?? null,
              messageId: messageId ?? null,
            },
          }),
        );
        onClose();
      },
      category: "Creator",
      showToast: false,
    },
    {
      key: "stream-debug",
      icon: Activity,
      iconColor: "text-blue-500 dark:text-blue-400",
      label: "Debug stream",
      action: () => {
        dispatch(
          openOverlay({
            overlayId: "streamDebug",
            data: {
              conversationId,
              requestIdOverride: streamRequestId ?? undefined,
            },
          }),
        );
        onClose();
      },
      category: "Creator",
      showToast: false,
    },
  ];
}

// ============================================================================
// ASSISTANT-ONLY EXTRAS
// ============================================================================

/**
 * ASSISTANT MESSAGES — "Convert to flashcards / quiz…" (first chat
 * implementation of the ratified convert pattern: content starts as generic
 * markdown and converts on EXPLICIT click, it never auto-shapes). Shows only
 * when the turn carries convertible structure (a markdown table or a list —
 * `hasConvertibleContent`). The click hands off to the host action bar, which
 * owns the canonical ConvertContentDialog (features/education/convert — the
 * ONE convert-source dialog; its generators reuse the exact structured-output
 * launch mechanism CreateFromTopic uses). Never a bespoke generation path.
 */
function convertMessageItem(ctx: MessageActionContext): MenuItem {
  const { conversationId, messageId, onRequestConvert, onClose } = ctx;
  const text = ctx.turnContent ?? ctx.content;
  return {
    key: "convert-to-study",
    icon: Boxes,
    iconColor: "text-primary",
    label: "Convert to flashcards / quiz…",
    action: () => {
      if (
        !requireAuth(
          ctx,
          "convert-to-study",
          "Convert content",
          "Sign in to convert this response into flashcards, a quiz, and more.",
        )
      )
        return;
      onClose();
      onRequestConvert?.();
    },
    category: "Actions",
    showToast: false,
    hidden:
      !onRequestConvert ||
      !conversationId ||
      !messageId ||
      !hasConvertibleContent(text),
  };
}

/**
 * ASSISTANT MESSAGES — "Save to my Shapes": persist a registered `__kind`
 * block from this turn as a `content_ir.kind_instance` row (the Shape System
 * persistence layer; same insert path as the Test tab's Save). Hot-path gate
 * is CHEAP by design (`messageMayContainKindBlock` — a marker substring check
 * + auth); the heavy extraction (splitter + registry warm + envelope
 * reconstruction, reusing the artifact-materialization detection) lazy-loads
 * on click. Unregistered kinds surface an honest error toast, never a write.
 */
function saveShapeInstanceItem(ctx: MessageActionContext): MenuItem {
  const text = ctx.turnContent ?? ctx.content;
  return {
    key: "save-shape-instance",
    icon: Boxes,
    iconColor: "text-primary",
    label: "Save to my Shapes",
    action: async () => {
      ctx.onClose();
      const toastId = toast.loading("Saving shape instance…");
      try {
        const { saveKindInstancesFromMessage } =
          await import("@/features/content-ir/studio/message-kind-instances");
        const saved = await saveKindInstancesFromMessage({
          text,
          organizationId: selectEffectiveOrganizationId(ctx.getState()),
        });
        const drifted = saved.filter((s) => s.validationStatus !== "passed");
        if (drifted.length > 0) {
          // The DB trigger is the truth — surface a non-passed verdict loudly.
          toast.error(
            `Saved ${saved.length} instance${saved.length === 1 ? "" : "s"}, but ${drifted.length} did not pass validation`,
            {
              id: toastId,
              description: drifted
                .map((s) => `${s.label}: ${s.validationStatus}`)
                .join("; "),
            },
          );
          return;
        }
        const first = saved[0];
        toast.success(
          saved.length === 1
            ? first.title
              ? `Saved "${first.title}" to your Shapes`
              : `Saved a ${first.label} instance`
            : `Saved ${saved.length} instances to your Shapes`,
          {
            id: toastId,
            description: `${first.label} v${first.kindVersion} — validation passed.`,
            action: {
              label: "View in Instances",
              onClick: () =>
                window.open(
                  `${shapeInstancesHref(first.kind)}?i=${first.id}`,
                  "_blank",
                  "noopener,noreferrer",
                ),
            },
          },
        );
      } catch (err) {
        toast.error("Failed to save to Shapes", {
          id: toastId,
          description: getErrorMessage(err, "Unknown error"),
        });
      }
    },
    category: "Actions",
    showToast: false,
    hidden: !ctx.isAuthenticated || !messageMayContainKindBlock(text),
  };
}

function assistantOnlyItems(ctx: MessageActionContext): MenuItem[] {
  const { conversationId, messageId, getState } = ctx;
  return [
    {
      key: "copy-thinking",
      icon: Brain,
      iconColor: "text-purple-500 dark:text-purple-400",
      label: "Copy with thinking",
      action: async () => {
        const record =
          conversationId && messageId
            ? getState().messages.byConversationId[conversationId]?.byId?.[
                messageId
              ]
            : undefined;
        const fullContent = extractFlatText(record, { includeThinking: true });
        await copyToClipboard(fullContent, {
          isMarkdown: true,
          includeThinking: true,
          onSuccess: () => {},
          onError: (error) => {
            throw new Error(
              getErrorMessage(error, "Failed to copy with thinking"),
            );
          },
        });
      },
      category: "Copy",
      successMessage: "Copied with thinking",
      errorMessage: "Failed to copy",
    },
  ];
}

// ============================================================================
// SERVER API (TEST) ITEMS — admin-gated, opt-in test surface for the new
// Python-backed conversation endpoints. Lives next to the legacy
// Supabase-RPC items in the same menu so an admin can A/B the two paths
// on real messages without scaffolding a separate test page.
//
// Endpoint → thunk mapping:
//   • POST /cx/conversations/{id}/fork              → forkConversationServer
//   • POST /cx/conversations/{id}/messages/delete   → batchDeleteMessages
//   • POST /cx/conversations/{id}/messages/hide     → hideMessages
//   • POST /cx/conversations/{id}/messages/replace  → replaceMessages
//   • POST /cx/conversations/{id}/messages/restore  → restoreCompaction
//
// Two endpoints are intentionally NOT exposed in this menu because they
// need a richer payload than a single message gives us:
//   • /ai/conversations/{id}/fork-and-run — needs the full RunRequest
//     body (tools, client context, writable variables…). Wire it into
//     the UserActionBar Send button after assembling via
//     `selectAssembledRequest`, not here.
//   • /cx/conversations/{id}/turns/compact — turn-range driven; better
//     surfaced from the conversation header / settings, not a single
//     message menu.
// ============================================================================

function getCompactionAnchor(
  metadata: Record<string, unknown> | null,
): { compactionGroupId?: string; summaryMessageId?: string } | null {
  if (!metadata) return null;
  const groupId =
    typeof metadata.compaction_group_id === "string"
      ? metadata.compaction_group_id
      : null;
  const isSummary =
    metadata.compaction_summary === true ||
    metadata.is_compaction_summary === true ||
    typeof metadata.compaction_archive === "object";
  if (!groupId && !isSummary) return null;
  return {
    compactionGroupId: groupId ?? undefined,
    summaryMessageId: undefined, // resolved by caller from ctx.messageId
  };
}

function serverApiTestItems(ctx: MessageActionContext): MenuItem[] {
  const { isAdmin, conversationId, messageId, metadata, dispatch, onClose } =
    ctx;
  if (!isAdmin) return [];
  if (!conversationId || !messageId) return [];

  const compactionAnchor = getCompactionAnchor(metadata);

  const items: MenuItem[] = [
    {
      key: "srv-fork-at",
      icon: GitFork,
      iconColor: "text-violet-500 dark:text-violet-400",
      label: "Fork at this message (server)",
      action: async () => {
        // Close menu before the fork RPC / post-fork modal — they
        // share z-index 9999 with the menu and end up unclickable
        // behind it otherwise. See `forkAtMessageItem` for the
        // same pattern.
        onClose();
        const { forkConversationServer } =
          await import("@/features/agents/redux/execution-system/message-crud/server/fork-conversation-server.thunk");
        const result = await dispatch(
          forkConversationServer({
            conversationId,
            selector: { fromMessageId: messageId, exclusive: false },
          }),
        ).unwrap();
        if (ctx.surfaceKey && result?.conversationId) {
          const { promptForkOutcome } = await import("./promptForkOutcome");
          await promptForkOutcome({
            dispatch,
            surfaceKey: ctx.surfaceKey,
            newConversationId: result.conversationId,
          });
        }
      },
      category: "Server API (test)",
      showToast: false,
      errorMessage: "Server fork failed",
    },
    {
      key: "srv-fork-before",
      icon: GitFork,
      iconColor: "text-violet-400 dark:text-violet-300",
      label: "Fork BEFORE this message (server)",
      action: async () => {
        onClose();
        const { forkConversationServer } =
          await import("@/features/agents/redux/execution-system/message-crud/server/fork-conversation-server.thunk");
        const result = await dispatch(
          forkConversationServer({
            conversationId,
            selector: { fromMessageId: messageId, exclusive: true },
          }),
        ).unwrap();
        if (ctx.surfaceKey && result?.conversationId) {
          const { promptForkOutcome } = await import("./promptForkOutcome");
          await promptForkOutcome({
            dispatch,
            surfaceKey: ctx.surfaceKey,
            newConversationId: result.conversationId,
          });
        }
      },
      category: "Server API (test)",
      showToast: false,
      errorMessage: "Server fork (exclusive) failed",
    },
    {
      key: "srv-hide-from-model",
      icon: EyeOff,
      iconColor: "text-amber-500 dark:text-amber-400",
      label: "Hide this from model (server)",
      action: async () => {
        const { hideMessages } =
          await import("@/features/agents/redux/execution-system/message-crud/server/hide-messages.thunk");
        await dispatch(
          hideMessages({
            conversationId,
            selector: { message_ids: [messageId], inclusive: true },
          }),
        ).unwrap();
        onClose();
      },
      category: "Server API (test)",
      successMessage: "Hidden from model",
      errorMessage: "Hide failed",
    },
    {
      key: "srv-delete-this",
      icon: Trash2,
      iconColor: "text-red-500 dark:text-red-400",
      label: "Delete this message (server)",
      action: async () => {
        // Close menu first — the imperative confirm() host renders
        // at z-index 9999 and the menu sits at the same layer.
        onClose();
        const { confirm } =
          await import("@/components/dialogs/confirm/confirmDialogOpener");
        const ok = await confirm({
          title: "Delete this message?",
          description:
            "Hard delete via the new server endpoint. Tool pairs cascade automatically. Reload follows.",
          variant: "destructive",
          confirmLabel: "Delete",
        });
        if (!ok) return;
        const { batchDeleteMessages } =
          await import("@/features/agents/redux/execution-system/message-crud/server/batch-delete-messages.thunk");
        await dispatch(
          batchDeleteMessages({
            conversationId,
            selector: { message_ids: [messageId], inclusive: true },
          }),
        ).unwrap();
      },
      category: "Server API (test)",
      successMessage: "Message deleted (server)",
      errorMessage: "Server delete failed",
    },
    {
      key: "srv-delete-from-here",
      icon: Trash2,
      iconColor: "text-red-600 dark:text-red-500",
      label: "Delete this + everything after (server)",
      action: async () => {
        onClose();
        const { confirm } =
          await import("@/components/dialogs/confirm/confirmDialogOpener");
        const ok = await confirm({
          title: "Truncate conversation from here?",
          description:
            "Hard deletes this message and every message that comes after it. Cannot be undone.",
          variant: "destructive",
          confirmLabel: "Delete forward",
        });
        if (!ok) return;
        const { batchDeleteMessages } =
          await import("@/features/agents/redux/execution-system/message-crud/server/batch-delete-messages.thunk");
        await dispatch(
          batchDeleteMessages({
            conversationId,
            selector: { from_message_id: messageId, inclusive: true },
          }),
        ).unwrap();
      },
      category: "Server API (test)",
      successMessage: "Truncated from here (server)",
      errorMessage: "Server truncate failed",
    },
    {
      key: "srv-delete-dryrun",
      icon: ListFilter,
      iconColor: "text-slate-500 dark:text-slate-400",
      label: "Dry-run: delete this + after (server)",
      action: async () => {
        const { batchDeleteMessages } =
          await import("@/features/agents/redux/execution-system/message-crud/server/batch-delete-messages.thunk");
        const result = await dispatch(
          batchDeleteMessages({
            conversationId,
            selector: { from_message_id: messageId, inclusive: true },
            dryRun: true,
          }),
        ).unwrap();
        const directIds = result.deleted_ids ?? [];
        const cascadedIds = result.cascaded_ids ?? [];
        const allIds = [...directIds, ...cascadedIds];
        const cascadeNote =
          cascadedIds.length > 0
            ? ` (incl. ${cascadedIds.length} cascaded tool row${cascadedIds.length === 1 ? "" : "s"})`
            : "";
        toast.info(
          `Would delete ${allIds.length} message${allIds.length === 1 ? "" : "s"}${cascadeNote}`,
          {
            description:
              allIds.length > 0
                ? `IDs: ${allIds.slice(0, 5).join(", ")}${allIds.length > 5 ? ` (+${allIds.length - 5} more)` : ""}`
                : "Empty selector resolved to no rows.",
          },
        );
        onClose();
      },
      category: "Server API (test)",
      showToast: false,
      errorMessage: "Dry-run failed",
    },
    {
      key: "srv-replace-with-summary",
      icon: Scissors,
      iconColor: "text-blue-500 dark:text-blue-400",
      label: "Replace this with a summary… (server)",
      action: () => {
        // Custom save (server `replaceMessages`, NOT editMessage) → can't use
        // the bridge self-handle. Route onSave through the callback registry;
        // a function can't travel through Redux. The group auto-disposes on
        // save (removeAfterTrigger); a cancel-without-save leaks one tiny group
        // (acceptable for an admin test item).
        const { callbackGroupId } = createFullScreenEditorCallbackGroup({
          onSave: async (newContent: string) => {
            const trimmed = newContent.trim();
            if (!trimmed) {
              toast.error("Summary text required");
              return;
            }
            try {
              const { replaceMessages } =
                await import("@/features/agents/redux/execution-system/message-crud/server/replace-messages.thunk");
              await dispatch(
                replaceMessages({
                  conversationId,
                  selector: {
                    message_ids: [messageId],
                    inclusive: true,
                  },
                  summaryContent: [{ type: "text", text: trimmed }],
                }),
              ).unwrap();
              toast.success("Replaced with summary (server)");
            } catch (err) {
              toast.error(getErrorMessage(err, "Replace-with-summary failed"));
            }
          },
        });
        dispatch(
          openOverlay({
            overlayId: "fullScreenEditor",
            instanceId: `srv-replace-${messageId}`,
            data: {
              content: "",
              mode: "free",
              messageId: messageId ?? undefined,
              callbackGroupId,
              tabs: ["write", "matrx_split", "markdown", "preview"],
              initialTab: "write",
              title: "Summary content",
              showSaveButton: true,
              showCopyButton: false,
            },
          }),
        );
        onClose();
      },
      category: "Server API (test)",
      showToast: false,
    },
  ];

  // Restore is only meaningful when this row IS a compaction summary —
  // either tagged in metadata, or carrying the `compaction_archive` it
  // would need to restore from.
  if (compactionAnchor) {
    items.push({
      key: "srv-restore-compaction",
      icon: Undo2,
      iconColor: "text-emerald-500 dark:text-emerald-400",
      label: "Restore compaction (server)",
      action: async () => {
        const { restoreCompaction } =
          await import("@/features/agents/redux/execution-system/message-crud/server/restore-compaction.thunk");
        await dispatch(
          restoreCompaction({
            conversationId,
            // Prefer the group id when we have it; fall back to using the
            // summary message id itself (server accepts either).
            compactionGroupId: compactionAnchor.compactionGroupId,
            summaryMessageId: compactionAnchor.compactionGroupId
              ? undefined
              : messageId,
            deleteSummary: true,
          }),
        ).unwrap();
        onClose();
      },
      category: "Server API (test)",
      successMessage: "Compaction restored",
      errorMessage: "Restore failed",
    });
  }

  // AdvancedMenu prints the `category` string as the section heading,
  // so "Server API (test)" already labels the block — no synthetic
  // header item needed.
  return items;
}

// ============================================================================
// PUBLIC REGISTRIES
// ============================================================================

/**
 * Menu items for an assistant-authored message. Shape:
 *   Edit → Edit content, Fork at this message, Delete
 *   Save as → Note (window panel)
 *   Copy → plain / Docs / Word / with thinking
 *   Export → HTML preview, Copy HTML page, Email, Print, (Full print)
 *   Actions → Save to Scratch/File, Add to Tasks, Convert to broker, Add to docs
 *   App → Feedback, Announcements, Preferences
 *
 * Audio playback lives on the inline AssistantActionBar (SpeakerButton —
 * play/pause toggle, with markdown cleanup), not in this menu.
 */
export function getAssistantMessageActions(
  ctx: MessageActionContext,
): MenuItem[] {
  return [
    editContentItem(ctx),
    editHistoryItem(ctx),
    forkAtMessageItem(ctx),
    deleteMessageItem(ctx),
    ...saveAsItems(ctx),
    ...creatorItems(ctx),
    ...copyItems(ctx),
    ...assistantOnlyItems(ctx),
    convertMessageItem(ctx),
    saveShapeInstanceItem(ctx),
    ...actionsItems(ctx),
    ...serverApiTestItems(ctx),
    ...appItems(ctx),
  ];
}

/**
 * Menu items for a user-authored message. Shape:
 *   Edit → Edit & resubmit, Edit history, Fork & regenerate, Delete
 *   Save as → Note / Document / Markdown / Code / File / Scratch Code /
 *             Scratch Note / PDF Document
 *   Copy → plain / Docs / Word / HTML page
 *   Actions → Create Task, Publish HTML, Share as webpage, Email, Print,
 *             (Full print)
 *   App → Feedback, Announcements, Preferences
 *
 * Audio playback lives on the inline UserActionBar (SpeakerButton —
 * play/pause toggle, with markdown cleanup), not in this menu.
 */
export function getUserMessageActions(ctx: MessageActionContext): MenuItem[] {
  // "Edit & resubmit" opens the SAME three-outcome editor as the inline
  // pencil / paper-plane buttons (shared `USER_EDIT_ACTIONS`). We deliberately
  // DON'T also expose the old plain "Edit content" here — for a user message
  // that path saved silently with no resubmit choice, which read as a bug.
  // "Fork & regenerate" replaces the old "Fork at this message", which on a
  // user message dead-ended on an unanswered question.
  return [
    editAndResubmitUserItem(ctx),
    editHistoryItem(ctx),
    forkUserMessageItem(ctx),
    deleteMessageItem(ctx),
    ...saveAsItems(ctx),
    ...creatorItems(ctx),
    ...copyItems(ctx),
    ...actionsItems(ctx),
    ...serverApiTestItems(ctx),
    ...appItems(ctx),
  ];
}

// ============================================================================
// POST-AUTH RESUME
// ============================================================================

/**
 * Resume any action the user requested while signed out. Called from a menu
 * host after an auth redirect — replays the original action with the same
 * `content` snapshot that triggered the redirect.
 */
export function resumePendingAuthAction(
  isAuthenticated: boolean,
  content: string,
  dispatch: AppDispatch,
) {
  if (!isAuthenticated) return;
  try {
    const pending = sessionStorage.getItem(PENDING_ACTION_KEY);
    if (!pending) return;
    sessionStorage.removeItem(PENDING_ACTION_KEY);
    const { action, savedContent } = JSON.parse(pending) as {
      action: string;
      savedContent: string;
    };
    if (savedContent !== content) return;
    if (action === "save-scratch") {
      NotesAPI.create({
        label: "New Note",
        content: savedContent,
        folder_name: "Scratch",
        tags: [],
      })
        .then(() => toast.success("Saved to Scratch!"))
        .catch(() => toast.error("Failed to save to Scratch"));
    } else if (action === "save-as-note") {
      dispatch(
        openOverlay({
          overlayId: "quickNoteSaveWindow",
          data: {
            initialContent: savedContent,
            defaultFolder: CHAT_SAVES_FOLDER,
            initialEditorMode: undefined,
          },
        }),
      );
    } else if (action === "add-docs") {
      import("@/features/data-tables/export-targets")
        .then(async ({ pushMarkdownToDocument }) => {
          const res = await pushMarkdownToDocument(savedContent);
          if (res.ok && res.href) {
            const href = res.href;
            toast.success("Saved as Document", {
              action: {
                label: "Open",
                onClick: () =>
                  window.open(href, "_blank", "noopener,noreferrer"),
              },
            });
          } else {
            toast.error("Failed to create document", {
              description: res.ok ? undefined : res.error,
            });
          }
        })
        .catch(() => toast.error("Failed to create document"));
    } else if (action === "share-webpage") {
      import("./shareMessageAsWebpage")
        .then(({ shareMessageAsWebpage }) =>
          shareMessageAsWebpage({
            content: savedContent,
            title: "Shared AI response",
            // No live message context on the resume path — publishes without
            // the per-message idempotency key.
            messageId: null,
            conversationId: null,
          }),
        )
        .then(({ url }) => {
          toast.success("Webpage published", {
            description: url,
            action: {
              label: "Open",
              onClick: () => window.open(url, "_blank", "noopener,noreferrer"),
            },
          });
        })
        .catch(() => toast.error("Failed to publish webpage"));
    } else if (action === "save-as-pdf") {
      import("@/lib/block-print/markdown-pdf")
        .then(async ({ markdownToPdfBlob }) => {
          const blob = await markdownToPdfBlob(savedContent);
          const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
          const file = new File([blob], `message-${ts}.pdf`, {
            type: "application/pdf",
          });
          await fileHandler.upload(
            { kind: "file", file },
            { folderPath: "Chat Saves" },
          );
          toast.success("PDF saved to Files");
        })
        .catch(() => toast.error("Failed to create PDF"));
    } else if (action === "save-as-file") {
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const file = new File([savedContent], `message-${ts}.md`, {
        type: "text/markdown",
      });
      fileHandler
        .upload({ kind: "file", file }, { folderPath: "Chat Saves" })
        .then(() => toast.success("Saved to Files"))
        .catch(() => toast.error("Failed to save file"));
    } else if (action === "save-to-code") {
      const { code, language } = extractFirstCodeBlock(savedContent);
      dispatch(
        openOverlay({
          overlayId: "saveToCode",
          instanceId: `save-code-resume-${Date.now()}`,
          data: {
            initialContent: code.trim() ? code : savedContent,
            initialLanguage: language ?? "plaintext",
            suggestedName: undefined,
            defaultFolderId: null,
          },
        }),
      );
    } else if (action === "save-code-scratch") {
      const { code, language } = extractFirstCodeBlock(savedContent);
      if (code.trim()) {
        CodeFilesAPI.create({
          name: `snippet-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`,
          language: language ?? "plaintext",
          content: code,
          tags: [],
        })
          .then(() => toast.success("Saved code to Scratch!"))
          .catch(() => toast.error("Failed to save code"));
      }
    } else if (action === "add-to-tasks") {
      // No live message context on the post-auth resume path (working from
      // saved content only) — null ids, no conversation edge.
      dispatch(
        setPendingSource(
          buildTaskSeedFromMessage({
            content: savedContent,
            messageId: null,
            conversationId: null,
          }),
        ),
      );
    }
  } catch {
    /* ignore parse errors */
  }
}
