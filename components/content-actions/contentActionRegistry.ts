/**
 * contentActionRegistry — menu item factories for the generic
 * `ContentActionBar`. Mirrors the structure of `messageActionRegistry`
 * but is detached from `cx_message` / `cx_conversation`.
 *
 * Use with any markdown string. No conversation context, no edit thunks,
 * no like/dislike, no fork/delete. Everything that runs on plain content
 * (copy, export, save-to-notes, save-to-tasks, full-screen viewer) lives
 * here.
 */

import {
  Copy,
  FileCode,
  FileText,
  Eye,
  Globe,
  Save,
  CheckSquare,
  Mail,
  Printer,
  Bug,
  Megaphone,
  Settings,
  FileType,
  Edit,
} from "lucide-react";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import { printMarkdownContent } from "@/features/conversation/utils/markdown-print";
import { loadWordPressCSS } from "@/features/html-pages/css/wordpress-styles";
import { NotesAPI } from "@/features/notes/service/notesApi";
import { CodeFilesAPI } from "@/features/code-files/service/codeFilesApi";
import { setPendingSource } from "@/features/tasks/redux/taskUiSlice";
import { toast } from "sonner";
import {
  closeOverlay,
  openOverlay,
} from "@/lib/redux/slices/overlaySlice";
import { createFullScreenEditorCallbackGroup } from "@/features/overlays/callbacks/fullScreenEditor";
import type { MenuItem } from "@/components/official/AdvancedMenu";
import type { AppDispatch } from "@/lib/redux/store";
import { extractErrorMessage } from "@/utils/errors";

const PENDING_ACTION_KEY = "matrx_pending_post_auth_action_content";

// ============================================================================
// CONTEXT
// ============================================================================

export interface ContentActionContext {
  /** Markdown body to act on. */
  content: string;
  /**
   * Short, human-readable label for this content (e.g. "Project Report",
   * "Keyword: AI Trends"). Used as a default editor title and to seed
   * task / note / file names.
   */
  title?: string;
  /** Arbitrary JSON metadata included in saves and exports. */
  metadata?: Record<string, unknown> | null;
  /**
   * Optional persistence callback. When provided, the full-screen editor
   * opens with a Save button that calls back with the new content. When
   * omitted, the editor opens in view mode (no save button).
   */
  onSave?: (newContent: string) => void | Promise<void>;
  /**
   * Stable id used to scope overlay instances (full-screen editor, html
   * preview). Same input → same instance, so reopening from the same
   * source restores prior state. Falls back to a random id per render.
   */
  instanceKey?: string;
  isAuthenticated: boolean;
  dispatch: AppDispatch;
  onClose: () => void;
}

