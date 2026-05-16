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
  BookText,
  Briefcase,
  Copy,
  FileCode,
  FileText,
  Eye,
  Globe,
  Brain,
  Save,
  Edit,
  CheckSquare,
  Mail,
  Printer,
  ScanLine,
  Bug,
  Megaphone,
  Settings,
  GitBranch,
  GitFork,
  Send,
  FileType,
  Activity,
  BarChart3,
  Trash2,
  EyeOff,
  Scissors,
  Undo2,
  ListFilter,
} from "lucide-react";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import { printMarkdownContent } from "@/features/conversation/utils/markdown-print";
import { loadWordPressCSS } from "@/features/html-pages/css/wordpress-styles";
import { NotesAPI } from "@/features/notes/service/notesApi";
import { CodeFilesAPI } from "@/features/code-files/service/codeFilesApi";
import { createTaskWithAssociation } from "@/features/tasks/redux/taskAssociationsSlice";
import {
  setSelectedTaskId,
  setPendingSource,
} from "@/features/tasks/redux/taskUiSlice";
import { toast } from "sonner";
import { openOverlay, closeOverlay } from "@/lib/redux/slices/overlaySlice";
import type { MenuItem } from "@/components/official/AdvancedMenu";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import type { Json } from "@/types/database.types";
import { extractErrorMessage } from "@/utils/errors";

const PENDING_ACTION_KEY = "matrx_pending_post_auth_action";

// ============================================================================
// CONTEXT
// ============================================================================

export interface MessageActionContext {
  /** Flat-text rendering of the message (for copy/print/email). */
  content: string;
  /** Is the viewer signed in? Gates auth-required actions. */
  isAuthenticated: boolean;
  /** Server `cx_message.id`. Required for any mutation path; null hides those items. */
  messageId: string | null;
  /** Server `cx_conversation.id`. Required for any mutation path; null hides those items. */
  conversationId: string | null;
  /** `cx_message.metadata` — arbitrary JSON; included in saves and exports. */
  metadata: Record<string, unknown> | null;
  dispatch: AppDispatch;
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

/**
 * Serialize any thrown value into a log-friendly object. Supabase errors
 * and thunk `rejectWithValue` payloads are often class instances with
 * non-enumerable fields that default to `{}` on `JSON.stringify`, which
 * hides the actual failure.
 */
function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    return {
      code: e.code ?? null,
      message: e.message ?? null,
      details: e.details ?? null,
      hint: e.hint ?? null,
      status: e.status ?? null,
      name: e.name ?? null,
    };
  }
  return { raw: extractErrorMessage(error) };
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
        JSON.stringify({ action: actionKey, savedContent: ctx.content }),
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
  return [{ type: "text", text }] as unknown as Json;
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
  const { content } = ctx;
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

