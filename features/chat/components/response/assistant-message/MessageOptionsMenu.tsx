/**
 * @deprecated Use the Redux-driven MessageOptionsMenu from
 * `features/cx-conversation/MessageOptionsMenu` instead. This legacy variant
 * manages its own local state for sub-modals and will be removed after migration.
 */
import React from "react";
import {
  BookText,
  FileText,
  Briefcase,
  Copy,
  FileCode,
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
} from "lucide-react";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import { printMarkdownContent } from "@/features/chat/utils/markdown-print-utils";
import { loadWordPressCSS } from "@/features/html-pages/css/wordpress-styles";
import AdvancedMenu, { MenuItem } from "@/components/official/AdvancedMenu";
import { NotesAPI } from "@/features/notes/service/notesApi";
import { useCartesiaSpeaker } from "@/features/tts/hooks/useCartesiaSpeaker";
import { READ_ALOUD_DICTIONARY_SURFACE } from "@/features/dictionary/constants";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { toast } from "sonner";
import { useQuickActions } from "@/features/quick-actions/hooks/useQuickActions";

interface MessageOptionsMenuProps {
  content: string;
  onClose: () => void;
  onShowHtmlPreview?: (html: string, title?: string) => void;
  onEditContent?: () => void;
  /** Trigger full DOM-capture PDF export of the entire rendered message */
  onFullPrint?: () => void;
  /** True while a DOM-capture export is in progress — disables the menu item */
  isCapturing?: boolean;
  isOpen: boolean;
  anchorElement?: HTMLElement | null;
  metadata?: {
    taskId?: string;
    runId?: string;
    messageId?: string;
    [key: string]: any;
  };
}

const MessageOptionsMenu: React.FC<MessageOptionsMenuProps> = ({
  content,
  onClose,
  onShowHtmlPreview,
  onEditContent,
  onFullPrint,
  isCapturing,
  isOpen,
  anchorElement,
  metadata,
}) => {
  const dispatch = useAppDispatch();
  const { openQuickTasks } = useQuickActions();

  // Lazy TTS hook — does nothing until speak() is called (no eager token fetch)
  const {
    speak,
    isLoading: isTtsGenerating,
    isPlaying: isTtsPlaying,
  } = useCartesiaSpeaker({ processMarkdown: true, dictionarySurfaceKey: READ_ALOUD_DICTIONARY_SURFACE });

  // Notes handlers
  const handleSaveToScratch = async () => {
    await NotesAPI.create({
      label: "New Note",
      content: content,
      folder_name: "Scratch",
      tags: [],
    });
  };

  const handleSaveToNotes = () => {
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
  };

  // Add to Tasks handler
  const handleAddToTasks = () => {
    // Prepare task data with content and metadata
    const taskData = {
      content,
      metadata,
      prePopulate: {
        title: "New Task from AI Response",
        description: content,
        metadataInfo: metadata
          ? `\n\n---\n**Origin Info:**\n${JSON.stringify(metadata, null, 2)}`
          : "",
      },
    };

    openQuickTasks(taskData);
    onClose();
  };

  // TTS handler
  const handlePlayAudio = async () => {
    await speak(content);
  };

  // Edit Content handler
  const handleEditContent = () => {
    if (onEditContent) {
      onEditContent();
    }
    onClose();
  };

  // Copy handlers - simplified without state management
  const getErrorMessage = (error: unknown, fallback: string): string => {
    if (error instanceof Error) return error.message || fallback;
    if (typeof error === "string") return error || fallback;
    return fallback;
  };

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

  const handleHtmlPreview = async () => {
    if (!onShowHtmlPreview) {
      throw new Error("HTML preview handler not configured");
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
    <style>
${cssContent}
    </style>
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
        } catch (error) {
          throw new Error("Failed to generate complete HTML");
        }
      },
      onSuccess: () => {},
      onError: (error) => {
        throw new Error(getErrorMessage(error, "Failed to generate HTML"));
      },
    });
  };

  // Save as file handler
  const handleSaveAsFile = () => {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const filename = `ai-response-${timestamp}.md`;
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onClose();
  };

  // Print / Save as PDF handler (Tier 1 — regex-based, prose only)
  const handlePrint = () => {
    printMarkdownContent(content, "AI Response");
    onClose();
  };

  // Full Print — DOM-capture PDF of all rendered blocks (Tier 2)
  const handleFullPrint = () => {
    if (onFullPrint) {
      onFullPrint();
      onClose();
    }
  };

  // Email to me handler
  const handleEmailToMe = async () => {
    const response = await fetch("/api/chat/email-response", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        metadata: {
          ...metadata,
          timestamp: new Date().toLocaleString(),
        },
      }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.msg || "Failed to send email");
    }

    onClose();
  };

  // Build menu items for AdvancedMenu (iOS-style: icon + label only)
  const menuItems: MenuItem[] = [
    // Edit Content - First for easy access
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
    // Add to Tasks
    {
      key: "add-to-tasks",
      icon: CheckSquare,
      iconColor: "text-blue-500 dark:text-blue-400",
      label: "Add to Tasks",
      action: handleAddToTasks,
      category: "Actions",
      successMessage: "Opening Tasks...",
      errorMessage: "Failed to open Tasks",
      showToast: false,
    },
    // Audio Option
    {
      key: "play-audio",
      icon: Volume2,
      iconColor: "text-indigo-500 dark:text-indigo-400",
      label: "Play audio",
      action: handlePlayAudio,
      category: "Audio",
      successMessage: "Playing audio...",
      errorMessage: "Failed to play audio",
      disabled: isTtsGenerating || isTtsPlaying,
    },
    // Copy Options
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
    // Export Options
    {
      key: "html-preview",
      icon: Eye,
      iconColor: "text-indigo-500 dark:text-indigo-400",
      label: "HTML preview",
      action: handleHtmlPreview,
      category: "Export",
      successMessage: "Preview opened",
      errorMessage: "Failed to open preview",
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
      successMessage: "Email sent!",
      errorMessage: "Failed to send email",
    },
    {
      key: "print",
      icon: Printer,
      iconColor: "text-slate-500 dark:text-slate-400",
      label: "Print / Save PDF",
      action: handlePrint,
      category: "Export",
      successMessage: "Opening print view...",
      errorMessage: "Failed to open print view",
      showToast: false,
    },
    {
      key: "full-print",
      icon: ScanLine,
      iconColor: "text-slate-600 dark:text-slate-300",
      label: isCapturing ? "Generating PDF…" : "Full Print (all blocks)",
      action: handleFullPrint,
      category: "Export",
      successMessage: "Generating PDF...",
      errorMessage: "Failed to generate PDF",
      showToast: false,
      hidden: !onFullPrint,
      disabled: isCapturing,
    },
    // Action Options
    {
      key: "save-scratch",
      icon: FileText,
      iconColor: "text-cyan-500 dark:text-cyan-400",
      label: "Save to Scratch",
      action: handleSaveToScratch,
      category: "Actions",
      successMessage: "Saved to Scratch!",
      errorMessage: "Failed to save",
    },
    {
      key: "save-notes",
      icon: Save,
      iconColor: "text-violet-500 dark:text-violet-400",
      label: "Save to Notes",
      action: handleSaveToNotes,
      category: "Actions",
      successMessage: "Opening save dialog...",
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
    </>
  );
};

export default MessageOptionsMenu;
