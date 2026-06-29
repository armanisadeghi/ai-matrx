/**
 * messageActionRegistry — Single source of truth for all message action menu items.
 *
 * Returns MenuItem[] based on a context object. All sub-modal actions dispatch
 * through overlaySlice typed creators (rendered by OverlayController at the app root).
 * Stateless actions (copy, print, save-as-file) execute directly.
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
  Volume2,
  Edit,
  CheckSquare,
  Mail,
  Printer,
  ScanLine,
  RotateCcw,
  Upload,
  FileType,
  Bug,
  Megaphone,
  Settings,
} from "lucide-react";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import { printMarkdownContent } from "@/features/conversation/utils/markdown-print";
import { loadWordPressCSS } from "@/features/html-pages/css/wordpress-styles";
import { NotesAPI } from "@/features/notes/service/notesApi";
import { toast } from "sonner";
import { chatConversationsActions } from "../_legacy-stubs";
import { editMessage } from "../_legacy-stubs";
import { buildContentBlocksForSave } from "@/features/cx-chat/utils/buildContentBlocksForSave";
import {
  openOverlay,
  closeOverlay,
} from "@/lib/redux/slices/overlaySlice";
import type { MenuItem } from "@/components/official/AdvancedMenu";
import type { AppDispatch } from "@/lib/redux/store";

const PENDING_ACTION_KEY = "matrx_pending_post_auth_action";

// ============================================================================
// CONTEXT
// ============================================================================

export interface MessageActionContext {
  instanceId: string;
  content: string;
  isAuthenticated: boolean;
  sessionId: string | null;
  messageId: string | null;
  conversationId: string | null;
  rawContent: unknown[] | null;
  metadata: Record<string, unknown> | null;
  hasUnsavedChanges: boolean;
  dispatch: AppDispatch;
  onClose: () => void;

  showFullPrint: boolean;
  onFullPrint?: () => void;
  isCapturing?: boolean;

  ttsState: {
    isTtsGenerating: boolean;
    isTtsPlaying: boolean;
    isBrowserTtsPlaying: boolean;
    cartesiaSpeak: (text: string) => Promise<void>;
    setBrowserTtsPlaying: (playing: boolean) => void;
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string") return error || fallback;
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

// ============================================================================
// REGISTRY
// ============================================================================

export function getMessageActions(ctx: MessageActionContext): MenuItem[] {
  const {
    content,
    isAuthenticated,
    sessionId,
    messageId,
    conversationId,
    rawContent,
    metadata,
    hasUnsavedChanges,
    dispatch,
    onClose,
    showFullPrint,
    onFullPrint,
    isCapturing,
    ttsState,
  } = ctx;

  const items: MenuItem[] = [
    // ── Edit ────────────────────────────────────────────────────
    {
      key: "edit-content",
      icon: Edit,
      iconColor: "text-emerald-500 dark:text-emerald-400",
      label: "Edit content",
      action: () => {
        const instanceId = `cx-edit-content-${messageId}`;
        dispatch(
          openOverlay({
            overlayId: "fullScreenEditor",
            instanceId,
            data: {
              content,
              mode: "free",
              conversationId: undefined,
              messageId: messageId ?? undefined,
              onSave: (newContent: string) => {
                if (sessionId && messageId) {
                  dispatch(
                    chatConversationsActions.updateMessage({
                      sessionId,
                      messageId,
                      updates: { content: newContent },
                    }),
                  );
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
    },
    {
      key: "reset-original",
      icon: RotateCcw,
      iconColor: "text-amber-500 dark:text-amber-400",
      label: "Reset to original",
      action: () => {
        if (!sessionId || !messageId) return;
        dispatch(
          chatConversationsActions.resetMessageContent({
            sessionId,
            messageId,
          }),
        );
        onClose();
      },
      category: "Edit",
      successMessage: "Content reset to original",
      disabled: !hasUnsavedChanges,
      hidden: !sessionId || !messageId,
    },
    {
      key: "save-edits",
      icon: Upload,
      iconColor: "text-green-500 dark:text-green-400",
      label: "Save changes",
      action: async () => {
        if (!sessionId || !messageId) return;
        const contentBlocks = buildContentBlocksForSave(
          content,
          rawContent ?? undefined,
        );
        await dispatch(
          editMessage({ sessionId, messageId, newContent: contentBlocks }),
        ).unwrap();
        onClose();
      },
      category: "Edit",
      successMessage: "Changes saved",
      errorMessage: "Failed to save changes",
      disabled: !hasUnsavedChanges,
      hidden: !sessionId || !messageId,
    },
    // ── Actions (auth-gated) ────────────────────────────────────
    {
      key: "add-to-tasks",
      icon: CheckSquare,
      iconColor: "text-blue-500 dark:text-blue-400",
      label: "Add to Tasks",
      action: () => {
        if (
          !requireAuth(
            ctx,
            "add-to-tasks",
            "Add to Tasks",
            "Sign in to create and track tasks from your AI responses.",
          )
        )
          return;
        dispatch(
          openOverlay({
            overlayId: "quickTasks",
            data: {
              content,
              metadata,
              prePopulate: {
                title: "New Task from AI Response",
                description: content,
                metadataInfo: metadata
                  ? `\n\n---\n**Origin:**\n${JSON.stringify(metadata, null, 2)}`
                  : "",
              },
            },
          }),
        );
        onClose();
      },
      category: "Actions",
      showToast: false,
    },

    // ── Audio ────────────────────────────────────────────────────
    {
      key: "play-audio",
      icon: Volume2,
      iconColor: "text-indigo-500 dark:text-indigo-400",
      label: "Play audio",
      action: async () => {
        if (isAuthenticated) {
          await ttsState.cartesiaSpeak(content);
        } else {
          if (typeof window === "undefined" || !window.speechSynthesis) {
            toast.error("Audio not supported in this browser");
            return;
          }
          if (ttsState.isBrowserTtsPlaying) {
            window.speechSynthesis.cancel();
            ttsState.setBrowserTtsPlaying(false);
            return;
          }
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(
            content.replace(/[#*_`[\]()|]/g, " ").trim(),
          );
          utterance.rate = 1.0;
          utterance.onend = () => ttsState.setBrowserTtsPlaying(false);
          utterance.onerror = () => ttsState.setBrowserTtsPlaying(false);
          window.speechSynthesis.speak(utterance);
          ttsState.setBrowserTtsPlaying(true);
        }
      },
      category: "Audio",
      successMessage: "Playing audio...",
      errorMessage: "Failed to play audio",
      disabled:
        ttsState.isTtsGenerating ||
        ttsState.isTtsPlaying ||
        ttsState.isBrowserTtsPlaying,
    },

    // ── Copy ─────────────────────────────────────────────────────
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

    // ── Export ───────────────────────────────────────────────────
    {
      key: "html-preview",
      icon: Eye,
      iconColor: "text-indigo-500 dark:text-indigo-400",
      label: "HTML preview",
      action: () => {
        const instanceId = `cx-html-preview-${messageId ?? "default"}`;
        dispatch(
          openOverlay({
            overlayId: "htmlPreview",
            instanceId,
            data: {
              content,
              messageId: messageId ?? undefined,
              conversationId: conversationId ?? undefined,
              title: "HTML Preview & Publishing",
              description: "Edit markdown, preview HTML, and publish your content",
              onSave: (newContent: string) => {
                if (sessionId && messageId) {
                  dispatch(
                    chatConversationsActions.updateMessage({
                      sessionId,
                      messageId,
                      updates: { content: newContent },
                    }),
                  );
                }
                dispatch(closeOverlay({ overlayId: "htmlPreview", instanceId }));
              },
              showSaveButton: Boolean(sessionId && messageId),
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
          // Unauthenticated: open email dialog to collect address
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
        // Authenticated: send directly without dialog
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
        printMarkdownContent(content, "AI Response");
        onClose();
      },
      category: "Export",
      showToast: false,
    },
    ...(showFullPrint && onFullPrint
      ? [
          {
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
          } as MenuItem,
        ]
      : []),

    // ── Save / Actions ───────────────────────────────────────────
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
            "Sign in to save notes and organize your AI responses.",
          )
        )
          return;
        dispatch(
          openOverlay({
            overlayId: "saveToNotes",
            instanceId: messageId
              ? `save-notes-${messageId}`
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
        a.download = `ai-response-${ts}.md`;
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
      key: "convert-broker",
      icon: Briefcase,
      iconColor: "text-amber-500 dark:text-amber-400",
      label: "Convert to broker",
      action: () => {
        toast.info("Coming soon", {
          description: "Convert to broker will be available shortly.",
        });
        onClose();
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
        onClose();
      },
      category: "Actions",
      showToast: false,
    },

    // ── App ─────────────────────────────────────────────────────
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

  return items;
}

/**
 * Resume pending post-auth actions stored in sessionStorage.
 * Call this from any component that renders after auth redirect.
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
    } else if (action === "add-to-tasks") {
      dispatch(
        openOverlay({
          overlayId: "quickTasks",
          data: {
            content: savedContent,
            prePopulate: {
              title: "New Task from AI Response",
              description: savedContent,
              metadataInfo: "",
            },
          },
        }),
      );
    }
  } catch {
    /* ignore parse errors */
  }
}