function exportItems(ctx: MessageActionContext): MenuItem[] {
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

  const items: MenuItem[] = [
    {
      key: "html-preview",
      icon: Eye,
      iconColor: "text-indigo-500 dark:text-indigo-400",
      label: "HTML preview",
      action: () => {
        const instanceId = `html-preview-${messageId ?? "default"}`;
        dispatch(
          openOverlay({
            overlayId: "htmlPreview",
            instanceId,
            data: {
              content,
              messageId: messageId ?? undefined,
              conversationId: conversationId ?? undefined,
              title: "HTML Preview & Publishing",
              description:
                "Edit markdown, preview HTML, and publish your content",
              onSave: async (newContent: string) => {
                if (conversationId && messageId) {
                  try {
                    const { editMessage } =
                      await import("@/features/agents/redux/execution-system/message-crud/edit-message.thunk");
                    await dispatch(
                      editMessage({
                        conversationId,
                        messageId,
                        newContent: wrapTextAsContent(newContent),
                      }),
                    ).unwrap();
                  } catch (err) {
                    // eslint-disable-next-line no-console
                    console.error("[html-preview] save failed", err);
                  }
                }
                dispatch(
                  closeOverlay({ overlayId: "htmlPreview", instanceId }),
                );
              },
              showSaveButton: Boolean(conversationId && messageId),
              isAgentSystem: true,
            },
          }),
        );
        onClose();
      },
      category: "Export",
      showToast: false,
    },
    {
      key: "copy-html",
      icon: Globe,
      iconColor: "text-orange-500 dark:text-orange-400",
      label: "Copy HTML page",
      action: async () => {
        await copyToClipboard(content, {
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
      category: "Export",
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
                content,
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
            content,
            metadata: { ...metadata, timestamp: new Date().toLocaleString() },
          }),
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.msg || "Failed to send email");
        onClose();
      },
      category: "Export",
      successMessage: "Email sent!",
      errorMessage: "Failed to send email",
    },
    {
      key: "print",
      icon: Printer,
      iconColor: "text-slate-500 dark:text-slate-400",
      label: "Print / Save PDF",
      action: () => {
        printMarkdownContent(content, "Message");
        onClose();
      },
      category: "Export",
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
      category: "Export",
      showToast: false,
    });
  }

  return items;
}

