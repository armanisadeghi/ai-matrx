// components/content-editor/ContentManagerMenu.tsx
"use client";

import React, { useState } from "react";
import {
  MoreVertical,
  Copy,
  FileText,
  Brain,
  Eye,
  Globe,
  Save,
  BookText,
  Briefcase,
  FileCode,
  Code2,
} from "lucide-react";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import { extractErrorMessage } from "@/utils/errors";
import { loadWordPressCSS } from "@/features/html-pages/css/wordpress-styles";
import AdvancedMenu, { MenuItem } from "@/components/official/AdvancedMenu";
import { NotesAPI } from "@/features/notes/service/notesApi";
import HtmlPreviewFullScreenEditor from "@/features/html-pages/components/HtmlPreviewFullScreenEditor";
import { useHtmlPreviewState } from "@/features/html-pages/hooks/useHtmlPreviewState";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { selectUser } from "@/lib/redux/selectors/userSelectors";

interface ContentManagerMenuProps {
  content: string;
  onShowHtmlPreview?: (html: string, title?: string) => void;
  className?: string;
}

export function ContentManagerMenu({
  content,
  onShowHtmlPreview,
  className = "",
}: ContentManagerMenuProps) {
  const dispatch = useAppDispatch();
  const [isOpen, setIsOpen] = useState(false);
  const [isHtmlEditorOpen, setIsHtmlEditorOpen] = useState(false);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const user = useAppSelector(selectUser);

  // HTML Preview Editor state
  const htmlPreviewState = useHtmlPreviewState({
    isOpen: isHtmlEditorOpen,
    markdownContent: content,
    user,
    publishedPageId: null,
    onPageIdChange: (pageId) => {
      // Optional: track published page ID if needed
      console.log("Published page ID:", pageId);
    },
  });

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
    setIsOpen(false);
  };

  // Copy handlers
  const handleCopyPlain = async () => {
    await copyToClipboard(content, {
      onSuccess: () => {},
      onError: (error) => {
        throw new Error(extractErrorMessage(error) || "Failed to copy text");
      },
    });
  };

  const handleCopyGoogleDocs = async () => {
    await copyToClipboard(content, {
      isMarkdown: true,
      formatForGoogleDocs: true,
      onSuccess: () => {},
      onError: (error) => {
        throw new Error(extractErrorMessage(error) || "Failed to copy for Google Docs");
      },
    });
  };

  const handleCopyWithThinking = async () => {
    await copyToClipboard(content, {
      isMarkdown: true,
      includeThinking: true,
      onSuccess: () => {},
      onError: (error) => {
        throw new Error(extractErrorMessage(error) || "Failed to copy with thinking");
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
        onShowHtmlPreview(html, "HTML Preview");
        setIsOpen(false);
      },
      onSuccess: () => {},
      onError: (error) => {
        throw new Error(extractErrorMessage(error) || "Failed to generate HTML preview");
      },
    });
  };

  const handleOpenHtmlEditor = () => {
    setIsHtmlEditorOpen(true);
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
    <title>Content</title>
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
              throw new Error(extractErrorMessage(error) || "Failed to copy HTML");
            },
          });
        } catch (error) {
          throw new Error("Failed to generate complete HTML");
        }
      },
      onSuccess: () => {},
      onError: (error) => {
        throw new Error(extractErrorMessage(error) || "Failed to generate HTML");
      },
    });
  };

  // Build menu items
  const menuItems: MenuItem[] = [
    // Publishing & HTML
    {
      key: "html-editor",
      icon: Code2,
      iconColor: "text-violet-600 dark:text-violet-400",
      label: "HTML Publisher",
      description: "Edit, publish & generate SEO content",
      action: handleOpenHtmlEditor,
      category: "Publishing",
      successMessage: "Opening HTML Publisher...",
      errorMessage: "Failed to open HTML Publisher",
      showToast: false,
    },
    // Copy Options
    {
      key: "copy-plain",
      icon: Copy,
      iconColor: "text-blue-500 dark:text-blue-400",
      label: "Copy text",
      description: "Plain text to clipboard",
      action: handleCopyPlain,
      category: "Copy",
      successMessage: "Plain text copied to clipboard",
      errorMessage: "Failed to copy text",
    },
    {
      key: "copy-docs",
      icon: FileText,
      iconColor: "text-green-500 dark:text-green-400",
      label: "Copy for Docs",
      description: "Formatted for Google Docs",
      action: handleCopyGoogleDocs,
      category: "Copy",
      successMessage: "Formatted for Google Docs",
      errorMessage: "Failed to copy for Google Docs",
    },
    {
      key: "copy-thinking",
      icon: Brain,
      iconColor: "text-purple-500 dark:text-purple-400",
      label: "With Thinking",
      description: "Include thinking blocks",
      action: handleCopyWithThinking,
      category: "Copy",
      successMessage: "Content with thinking blocks copied",
      errorMessage: "Failed to copy with thinking",
    },
    // Export Options
    ...(onShowHtmlPreview
      ? [
          {
            key: "html-preview",
            icon: Eye,
            iconColor: "text-indigo-500 dark:text-indigo-400",
            label: "HTML preview",
            description: "View formatted HTML",
            action: handleHtmlPreview,
            category: "Export",
            successMessage: "Preview opened",
            errorMessage: "Failed to open preview",
          },
        ]
      : []),
    {
      key: "copy-html",
      icon: Globe,
      iconColor: "text-orange-500 dark:text-orange-400",
      label: "Copy HTML page",
      description: "Complete HTML with CSS",
      action: handleCopyCompleteHTML,
      category: "Export",
      successMessage: "Complete HTML page copied",
      errorMessage: "Failed to copy HTML",
    },
    // Action Options
    {
      key: "save-scratch",
      icon: FileText,
      iconColor: "text-cyan-500 dark:text-cyan-400",
      label: "Save to Scratch",
      description: "Quick save to Scratch folder",
      action: handleSaveToScratch,
      category: "Actions",
      successMessage: "Saved to Scratch!",
      errorMessage: "Failed to save to Scratch",
    },
    {
      key: "save-notes",
      icon: Save,
      iconColor: "text-violet-500 dark:text-violet-400",
      label: "Save to Notes",
      description: "Edit and choose folder",
      action: handleSaveToNotes,
      category: "Actions",
      successMessage: "Opening save dialog...",
      errorMessage: "Failed to open save dialog",
      showToast: false,
    },
    {
      key: "convert-broker",
      icon: Briefcase,
      iconColor: "text-amber-500 dark:text-amber-400",
      label: "Convert to broker",
      description: "Create broker instance",
      action: () => {},
      category: "Actions",
      disabled: true,
      showToast: false,
    },
    {
      key: "add-docs",
      icon: BookText,
      iconColor: "text-emerald-500 dark:text-emerald-400",
      label: "Add to docs",
      description: "Save to documentation",
      action: () => {},
      category: "Actions",
      disabled: true,
      showToast: false,
    },
    {
      key: "save-file",
      icon: FileCode,
      iconColor: "text-rose-500 dark:text-rose-400",
      label: "Save as file",
      description: "Export to local file",
      action: () => {},
      category: "Actions",
      disabled: true,
      showToast: false,
    },
  ];

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(true)}
        className={`flex items-center justify-center p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors ${className}`}
        title="Content options"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>

      <AdvancedMenu
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        items={menuItems}
        title="Content Options"
        description="Copy, export, or save this content"
        position="bottom-left"
        anchorElement={buttonRef.current}
      />

      <HtmlPreviewFullScreenEditor
        isOpen={isHtmlEditorOpen}
        onClose={() => setIsHtmlEditorOpen(false)}
        htmlPreviewState={htmlPreviewState}
        title="HTML Content Publisher"
        description="Edit markdown, manage SEO, and publish your content"
      />
    </>
  );
}