// ============================================================================
// HELPERS
// ============================================================================

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string") return error || fallback;
  if (error && typeof error === "object") {
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
  ctx: ContentActionContext,
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

/** Slug-friendly token derived from a free-form title. */
function slugify(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

/**
 * Extract the first fenced code block from a markdown string. Falls back
 * to the full content when no fence is present.
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

function fileExtForLanguage(language: string | undefined): string {
  switch (language) {
    case "typescript":
      return "ts";
    case "javascript":
      return "js";
    case "python":
      return "py";
    case "json":
      return "json";
    case "html":
      return "html";
    case "css":
      return "css";
    case "markdown":
    case "md":
      return "md";
    default:
      return "txt";
  }
}

// ============================================================================
// ITEM FACTORIES
// ============================================================================

function viewItem(ctx: ContentActionContext): MenuItem {
  const { content, title, metadata, onSave, dispatch, onClose, instanceKey } =
    ctx;
  return {
    key: "open-full-screen",
    icon: Edit,
    iconColor: "text-emerald-500 dark:text-emerald-400",
    label: onSave ? "Open in editor" : "Open in viewer",
    action: () => {
      const instanceId =
        instanceKey ?? `content-editor-${Date.now().toString(36)}`;
      // Route the caller's onSave through the callback registry (a function
      // can't survive Redux — the controller drops it). Read-only callers
      // pass no onSave → no group, no Save button.
      const callbackGroupId = onSave
        ? createFullScreenEditorCallbackGroup({
            onSave: async (newContent: string) => {
              try {
                await onSave(newContent);
              } catch (err) {
                // eslint-disable-next-line no-console
                console.error("[ContentActionBar] onSave failed", err);
                toast.error(getErrorMessage(err, "Save failed"));
                return;
              }
              dispatch(
                closeOverlay({ overlayId: "fullScreenEditor", instanceId }),
              );
            },
          }).callbackGroupId
        : null;
      dispatch(
        openOverlay({
          overlayId: "fullScreenEditor",
          instanceId,
          data: {
            content,
            mode: "free",
            callbackGroupId,
            tabs: ["write", "matrx_split", "markdown", "wysiwyg", "preview"],
            initialTab: "matrx_split",
            analysisData: metadata as Record<string, unknown> | undefined,
            title: title,
            showSaveButton: !!onSave,
            showCopyButton: true,
          },
        }),
      );
      onClose();
    },
    category: "View",
    showToast: false,
  };
}

function copyItems(ctx: ContentActionContext): MenuItem[] {
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

function exportItems(ctx: ContentActionContext): MenuItem[] {
  const {
    content,
    title,
    metadata,
    isAuthenticated,
    dispatch,
    onClose,
    instanceKey,
  } = ctx;

  return [
    {
      key: "html-preview",
      icon: Eye,
      iconColor: "text-indigo-500 dark:text-indigo-400",
      label: "HTML preview",
      action: () => {
        const instanceId = instanceKey
          ? `html-preview-${instanceKey}`
          : `html-preview-${Date.now().toString(36)}`;
        // No message/conversation target here (generic content, not a
        // cx_message), and `onSave` can't travel through Redux — so the
        // bridge opens in publish/preview mode with no Save button. Mirrors
        // the proven chat-message dispatch shape exactly.
        dispatch(
          openOverlay({
            overlayId: "htmlPreview",
            instanceId,
            data: {
              content,
              title: title
                ? `HTML preview · ${title}`
                : "HTML Preview & Publishing",
              description:
                "Edit markdown, preview HTML, and publish your content",
              showSaveButton: false,
              isAgentSystem: false,
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
            const html = `<!DOCTYPE html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>${
              title ?? "Content"
            }</title><style>${cssContent}</style></head><body>${filteredHtml}</body></html>`;
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
            metadata: {
              ...(metadata ?? {}),
              ...(title ? { title } : {}),
              timestamp: new Date().toLocaleString(),
            },
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
        printMarkdownContent(content, title ?? "Content");
        onClose();
      },
      category: "Export",
      showToast: false,
    },
  ];
}

function saveItems(ctx: ContentActionContext): MenuItem[] {
  const { content, title, metadata, dispatch, onClose } = ctx;
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
          label: title ?? "New Note",
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
            "Sign in to save notes and organize your content.",
          )
        )
          return;
        dispatch(
          openOverlay({
            overlayId: "saveToNotes",
            instanceId: ctx.instanceKey
              ? `save-notes-${ctx.instanceKey}`
              : `save-notes-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
        const slug = slugify(title, "snippet");
        const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        await CodeFilesAPI.create({
          name: `${slug}-${ts}.${fileExtForLanguage(language)}`,
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
        const slug = slugify(title, "content");
        const blob = new Blob([content], {
          type: "text/markdown;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${slug}-${ts}.md`;
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
      label: "Create task from content",
      action: () => {
        if (
          !requireAuth(
            ctx,
            "add-to-tasks",
            "Create task",
            "Sign in to create and track tasks from your content.",
          )
        )
          return;
        const preview = content.slice(0, 400);
        const firstLine =
          content
            .trim()
            .split(/\n+/)[0]
            ?.replace(/^[#>*\-\s]+/, "")
            .slice(0, 60) || "";
        const seedTitle = title
          ? `Task Related To: ${title}`
          : firstLine
            ? `Task Related To: ${firstLine}${firstLine.length >= 60 ? "…" : ""}`
            : "Task Related To Content";

        dispatch(
          setPendingSource({
            entity_type: "generic_content",
            entity_id: "",
            label: title ? `${title} — ${preview.slice(0, 80)}` : preview,
            metadata: {
              ...(title ? { source_title: title } : {}),
              ...(metadata ?? {}),
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

function appItems(ctx: ContentActionContext): MenuItem[] {
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
// PUBLIC REGISTRY
// ============================================================================

export interface ContentActionsOptions {
  /** Hide the App items (feedback / announcements / preferences). Default false. */
  hideAppItems?: boolean;
  /** Hide the open-in-editor item. Default false. */
  hideViewItem?: boolean;
}

/**
 * Build the menu item list for `ContentActionBar`.
 * Shape:
 *   View    → Open in viewer / editor
 *   Copy    → plain / Docs / Word
 *   Export  → HTML preview, Copy HTML page, Email, Print/Save PDF
 *   Actions → Save to Scratch/Notes/Code/File, Add to Tasks
 *   App     → Feedback, Announcements, Preferences
 */
export function getContentActions(
  ctx: ContentActionContext,
  options: ContentActionsOptions = {},
): MenuItem[] {
  const items: MenuItem[] = [];
  if (!options.hideViewItem) items.push(viewItem(ctx));
  items.push(...copyItems(ctx));
  items.push(...exportItems(ctx));
  items.push(...saveItems(ctx));
  if (!options.hideAppItems) items.push(...appItems(ctx));
  return items;
}

// ============================================================================
// POST-AUTH RESUME
// ============================================================================

/**
 * Replay any action the user requested while signed-out, after they sign
 * back in. Mirrors `messageActionRegistry.resumePendingAuthAction` but
 * uses the content-scoped storage key.
 */
export function resumePendingContentAuthAction(
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
          name: `snippet-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${fileExtForLanguage(language)}`,
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
        : "Task Related To Content";
      dispatch(
        setPendingSource({
          entity_type: "generic_content",
          entity_id: "",
          label: preview,
          prePopulate: { title: seedTitle, description: savedContent },
        }),
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      "[ContentActionBar] resumePendingContentAuthAction failed",
      extractErrorMessage(err),
    );
  }
}