function saveItems(ctx: MessageActionContext): MenuItem[] {
  const { content, dispatch, onClose, messageId } = ctx;
  // Per-message instance keys so saving from two different messages doesn't
  // overwrite the first window's draft via the singleton "default" slot.
  // Falls back to a random id when there's no messageId (shouldn't happen
  // for saved messages, but keeps the contract robust).
  const saveNotesInstanceId = messageId
    ? `save-notes-${messageId}`
    : `save-notes-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const saveCodeInstanceId = messageId
    ? `save-code-${messageId}`
    : `save-code-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return [
    {
      key: "save-scratch",
      icon: FileText,
      iconColor: "text-cyan-500 dark:text-cyan-400",
      label: "Save to Scratch",
      action: async () => {
        if (
          !requireAuth(
            ctx,
            "save-scratch",
            "Save to Scratch",
            "Sign in to save notes to your Scratch folder.",
          )
        )
          return;
        await NotesAPI.create({
          label: "New Note",
          content,
          folder_name: "Scratch",
          tags: [],
        });
      },
      category: "Actions",
      successMessage: "Saved to Scratch!",
      errorMessage: "Failed to save",
    },
    {
      key: "save-notes",
      icon: Save,
      iconColor: "text-violet-500 dark:text-violet-400",
      label: "Save to Notes",
      action: () => {
        if (
          !requireAuth(
            ctx,
            "save-notes",
            "Save to Notes",
            "Sign in to save notes and organize your messages.",
          )
        )
          return;
        dispatch(
          openOverlay({
            overlayId: "saveToNotes",
            instanceId: saveNotesInstanceId,
            data: {
              initialContent: content,
              defaultFolder: undefined,
              initialEditorMode: undefined,
            },
          }),
        );
      },
      category: "Actions",
      showToast: false,
    },
    {
      key: "save-code-scratch",
      icon: FileCode,
      iconColor: "text-amber-500 dark:text-amber-400",
      label: "Save code to Scratch",
      action: async () => {
        if (
          !requireAuth(
            ctx,
            "save-code-scratch",
            "Save code to Scratch",
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
      category: "Actions",
      successMessage: "Saved code to Scratch!",
      errorMessage: "Failed to save code",
    },
    {
      key: "save-to-code",
      icon: FileCode,
      iconColor: "text-rose-500 dark:text-rose-400",
      label: "Save to Code",
      action: () => {
        if (
          !requireAuth(
            ctx,
            "save-to-code",
            "Save to Code",
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
      category: "Actions",
      showToast: false,
    },
    {
      key: "save-file",
      icon: FileCode,
      iconColor: "text-rose-500 dark:text-rose-400",
      label: "Save as file",
      action: () => {
        const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const blob = new Blob([content], {
          type: "text/markdown;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `message-${ts}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        onClose();
      },
      category: "Actions",
      successMessage: "File saved!",
      errorMessage: "Failed to save file",
    },
    {
      key: "add-to-tasks",
      icon: CheckSquare,
      iconColor: "text-blue-500 dark:text-blue-400",
      label: "Create task from message",
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
        const preview = content.slice(0, 400);
        // "Task Related To: <start of message>" — makes it clear at a glance
        // what the task is about. Fully editable in the window.
        const firstLine =
          content
            .trim()
            .split(/\n+/)[0]
            ?.replace(/^[#>*\-\s]+/, "")
            .slice(0, 60) || "";
        const seedTitle = firstLine
          ? `Task Related To: ${firstLine}${firstLine.length >= 60 ? "…" : ""}`
          : "Task Related To AI message";

        dispatch(
          setPendingSource({
            entity_type: "cx_message",
            entity_id: ctx.messageId ?? "",
            label: preview,
            metadata: {
              // Also attach the whole conversation when available so the
              // resulting task is reachable from either side.
              ...(ctx.conversationId
                ? {
                    parent: {
                      entity_type: "cx_conversation",
                      entity_id: ctx.conversationId,
                      label: preview.slice(0, 120),
                    },
                  }
                : {}),
              ...(ctx.metadata ?? {}),
            },
            prePopulate: {
              title: seedTitle,
              description: content,
            },
          }),
        );
        onClose();
      },
      category: "Actions",
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
 * Edit the message in-place. Works for both user and assistant messages:
 *   - Opens the full-screen editor prefilled with the current flat text.
 *   - On save, wraps the new text as `[{ type: "text", text }]` and writes
 *     it back through `editMessage` (cx_message_edit RPC).
 *   - Marks the conversation's cache-bypass flag so the next AI turn sees
 *     the updated content.
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
      const instanceId = `edit-content-${messageId}`;
      dispatch(
        openOverlay({
          overlayId: "fullScreenEditor",
          instanceId,
          data: {
            content,
            mode: "free",
            conversationId: undefined,
            messageId: messageId ?? undefined,
            onSave: async (newContent: string) => {
              if (!conversationId || !messageId) {
                toast.error("Can't save — missing conversation/message id");
                dispatch(
                  closeOverlay({ overlayId: "fullScreenEditor", instanceId }),
                );
                return;
              }
              try {
                const { editMessage } =
                  await import("@/features/agents/redux/execution-system/message-crud/edit-message.thunk");
                await dispatch(
                  editMessage({
                    conversationId,
                    messageId,
                    newContent: wrapTextAsContent(newContent),
                  }),
                ).unwrap();
                toast.success("Changes saved");
              } catch (err) {
                const serialized = serializeError(err);
                // eslint-disable-next-line no-console
                console.error(
                  "[edit-content] save failed",
                  JSON.stringify(serialized, null, 2),
                );
                toast.error(getErrorMessage(err, "Failed to save changes"));
              }
              dispatch(
                closeOverlay({ overlayId: "fullScreenEditor", instanceId }),
              );
            },
            tabs: ["write", "matrx_split", "markdown", "wysiwyg", "preview"],
            initialTab: "matrx_split",
            analysisData: metadata as Record<string, unknown> | undefined,
            title: undefined,
            showSaveButton: true,
            showCopyButton: true,
          },
        }),
      );
      onClose();
    },
    category: "Edit",
    showToast: false,
    hidden: !conversationId || !messageId,
  };
}

/**
 * USER MESSAGES ONLY — edit the user's prompt AND resubmit from that point.
 *
 * As of the surface-aware refactor, the canonical entry point for this
 * flow is the inline Send-icon button on UserActionBar (always visible on
 * hover for every user message). The host owns the editor + fork-vs-
 * overwrite dialog state, so the menu item is no longer registered. The
 * factory is kept here for legacy callers and to document the flow.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function editAndResubmitItem(ctx: MessageActionContext): MenuItem {
  const { content, conversationId, messageId, metadata, dispatch, onClose } =
    ctx;
  return {
    key: "edit-resubmit",
    icon: Send,
    iconColor: "text-cyan-500 dark:text-cyan-400",
    label: "Edit & resubmit",
    action: () => {
      if (!conversationId || !messageId) {
        onClose();
        return;
      }
      const instanceId = `edit-resubmit-${messageId}`;
      dispatch(
        openOverlay({
          overlayId: "fullScreenEditor",
          instanceId,
          data: {
            content,
            mode: "free",
            conversationId: undefined,
            messageId: messageId ?? undefined,
            onSave: async (newContent: string) => {
              try {
                const { forkConversation } =
                  await import("@/features/agents/redux/execution-system/message-crud/fork-conversation.thunk");
                const { editMessage } =
                  await import("@/features/agents/redux/execution-system/message-crud/edit-message.thunk");
                // Read position from state right before firing. Fork at
                // (position - 1) so the user's new message becomes the next
                // turn on the branch, replacing whatever originally came after.
                const positionThunk = (
                  _: unknown,
                  getState: () => RootState,
                ) => {
                  const entry =
                    getState().messages.byConversationId[conversationId];
                  const msg = entry?.byId?.[messageId];
                  const position = msg?.position ?? 0;
                  const forkPosition = Math.max(0, position - 1);
                  return dispatch(
                    forkConversation({
                      conversationId,
                      atPosition: forkPosition,
                    }),
                  ).unwrap();
                };
                await dispatch(positionThunk as never);

                // Persist the edit onto the user's message on the fork head.
                // After this, the user is viewing the forked conversation with
                // their edited question in place; they can hit Send from the
                // input bar to launch the new turn.
                await dispatch(
                  editMessage({
                    conversationId,
                    messageId,
                    newContent: wrapTextAsContent(newContent),
                  }),
                ).unwrap();
                toast.success("Forked — edit saved on the new branch");
              } catch (err) {
                const serialized = serializeError(err);
                // eslint-disable-next-line no-console
                console.error(
                  "[edit-resubmit] failed",
                  JSON.stringify(serialized, null, 2),
                );
                toast.error(getErrorMessage(err, "Failed to edit & resubmit"));
              } finally {
                dispatch(
                  closeOverlay({ overlayId: "fullScreenEditor", instanceId }),
                );
              }
            },
            tabs: ["write", "matrx_split", "markdown", "wysiwyg", "preview"],
            initialTab: "matrx_split",
            analysisData: metadata as Record<string, unknown> | undefined,
            title: undefined,
            showSaveButton: true,
            showCopyButton: true,
          },
        }),
      );
      onClose();
    },
    category: "Edit",
    showToast: false,
    hidden: !conversationId || !messageId,
  };
}

/**
 * Fork the conversation at this message. Works for both roles:
 *   - On a user message: fork captures everything up through (and including)
 *     this question — useful to explore an alternate path from here.
 *   - On an assistant message: fork captures the conversation including this
 *     response — useful to keep this answer but try a different continuation.
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
        const positionThunk = (_: unknown, getState: () => RootState) => {
          const entry = getState().messages.byConversationId[conversationId];
          const msg = entry?.byId?.[messageId];
          const position = msg?.position ?? 0;
          return dispatch(
            forkConversation({ conversationId, atPosition: position }),
          ).unwrap();
        };
        const result = (await dispatch(positionThunk as never)) as unknown as {
          conversationId: string;
        };

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
              requestId: streamRequestId ?? null,
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

function assistantOnlyItems(ctx: MessageActionContext): MenuItem[] {
  const { content } = ctx;
  return [
    {
      key: "copy-thinking",
      icon: Brain,
      iconColor: "text-purple-500 dark:text-purple-400",
      label: "Copy with thinking",
      action: async () => {
        await copyToClipboard(content, {
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
    {
      key: "convert-broker",
      icon: Briefcase,
      iconColor: "text-amber-500 dark:text-amber-400",
      label: "Convert to broker",
      action: () => {
        toast.info("Coming soon", {
          description: "Convert to broker will be available shortly.",
        });
        ctx.onClose();
      },
      category: "Actions",
      showToast: false,
    },
    {
      key: "add-docs",
      icon: BookText,
      iconColor: "text-emerald-500 dark:text-emerald-400",
      label: "Add to docs",
      action: () => {
        toast.info("Coming soon", {
          description: "Add to docs will be available shortly.",
        });
        ctx.onClose();
      },
      category: "Actions",
      showToast: false,
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
        const instanceId = `srv-replace-${messageId}`;
        dispatch(
          openOverlay({
            overlayId: "fullScreenEditor",
            instanceId,
            data: {
              content: "",
              mode: "free",
              conversationId: undefined,
              messageId: messageId ?? undefined,
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
                  toast.error(
                    getErrorMessage(err, "Replace-with-summary failed"),
                  );
                } finally {
                  dispatch(
                    closeOverlay({
                      overlayId: "fullScreenEditor",
                      instanceId,
                    }),
                  );
                }
              },
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
 *   Copy → plain / Docs / Word / with thinking
 *   Export → HTML preview, Copy HTML page, Email, Print, (Full print)
 *   Actions → Save to Scratch/Notes/File, Add to Tasks, Convert to broker, Add to docs
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
    forkAtMessageItem(ctx),
    deleteMessageItem(ctx),
    ...creatorItems(ctx),
    ...copyItems(ctx),
    ...assistantOnlyItems(ctx),
    ...exportItems(ctx),
    ...saveItems(ctx),
    ...serverApiTestItems(ctx),
    ...appItems(ctx),
  ];
}

/**
 * Menu items for a user-authored message. Shape:
 *   Edit → Edit content, Edit & resubmit, Fork at this message, Delete
 *   Copy → plain / Docs / Word
 *   Export → HTML preview, Copy HTML page, Email, Print, (Full print)
 *   Actions → Save to Scratch/Notes/File, Add to Tasks
 *   App → Feedback, Announcements, Preferences
 *
 * Audio playback lives on the inline UserActionBar (SpeakerButton —
 * play/pause toggle, with markdown cleanup), not in this menu.
 */
export function getUserMessageActions(ctx: MessageActionContext): MenuItem[] {
  // Note: "Edit & resubmit" lives only on the inline UserActionBar Send
  // button now — the host owns the editor + fork-vs-overwrite dialog
  // state. Keeping it out of this menu eliminates the duplicate flow.
  return [
    editContentItem(ctx),
    forkAtMessageItem(ctx),
    deleteMessageItem(ctx),
    ...creatorItems(ctx),
    ...copyItems(ctx),
    ...exportItems(ctx),
    ...saveItems(ctx),
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
    } else if (action === "save-notes") {
      dispatch(
        openOverlay({
          overlayId: "saveToNotes",
          instanceId: `save-notes-resume-${Date.now()}`,
          data: {
            initialContent: savedContent,
            defaultFolder: undefined,
            initialEditorMode: undefined,
          },
        }),
      );
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
      const preview = savedContent.slice(0, 400);
      const firstLine =
        savedContent
          .trim()
          .split(/\n+/)[0]
          ?.replace(/^[#>*\-\s]+/, "")
          .slice(0, 60) || "";
      const seedTitle = firstLine
        ? `Task Related To: ${firstLine}${firstLine.length >= 60 ? "…" : ""}`
        : "Task Related To AI message";
      dispatch(
        setPendingSource({
          entity_type: "cx_message",
          entity_id: "",
          label: preview,
          prePopulate: { title: seedTitle, description: savedContent },
        }),
      );
    }
  } catch {
    /* ignore parse errors */
  }
}
