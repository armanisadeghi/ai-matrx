/**
 * @deprecated Use the Redux-driven MessageOptionsMenu from
 * `features/cx-conversation/MessageOptionsMenu` instead. This legacy variant
 * manages its own local state for sub-modals and will be removed after migration.
 */
"use client";

import React, { useState, useEffect } from "react";
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
  Database,
  LayoutDashboard,
  Share2,
} from "lucide-react";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import { loadWordPressCSS } from "@/features/html-pages/css/wordpress-styles";
import AdvancedMenu, { MenuItem } from "@/components/official/AdvancedMenu";
import { EmailInputDialog } from "@/components/dialogs/EmailInputDialog";
import { AuthGateDialog } from "@/components/dialogs/AuthGateDialog";
import { NotesAPI } from "@/features/notes/service/notesApi";
import { toast } from "@/lib/toast";
import { announceComingSoon } from "@/lib/coming-soon/announce";
import { useSelector } from "react-redux";
import { selectUser } from "@/lib/redux/slices/userSlice";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";

// Key used to store pending actions across the auth redirect
const PENDING_ACTION_KEY = "matrx_pending_post_auth_action";

interface PublicMessageOptionsMenuProps {
  content: string;
  onClose: () => void;
  onShowHtmlPreview?: (html: string, title?: string) => void;
  onEditContent?: () => void;
  onOpenCanvas?: () => void;
  onQuickHtmlShare?: () => void;
  isOpen: boolean;
  anchorElement?: HTMLElement | null;
  metadata?: {
    taskId?: string;
    [key: string]: unknown;
  };
}

/**
 * Universal message options menu for public and SSR routes.
 *
 * - Every feature from the authenticated MessageOptionsMenu is present here.
 * - Features that require auth are gated: unauthenticated users see the option,
 *   click it, and get a sign-in prompt that returns them to this page after login.
 * - When already authenticated, all features work exactly as in the full menu.
 * - TTS uses browser speechSynthesis (no auth required) with a fallback notice.
 */
