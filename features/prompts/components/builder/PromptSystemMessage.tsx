"use client";
import React, { useState, useRef } from "react";
import { Edit, MoreHorizontal, Copy, Check } from "lucide-react";
import MarkdownStream from "@/components/MarkdownStream";
import { escapeEmbeddedCodeFences } from "@/features/prompts/utils/escape-code-fences";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { useOpenFullScreenMarkdownEditorBridge } from "@/features/overlays/openers/fullScreenEditor";
import MessageOptionsMenu from "@/features/chat/components/response/assistant-message/MessageOptionsMenu";
import { PromptErrorMessage } from "../PromptErrorMessage";
import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/lib/redux/hooks";

interface PromptSystemMessageProps {
  content: string;
  taskId?: string;
  messageIndex: number;
  isStreamActive?: boolean;
  onContentChange?: (messageIndex: number, newContent: string) => void;
  metadata?: {
    timeToFirstToken?: number;
    totalTime?: number;
    tokens?: number;
  };
  /** Compact mode: minimal header, reduced spacing */
  compact?: boolean;
}

export function PromptSystemMessage({
  content,
  taskId,
  messageIndex,
  isStreamActive = false,
  onContentChange,
  metadata,
  compact = false,
}: PromptSystemMessageProps) {
  const dispatch = useAppDispatch();
  const openEditor = useOpenFullScreenMarkdownEditorBridge();
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const moreOptionsButtonRef = useRef<HTMLButtonElement>(null);

  const handleContentChange = (newContent: string) => {
    if (onContentChange) {
      onContentChange(messageIndex, newContent);
    }
  };

  const handleEditClick = () => {
    // In-memory prompt edit (no DB message) → the save goes back through
    // onContentChange. Route it via the callback registry (the opener hook),
    // never an onSave function in Redux data — the controller drops that.
    openEditor({
      content,
      mode: "free",
      onSave: onContentChange
        ? (newContent: string) => onContentChange(messageIndex, newContent)
        : undefined,
      tabs: ["write", "markdown", "wysiwyg", "preview"],
      initialTab: "write",
      showSaveButton: !!onContentChange,
      showCopyButton: true,
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy: ", err);
    }
  };

  const toggleOptionsMenu = () => {
    setShowOptionsMenu(!showOptionsMenu);
  };

  const handleShowHtmlPreview = () => {
    dispatch(
      openOverlay({
        overlayId: "htmlPreview",
        data: {
          content,
          messageId: undefined,
          conversationId: undefined,
          title: "HTML Preview & Publishing",
          description: "Edit markdown, preview HTML, and publish your content",
          onSave: undefined,
          showSaveButton: false,
          isAgentSystem: false,
        },
      }),
    );
  };

  // Check if this is an error message
  const isError = content.startsWith("Error:");

  // Adjust styling based on compact mode - keep ALL functionality
  const markdownClassName = compact
    ? "text-xs bg-amber-500/5 border-l border-amber-500/30 px-1.5 py-1"
    : "bg-amber-500/5 border-l-2 border-amber-500/30 p-2";
  const buttonMargin = compact ? "mt-0.5" : "mt-1";

  return (
    <div>
      {isError ? (
        <PromptErrorMessage message={content.replace("Error: ", "")} />
      ) : (
        <>
          <MarkdownStream
            content={escapeEmbeddedCodeFences(content)}
            taskId={taskId}
            isStreamActive={isStreamActive}
            hideCopyButton={true}
            allowFullScreenEditor={!compact}
            className={markdownClassName}
            onContentChange={handleContentChange}
          />
          {!isStreamActive && (
            <div className={`flex items-center gap-1 ${buttonMargin}`}>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                className="h-6 w-6 p-0 text-muted-foreground"
                title="Copy"
              >
                {isCopied ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </Button>
              {onContentChange && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleEditClick}
                  className="h-6 w-6 p-0 text-muted-foreground"
                  title="Edit in full screen"
                >
                  <Edit className="w-3.5 h-3.5" />
                </Button>
              )}
              <Button
                ref={moreOptionsButtonRef}
                variant="ghost"
                size="sm"
                onClick={toggleOptionsMenu}
                className="h-6 w-6 p-0 text-muted-foreground"
                title="More options"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </Button>
              <MessageOptionsMenu
                isOpen={showOptionsMenu}
                content={content}
                onClose={() => setShowOptionsMenu(false)}
                onShowHtmlPreview={handleShowHtmlPreview}
                onEditContent={handleEditClick}
                anchorElement={moreOptionsButtonRef.current}
                metadata={
                  metadata
                    ? {
                        taskId,
                        ...metadata,
                      }
                    : undefined
                }
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
