"use client";

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { toast } from "@/lib/toast";
import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Check,
  Copy,
  ChevronDown,
  ChevronUp,
  FileText,
  Image as ImageIcon,
  Music,
  Globe,
  Paperclip,
} from "lucide-react";
import { Youtube } from "@ai-matrx/icons/brand";
import { Button } from "@ai-matrx/design-system/controls";
import {
  parseResourcesFromMessage,
  extractMessageWithoutResources,
  messageContainsResources,
} from "../../../conversation/utils/resource-parsing";
import { ResourcesContainer } from "../../../agents/resources/ResourceDisplay";
import { InlineMediaRef } from "@ai-matrx/media/react";
import { VideoPublishDate } from "@ai-matrx/media/files";
import type {
  ConversationMessage,
  ConversationResource,
} from "../../types/conversation";

// ============================================================================
// ATTACHED RESOURCES DISPLAY (structured array — images, files, etc.)
// ============================================================================

type ResourceType = string;

function getResourceIcon(type: ResourceType) {
  switch (type) {
    case "image_link":
    case "image_url":
      return ImageIcon;
    case "file":
    case "file_link":
    case "file_url":
    case "storage":
      return FileText;
    case "audio":
      return Music;
    case "youtube":
      return Youtube;
    case "webpage":
      return Globe;
    default:
      return Paperclip;
  }
}

interface AttachedResourcesDisplayProps {
  resources: ConversationResource[];
}