const PublicMessageOptionsMenu: React.FC<PublicMessageOptionsMenuProps> = ({
  content,
  onClose,
  onShowHtmlPreview,
  onEditContent,
  onOpenCanvas,
  onQuickHtmlShare,
  isOpen,
  anchorElement,
  metadata,
}) => {
  const dispatch = useAppDispatch();
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);
  const [authGateFeature, setAuthGateFeature] = useState<{
    name: string;
    description?: string;
  }>({ name: "this feature" });

  const user = useSelector(selectUser);
  const isAuthenticated = !!user?.email;

  // ── Resume pending post-auth actions ──────────────────────────────────────
  // After the user returns from login, execute any action that was pending.
  useEffect(() => {
    if (!isAuthenticated) return;
    try {
      const pending = sessionStorage.getItem(PENDING_ACTION_KEY);
      if (!pending) return;
      sessionStorage.removeItem(PENDING_ACTION_KEY);
      const { action, savedContent } = JSON.parse(pending) as {
        action: string;
        savedContent: string;
      };
      if (savedContent !== content) return; // stale — different message
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
            instanceId: crypto.randomUUID(),
            data: {
              initialContent: savedContent,
              defaultFolder: "Scratch",
              initialEditorMode: undefined,
            },
          }),
        );
      }
    } catch {
      /* ignore parse errors */
    }
  }, [isAuthenticated, content, dispatch]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const getErrorMessage = (error: unknown, fallback: string): string => {
    if (error instanceof Error) return error.message || fallback;
    if (typeof error === "string") return error || fallback;
    return fallback;
  };

  const requireAuth = (
    actionKey: string,
    featureName: string,
    description: string,
  ) => {
    if (!isAuthenticated) {
      // Persist the action intent so it can resume after login
      try {
        sessionStorage.setItem(
          PENDING_ACTION_KEY,
          JSON.stringify({ action: actionKey, savedContent: content }),
        );
      } catch {
        /* ignore */
      }
      setAuthGateFeature({ name: featureName, description });
      setShowAuthGate(true);
      return false;
    }
    return true;
  };

  // ── Edit ───────────────────────────────────────────────────────────────────

  const handleEditContent = () => {
    if (onEditContent) onEditContent();
    onClose();
  };

  // ── TTS — browser speechSynthesis (no auth required) ─────────────────────

  const handlePlayAudio = () => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      toast.error("Audio not supported in this browser");
      return;
    }
    if (isTtsPlaying) {
      window.speechSynthesis.cancel();
      setIsTtsPlaying(false);
      return;
    }
    // Strip markdown syntax for cleaner speech
    const plainText = content
      .replace(/```[\s\S]*?```/g, "code block")
      .replace(/`[^`]+`/g, "")
      .replace(/#{1,6}\s/g, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/^\s*[-*+]\s/gm, "")
      .replace(/^\s*\d+\.\s/gm, "")
      .trim();

    const utterance = new SpeechSynthesisUtterance(plainText);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onstart = () => setIsTtsPlaying(true);
    utterance.onend = () => setIsTtsPlaying(false);
    utterance.onerror = () => {
      setIsTtsPlaying(false);
      toast.error("Audio playback failed");
    };
    window.speechSynthesis.speak(utterance);
    toast.success("Playing audio...", { description: "Using browser voice" });
    onClose();
  };

  // ── Copy handlers ──────────────────────────────────────────────────────────

  const handleCopyPlain = async () => {
    await copyToClipboard(content, {
      onSuccess: () => {},
      onError: (error) => {
        throw new Error(getErrorMessage(error, "Failed to copy text"));
      },
    });
  };

  const handleCopyGoogleDocs = async () => {
    await copyToClipboard(content, {
      isMarkdown: true,
      formatForGoogleDocs: true,
      onSuccess: () => {},
      onError: (error) => {
        throw new Error(
          getErrorMessage(error, "Failed to copy for Google Docs"),
        );
      },
    });
  };

  const handleCopyWithThinking = async () => {
    await copyToClipboard(content, {
      isMarkdown: true,
      includeThinking: true,
      onSuccess: () => {},
      onError: (error) => {
        throw new Error(getErrorMessage(error, "Failed to copy with thinking"));
      },
    });
  };

  // ── HTML/Export handlers ───────────────────────────────────────────────────

  const handleHtmlPreview = async () => {
    if (!onShowHtmlPreview) {
      // Fallback: open the quick share modal if available, otherwise toast
      if (onQuickHtmlShare) {
        onQuickHtmlShare();
        onClose();
        return;
      }
      toast.info("HTML preview not available in this context");
      return;
    }
    await copyToClipboard(content, {
      isMarkdown: true,
      formatForWordPress: true,
      showHtmlPreview: true,
      onShowHtmlPreview: (html) => {
        onShowHtmlPreview(html, "WordPress HTML Preview");
        onClose();
      },
      onSuccess: () => {},
      onError: (error) => {
        throw new Error(
          getErrorMessage(error, "Failed to generate HTML preview"),
        );
      },
    });
  };

  const handleQuickHtmlShare = () => {
    if (onQuickHtmlShare) {
      onQuickHtmlShare();
      onClose();
    } else {
      toast.info("Share not available in this context");
    }
  };

  const handleOpenCanvas = () => {
    if (isAuthenticated) {
      if (onOpenCanvas) {
        onOpenCanvas();
        onClose();
      } else {
        toast.info("Canvas not available in this context");
      }
    } else {
      requireAuth(
        "view-canvas",
        "Canvas View",
        "Sign in to view this response in the interactive canvas. You'll be right back.",
      );
      onClose();
    }
  };

  const handleCopyCompleteHTML = async () => {
    await copyToClipboard(content, {
      isMarkdown: true,
      formatForWordPress: true,
      showHtmlPreview: true,
      onShowHtmlPreview: async (filteredHtml) => {
        try {
          const cssContent = await loadWordPressCSS();
          const completeHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WordPress Content</title>
    <style>${cssContent}</style>
</head>
<body>
    ${filteredHtml}
</body>
</html>`;
          await copyToClipboard(completeHTML, {
            onSuccess: () => {},
            onError: (error) => {
              throw new Error(getErrorMessage(error, "Failed to copy HTML"));
            },
          });
        } catch {
          throw new Error("Failed to generate complete HTML");
        }
      },
      onSuccess: () => {},
      onError: (error) => {
        throw new Error(getErrorMessage(error, "Failed to generate HTML"));
      },
    });
  };

  const handleSaveAsFile = () => {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ai-response-${timestamp}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onClose();
  };

  // ── Email handler ──────────────────────────────────────────────────────────

  const handleEmailToMe = async () => {
    if (isAuthenticated) {
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
    } else {
      setShowEmailDialog(true);
      onClose();
    }
  };

  const handleSendEmail = async (email: string) => {
    const response = await fetch("/api/public/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: email,
        subject: `AI Chat Response - ${new Date().toLocaleDateString()}`,
        content,
        isMarkdown: true,
      }),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.msg || "Failed to send email");
  };

  // ── Notes handlers ─────────────────────────────────────────────────────────

  const handleSaveToScratch = async () => {
    if (isAuthenticated) {
      await NotesAPI.create({
        label: "New Note",
        content,
        folder_name: "Scratch",
        tags: [],
      });
    } else {
      requireAuth(
        "save-scratch",
        "Save to Scratch",
        "Sign in to save this response to your Scratch notes. You'll be right back.",
      );
      onClose();
    }
  };

  const handleSaveToNotes = () => {
    if (isAuthenticated) {
      dispatch(
        openOverlay({
          overlayId: "saveToNotes",
          instanceId: crypto.randomUUID(),
          data: {
            initialContent: content,
            defaultFolder: "Scratch",
            initialEditorMode: undefined,
          },
        }),
      );
      onClose();
    } else {
      requireAuth(
        "save-notes",
        "Save to Notes",
        "Sign in to save this response to your notes. You'll be right back.",
      );
      onClose();
    }
  };

  // ── Tasks handler ──────────────────────────────────────────────────────────

  const handleAddToTasks = () => {
    if (
      !requireAuth(
        "add-to-tasks",
        "Add to Tasks",
        "Sign in to add this as a task. You'll be right back.",
      )
    )
      return;
    // Authenticated path: navigate to tasks with content pre-filled via query param
    const taskContent = encodeURIComponent(content.slice(0, 500));
    window.open(`/tasks/new?content=${taskContent}`, "_blank", "noopener");
    onClose();
  };

  // ── Coming soon stubs ──────────────────────────────────────────────────────

  const handleConvertToBroker = () => {
    void announceComingSoon("rich-document.convert-to-broker");
    onClose();
  };

  const handleAddToDocs = () => {
    void announceComingSoon("chat.add-to-docs");
    onClose();
  };

  // ── Menu items — identical structure to MessageOptionsMenu ─────────────────

  const menuItems: MenuItem[] = [
    {
      key: "edit-content",
      icon: Edit,
      iconColor: "text-emerald-500 dark:text-emerald-400",
      label: "Edit content",
      action: handleEditContent,
      category: "Edit",
      successMessage: "Opening editor...",
      errorMessage: "Failed to open editor",
      showToast: false,
    },
    {
      key: "add-to-tasks",
      icon: CheckSquare,
      iconColor: "text-blue-500 dark:text-blue-400",
      label: "Add to Tasks",
      action: handleAddToTasks,
      category: "Edit",
      successMessage: "Opening Tasks...",
      errorMessage: "Failed to open Tasks",
      showToast: false,
    },
    {
      key: "play-audio",
      icon: Volume2,
      iconColor: "text-indigo-500 dark:text-indigo-400",
      label: isTtsPlaying ? "Stop audio" : "Play audio",
      action: handlePlayAudio,
      category: "Audio",
      successMessage: "Playing...",
      errorMessage: "Failed to play audio",
      showToast: false,
    },
    {
      key: "copy-plain",
      icon: Copy,
      iconColor: "text-blue-500 dark:text-blue-400",
      label: "Copy text",
      action: handleCopyPlain,
      category: "Copy",
      successMessage: "Plain text copied",
      errorMessage: "Failed to copy text",
    },
    {
      key: "copy-docs",
      icon: FileText,
      iconColor: "text-green-500 dark:text-green-400",
      label: "Copy for Docs",
      action: handleCopyGoogleDocs,
      category: "Copy",
      successMessage: "Formatted for Google Docs",
      errorMessage: "Failed to copy",
    },
    {
      key: "copy-thinking",
      icon: Brain,
      iconColor: "text-purple-500 dark:text-purple-400",
      label: "With thinking",
      action: handleCopyWithThinking,
      category: "Copy",
      successMessage: "Copied with thinking blocks",
      errorMessage: "Failed to copy",
    },
    {
      key: "quick-share-html",
      icon: Share2,
      iconColor: "text-pink-500 dark:text-pink-400",
      label: "Share as HTML",
      action: handleQuickHtmlShare,
      category: "Export",
      successMessage: "Opening share...",
      errorMessage: "Failed to open share",
      showToast: false,
    },
    {
      key: "view-canvas",
      icon: LayoutDashboard,
      iconColor: "text-violet-500 dark:text-violet-400",
      label: "View in Canvas",
      action: handleOpenCanvas,
      category: "Export",
      successMessage: "Opening Canvas...",
      errorMessage: "Failed to open Canvas",
      showToast: false,
    },
    {
      key: "html-preview",
      icon: Eye,
      iconColor: "text-indigo-500 dark:text-indigo-400",
      label: "HTML preview",
      action: handleHtmlPreview,
      category: "Export",
      successMessage: "Preview opened",
      errorMessage: "Failed to open preview",
      showToast: false,
    },
    {
      key: "copy-html",
      icon: Globe,
      iconColor: "text-orange-500 dark:text-orange-400",
      label: "Copy HTML page",
      action: handleCopyCompleteHTML,
      category: "Export",
      successMessage: "HTML page copied",
      errorMessage: "Failed to copy HTML",
    },
    {
      key: "email-to-me",
      icon: Mail,
      iconColor: "text-sky-500 dark:text-sky-400",
      label: "Email to me",
      action: handleEmailToMe,
      category: "Export",
      successMessage: isAuthenticated ? "Email sent!" : "Opening email form...",
      errorMessage: "Failed to send email",
      showToast: isAuthenticated,
    },
    {
      key: "save-scratch",
      icon: FileText,
      iconColor: "text-cyan-500 dark:text-cyan-400",
      label: "Save to Scratch",
      action: handleSaveToScratch,
      category: "Actions",
      successMessage: isAuthenticated
        ? "Saved to Scratch!"
        : "Opening sign-in...",
      errorMessage: "Failed to save",
      showToast: isAuthenticated,
    },
    {
      key: "save-notes",
      icon: Save,
      iconColor: "text-violet-500 dark:text-violet-400",
      label: "Save to Notes",
      action: handleSaveToNotes,
      category: "Actions",
      successMessage: isAuthenticated
        ? "Opening save dialog..."
        : "Opening sign-in...",
      errorMessage: "Failed to open dialog",
      showToast: false,
    },
    {
      key: "save-file",
      icon: FileCode,
      iconColor: "text-rose-500 dark:text-rose-400",
      label: "Save as file",
      action: handleSaveAsFile,
      category: "Actions",
      successMessage: "File saved!",
      errorMessage: "Failed to save file",
    },
    {
      key: "convert-broker",
      icon: Briefcase,
      iconColor: "text-amber-500 dark:text-amber-400",
      label: "Convert to broker",
      action: handleConvertToBroker,
      category: "Actions",
      showToast: false,
    },
    {
      key: "add-docs",
      icon: BookText,
      iconColor: "text-emerald-500 dark:text-emerald-400",
      label: "Add to docs",
      action: handleAddToDocs,
      category: "Actions",
      showToast: false,
    },
  ];

  return (
    <>
      <AdvancedMenu
        isOpen={isOpen}
        onClose={onClose}
        items={menuItems}
        title="Message Options"
        position="bottom-left"
        anchorElement={anchorElement}
      />

      <EmailInputDialog
        isOpen={showEmailDialog}
        onClose={() => setShowEmailDialog(false)}
        onSubmit={handleSendEmail}
        title="Email this response"
        description="Enter your email address to receive this AI response."
        submitLabel="Send to Email"
      />

      <AuthGateDialog
        isOpen={showAuthGate}
        onClose={() => setShowAuthGate(false)}
        featureName={authGateFeature.name}
        featureDescription={authGateFeature.description}
      />
    </>
  );
};

export default PublicMessageOptionsMenu;
