"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Check,
  Copy,
  ChevronDown,
  ChevronUp,
  FileText,
  Image as ImageIcon,
  Music,
  Youtube,
  Globe,
  Paperclip,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  parseResourcesFromMessage,
  extractMessageWithoutResources,
  messageContainsResources,
} from "@/features/conversation/utils/resource-parsing";
import { ResourcesContainer } from "@/features/agents/resources/ResourceDisplay";
import { InlineMediaRef } from "@/features/files";
import type {
  ConversationMessage,
  ConversationResource,
} from "@/features/cx-chat/types/conversation";

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
              <div className="h-10 w-12 flex flex-col items-center justify-center bg-muted py-1">
                <Icon className="h-6 w-6 text-muted-foreground mb-1" />
                <span className="text-[8px] text-muted-foreground text-center truncate w-full px-1">
                  {data.filename || resource.type}
                </span>
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
    navigator.clipboard.writeText(message.content).then(() => {
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
                variant="ghost"
                size="sm"
                onClick={handleEditCancel}
                className="h-6 px-2 text-xs text-muted-foreground"
              >
                Cancel
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleEditSave}
                disabled={!hasUnsavedChanges}
                className="h-6 px-2 text-xs"
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
                  variant="ghost"
                  size="sm"
                  onClick={handleEditStart}
                  className="h-6 w-6 p-0 text-muted-foreground bg-muted/80 hover:bg-muted"
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
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                className="h-6 w-6 p-0 text-muted-foreground bg-muted/80 hover:bg-muted"
                title="Copy"
              >
                {isCopied ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </Button>
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
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleCollapse();
                          }}
                          className="h-6 w-6 p-0 rounded-full bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground"
                          title="Expand message"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </Button>
                      </div>
                    </>
                  )}
                  {shouldBeCollapsible && !isCollapsed && (
                    <div className="flex justify-center mt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleCollapse();
                        }}
                        className="h-6 w-6 p-0 rounded-full text-muted-foreground hover:text-foreground"
                        title="Collapse message"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </Button>
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