function AttachedResourcesDisplay({
  resources,
}: AttachedResourcesDisplayProps) {
  if (resources.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {resources.map((resource, index) => {
        const Icon = getResourceIcon(resource.type);
        const data = resource.data as Record<string, string>;
        const isImage =
          resource.type === "image_link" ||
          resource.type === "image_url" ||
          (resource.type === "file" && data.mime_type?.startsWith("image/"));

        return (
          <div
            key={index}
            className="relative group rounded-lg overflow-hidden border border-border"
          >
            {isImage && data.url ? (
              <InlineMediaRef
                ref={data.url}
                size={{ width: 40, height: 40 }}
                fit="cover"
                rounded="none"
                fallback={null}
                alt={data.filename || "Attached image"}
              />
            ) : (
              <div className="relative h-10 w-12 flex flex-col items-center justify-center bg-muted py-1">
                <Icon className="h-6 w-6 text-muted-foreground mb-1" />
                {resource.type === "youtube" ? (
                  <VideoPublishDate
                    publishedAt={data.publishedAt ?? data.published_at}
                    className="text-[8px]"
                  />
                ) : (
                  <span className="text-[8px] text-muted-foreground text-center truncate w-full px-1">
                    {data.filename || resource.type}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// USER MESSAGE
// ============================================================================

interface UserMessageProps {
  message: ConversationMessage;
  onContentChange?: (messageId: string, newContent: string) => void;
  compact?: boolean;
}

export function UserMessage({
  message,
  onContentChange,
  compact = false,
}: UserMessageProps) {
  const { copyText } = useClipboard({
    notify: (message, kind) =>
      kind === "error" ? toast.error(message) : toast.success(message),
  });
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isCopied, setIsCopied] = useState(false);
  const [shouldBeCollapsible, setShouldBeCollapsible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const measureRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previousContentRef = useRef<string>("");

  // Parse resources embedded in content (XML format)
  const hasEmbeddedResources = useMemo(
    () => messageContainsResources(message.content),
    [message.content],
  );
  const embeddedResources = useMemo(
    () =>
      hasEmbeddedResources ? parseResourcesFromMessage(message.content) : [],
    [message.content, hasEmbeddedResources],
  );
  const textContent = useMemo(
    () =>
      hasEmbeddedResources
        ? extractMessageWithoutResources(message.content)
        : message.content,
    [message.content, hasEmbeddedResources],
  );

  // Determine collapsibility based on DOM height (48px threshold)
  useEffect(() => {
    if (!measureRef.current) return;
    const COLLAPSE_THRESHOLD = 48;
    const contentHeight = measureRef.current.scrollHeight;
    const isLong = contentHeight > COLLAPSE_THRESHOLD;
    const contentChanged = previousContentRef.current !== textContent;

    setShouldBeCollapsible(isLong);
    if (contentChanged) {
      setIsCollapsed(isLong);
      previousContentRef.current = textContent;
    }
  }, [textContent]);

  // Auto-resize textarea while editing
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [isEditing, editContent]);

  // Expand when entering edit mode
  useEffect(() => {
    if (isEditing) {
      setIsCollapsed(false);
    }
  }, [isEditing]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    copyText(message.content).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  const handleToggleCollapse = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (shouldBeCollapsible) {
      setIsCollapsed((prev) => !prev);
    }
  };

  const handleEditStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditContent(message.content);
    setHasUnsavedChanges(false);
    setIsEditing(true);
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditContent(e.target.value);
    setHasUnsavedChanges(e.target.value !== message.content);
  };

  const handleEditSave = () => {
    if (onContentChange && hasUnsavedChanges) {
      onContentChange(message.id, editContent);
    }
    setIsEditing(false);
    setHasUnsavedChanges(false);
  };

  const handleEditCancel = () => {
    // Discard without confirmation — no window.confirm
    setEditContent(message.content);
    setHasUnsavedChanges(false);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      handleEditCancel();
    } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      handleEditSave();
    }
  };

  const marginClass = compact ? "" : "ml-12";

  return (
    <div className={marginClass}>
      <div className="bg-muted border border-border rounded-lg">
        {isEditing ? (
          // ── Edit mode ──────────────────────────────────────────────
          <div className="p-2 space-y-2">
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={handleEditChange}
              onKeyDown={handleKeyDown}
              className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary min-h-[60px]"
              style={{ fontSize: "16px" }} // iOS zoom prevention
              autoFocus
            />
            <div className="flex items-center gap-2 justify-end">
              <Button
                variant="quiet"
                onClick={handleEditCancel}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleEditSave}
                disabled={!hasUnsavedChanges}
              >
                Save
              </Button>
            </div>
          </div>
        ) : (
          // ── View mode ──────────────────────────────────────────────
          <div
            className={`p-2 relative group ${shouldBeCollapsible ? "cursor-pointer" : ""}`}
            onClick={() => handleToggleCollapse()}
          >
            {/* Action buttons — hover-revealed, top-right */}
            <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
              {onContentChange && (
                <Button
                  variant="quiet"
                  onClick={handleEditStart}
                  className="w-6"
                  title="Edit message"
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </Button>
              )}
              <Button
                icon={isCopied ? (
                  <Check />
                ) : (
                  <Copy />
                )} aria-label="Copy"
                variant="quiet"
                onClick={handleCopy}
                title="Copy"
              />
            </div>

            <div className="space-y-2">
              {/* XML-parsed resources (expandable typed cards) */}
              {embeddedResources.length > 0 && (
                <ResourcesContainer resources={embeddedResources} />
              )}

              {/* Text content */}
              {textContent.trim() && (
                <div className="relative">
                  <div
                    ref={measureRef}
                    className={`text-xs text-foreground whitespace-pre-wrap break-words overflow-hidden transition-all duration-300 ${
                      shouldBeCollapsible && isCollapsed ? "max-h-12" : ""
                    }`}
                  >
                    {textContent}
                  </div>
                  {shouldBeCollapsible && isCollapsed && (
                    <>
                      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-muted via-muted/60 to-transparent pointer-events-none" />
                      <div className="absolute -bottom-2 left-0 right-0 flex justify-center">
                        <Button
                          icon={<ChevronDown />} aria-label="Expand message"
                          variant="quiet"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleCollapse();
                          }}
                          title="Expand message"
                        />
                      </div>
                    </>
                  )}
                  {shouldBeCollapsible && !isCollapsed && (
                    <div className="flex justify-center mt-1">
                      <Button
                        icon={<ChevronUp />} aria-label="Collapse message"
                        variant="quiet"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleCollapse();
                        }}
                        title="Collapse message"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Structured resource array (thumbnails for images, chips for others) */}
              {message.resources && message.resources.length > 0 && (
                <AttachedResourcesDisplay resources={message.resources} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default UserMessage;
