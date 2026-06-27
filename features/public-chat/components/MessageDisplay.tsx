"use client";

import React, {
  useRef,
  useEffect,
  useState,
  useMemo,
  lazy,
  Suspense,
} from "react";
import {
  Copy,
  Check,
  ChevronDown,
  MessageSquare,
  AlertCircle,
  Edit,
  MoreHorizontal,
  FileText,
  Image as ImageIcon,
  Music,
  Youtube,
  Globe,
  Paperclip,
  TriangleAlert,
} from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { Button } from "@/components/ui/button";
import MarkdownStream from "@/components/MarkdownStream";
import type { ChatMessage } from "../context/DEPRECATED-ChatContext";
import type { PublicResource, PublicResourceType } from "../types/content";
import type { TypedStreamEvent } from "@/types/python-generated/stream-events";
import { buildCanonicalBlocks } from "@/lib/chat-protocol/from-stream";
import type { ToolCallBlock } from "@/lib/chat-protocol/types";
import { ToolCallVisualization as CanonicalToolCallVisualization } from "@/features/tool-call-visualization/components/ToolCallVisualization";
import { toolCallBlockToLifecycleEntry } from "@/features/tool-call-visualization/utils/toolCallBlockToLifecycleEntry";
import {
  parseResourcesFromMessage,
  extractMessageWithoutResources,
  messageContainsResources,
} from "@/features/agents/resources/utils";
import { ResourcesContainer } from "@/features/agents/resources/ResourceDisplay";
import { InlineMediaRef } from "@/features/files";

// ============================================================================
// MESSAGE ERROR BOUNDARY
// Confines rendering errors to individual messages so the sidebar, header,
// and other messages remain usable.
// ============================================================================

interface MessageErrorBoundaryProps {
  children: React.ReactNode;
  messageId?: string;
}

interface MessageErrorBoundaryState {
  hasError: boolean;
}

class MessageErrorBoundary extends React.Component<
  MessageErrorBoundaryProps,
  MessageErrorBoundaryState
> {
  constructor(props: MessageErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): MessageErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      "[MessageErrorBoundary] Render error in message",
      this.props.messageId,
      error,
      info,
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
          <TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            This message could not be displayed. The data may be in an
            unexpected format.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ============================================================================
// LAZY LOADED COMPONENTS (Heavy dependencies - only load when needed)
// ============================================================================

const FullScreenMarkdownEditor = lazy(
  () =>
    import("@/components/mardown-display/chat-markdown/FullScreenMarkdownEditor"),
);
const PublicMessageOptionsMenu = lazy(
  () => import("./PublicMessageOptionsMenu"),
);

// ============================================================================
// STREAMING CONTENT BLOCKS
// Uses the canonical chat-protocol to render interleaved text + tool blocks
// in arrival order during a stream. ToolCallBlock.phase drives spinner state
// so the UI never gets stuck (no positional inference).
// ============================================================================

interface StreamingContentBlocksProps {
  streamEvents: TypedStreamEvent[];
  isStreaming: boolean;
}

function StreamingContentBlocks({
  streamEvents,
  isStreaming,
}: StreamingContentBlocksProps) {
  const canonicalBlocks = useMemo(
    () => buildCanonicalBlocks(streamEvents),
    [streamEvents],
  );

  return (
    <>
      {canonicalBlocks.map((block, index) => {
        const isLastBlock = index === canonicalBlocks.length - 1;

        if (block.type === "text") {
          return (
            <MarkdownStream
              key={`stream-text-${index}`}
              content={block.content}
              isStreamActive={isLastBlock && isStreaming}
              hideCopyButton={true}
              allowFullScreenEditor={false}
              className="text-xs bg-transparent"
            />
          );
        }

        if (block.type === "tool_call") {
          const toolBlock = block as ToolCallBlock;
          // Determine whether visible text content exists after this tool
          const hasContentAfter = canonicalBlocks
            .slice(index + 1)
            .some(
              (b) =>
                b.type === "text" && (b as { content: string }).content.trim(),
            );

          const entry = toolCallBlockToLifecycleEntry(toolBlock);

          return (
            <CanonicalToolCallVisualization
              key={`stream-tool-${toolBlock.callId}`}
              entries={[entry]}
              hasContent={hasContentAfter}
              className="mb-2"
            />
          );
        }

        return null;
      })}
    </>
  );
}

// ============================================================================
// ATTACHED RESOURCES DISPLAY (for PublicResource[] from message.resources)
// ============================================================================

function getResourceIcon(type: PublicResourceType) {
  switch (type) {
    case "image_link":
      return ImageIcon;
    case "file":
    case "file_link":
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
  resources: PublicResource[];
}

function AttachedResourcesDisplay({
  resources,
}: AttachedResourcesDisplayProps) {
  if (resources.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {resources.map((resource, index) => {
        const Icon = getResourceIcon(resource.type);
        const isImage =
          resource.type === "image_link" ||
          (resource.type === "file" &&
            resource.data.mime_type?.startsWith("image/"));

        return (
          <div
            key={index}
            className="relative group rounded-lg overflow-hidden border border-border"
          >
            {isImage && resource.data.url ? (
              <InlineMediaRef
                ref={resource.data.url}
                size={{ width: 40, height: 40 }}
                fit="cover"
                rounded="none"
                fallback={null}
                alt={resource.data.filename || "Attached image"}
              />
            ) : (
              <div className="h-10 w-12 flex flex-col items-center justify-center bg-muted py-1">
                <Icon className="h-6 w-6 text-muted-foreground mb-1" />
                <span className="text-[8px] text-muted-foreground text-center truncate w-full px-1">
                  {resource.data.filename || resource.type}
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
// USER MESSAGE (Matching PromptUserMessage UI)
// ============================================================================

interface UserMessageProps {
  message: ChatMessage;
}

function UserMessage({ message }: UserMessageProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isCopied, setIsCopied] = useState(false);
  const [shouldBeCollapsible, setShouldBeCollapsible] = useState(false);
  const measureRef = useRef<HTMLDivElement>(null);
  const previousContentRef = useRef<string>("");

  // Parse resources from content
  const hasResources = useMemo(
    () => messageContainsResources(message.content),
    [message.content],
  );
  const resources = useMemo(
    () => (hasResources ? parseResourcesFromMessage(message.content) : []),
    [message.content, hasResources],
  );
  const textContent = useMemo(
    () =>
      hasResources
        ? extractMessageWithoutResources(message.content)
        : message.content,
    [message.content, hasResources],
  );

  // Determine if content is long enough to be collapsible
  useEffect(() => {
    if (measureRef.current) {
      const COLLAPSE_THRESHOLD = 48; // 12 * 4px = 48px (max-h-12)
      const contentHeight = measureRef.current.scrollHeight;
      const isContentLongEnough = contentHeight > COLLAPSE_THRESHOLD;
      const contentChanged = previousContentRef.current !== textContent;

      setShouldBeCollapsible(isContentLongEnough);

      if (contentChanged) {
        if (isContentLongEnough) {
          setIsCollapsed(true);
        } else {
          setIsCollapsed(false);
        }
        previousContentRef.current = textContent;
      }
    }
  }, [textContent]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(message.content).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  const toggleCollapse = () => {
    if (shouldBeCollapsible) {
      setIsCollapsed(!isCollapsed);
    }
  };

  const handleHeaderClick = () => {
    if (shouldBeCollapsible) {
      toggleCollapse();
    }
  };

  return (
    <div className="ml-12">
      {/* Unified container with border and background - matching PromptUserMessage */}
      <div className="bg-muted border border-border rounded-lg">
        {/* Content with click handler for collapse/expand */}
        <div
          className={`p-2 relative group ${shouldBeCollapsible ? "cursor-pointer" : ""}`}
          onClick={handleHeaderClick}
        >
          {/* Copy button - absolute positioned, only visible on hover */}
          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
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
            {/* Display resources first if any */}
            {resources.length > 0 && (
              <ResourcesContainer resources={resources} />
            )}

            {/* Display text content */}
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
                    {/* Gradient fade overlay */}
                    <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-muted via-muted/60 to-transparent pointer-events-none" />
                    {/* Expand chevron button */}
                    <div className="absolute -bottom-2 left-0 right-0 flex justify-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={toggleCollapse}
                        className="h-6 w-6 p-0 rounded-full bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title="Expand message"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Display attached resources if any (from message.resources, not embedded in content) */}
            {message.resources && message.resources.length > 0 && (
              <AttachedResourcesDisplay resources={message.resources} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ASSISTANT MESSAGE (Matching PromptAssistantMessage UI)
// ============================================================================

interface AssistantMessageProps {
  message: ChatMessage;
  streamEvents?: TypedStreamEvent[];
  isStreaming?: boolean;
  onContentChange?: (messageId: string, newContent: string) => void;
}

function AssistantMessage({
  message,
  streamEvents,
  isStreaming = false,
  onContentChange,
}: AssistantMessageProps) {
  const dispatch = useAppDispatch();
  const [isCopied, setIsCopied] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const moreOptionsButtonRef = useRef<HTMLButtonElement>(null);
  // Show loading only when there's truly nothing to display yet.
  // Once stream events start arriving (even before text chunks), we should
  // render those instead of the loading indicator.
  const hasAnyStreamContent = streamEvents && streamEvents.length > 0;
  const showLoading =
    message.status === "pending" ||
    (message.status === "streaming" &&
      !message.content &&
      !hasAnyStreamContent);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy: ", err);
    }
  };

  const handleEditClick = () => {
    setIsEditorOpen(true);
  };

  const handleSaveEdit = (newContent: string) => {
    if (onContentChange) {
      onContentChange(message.id, newContent);
    }
    setIsEditorOpen(false);
  };

  const handleCancelEdit = () => {
    setIsEditorOpen(false);
  };

  const toggleOptionsMenu = () => {
    setShowOptionsMenu(!showOptionsMenu);
  };

  const handleShowHtmlPreview = (_html?: string, _title?: string) => {
    dispatch(
      openOverlay({
        overlayId: "htmlPreview",
        data: {
          content: message.content,
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
  const isError = message.status === "error";

  if (showLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <div className="flex gap-1">
          <span
            className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce"
            style={{ animationDelay: "300ms" }}
          />
        </div>
        <span className="text-sm text-muted-foreground/80">Planning...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
        <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
        <div className="text-sm text-destructive">
          {message.content || "An error occurred"}
        </div>
      </div>
    );
  }

  const hasStreamEvents = streamEvents && streamEvents.length > 0;
  // Block mode: message carries its own events (content_block protocol)
  const hasBlockModeEvents =
    message.streamEvents && message.streamEvents.length > 0;

  return (
    <div>
      {/* Block mode: use MarkdownStream with events prop (content_block protocol) */}
      {hasBlockModeEvents ? (
        <MarkdownStream
          content={message.content}
          events={message.streamEvents}
          isStreamActive={isStreaming && message.status === "streaming"}
          hideCopyButton={true}
          allowFullScreenEditor={false}
          className="text-xs bg-transparent"
        />
      ) : hasStreamEvents ? (
        /* Normal streaming: render interleaved text + tool blocks in arrival order */
        <StreamingContentBlocks
          streamEvents={streamEvents!}
          isStreaming={isStreaming}
        />
      ) : (
        <MarkdownStream
          content={message.content}
          isStreamActive={isStreaming && message.status === "streaming"}
          hideCopyButton={true}
          allowFullScreenEditor={false}
          className="text-xs bg-transparent"
        />
      )}

      {/* Action buttons - only show when not streaming */}
      {!isStreaming && message.content && (
        <div className="flex items-center gap-1 mt-0.5">
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

          {/* Lazy load menu only when opened */}
          {showOptionsMenu && (
            <Suspense fallback={null}>
              <PublicMessageOptionsMenu
                isOpen={showOptionsMenu}
                content={message.content}
                onClose={() => setShowOptionsMenu(false)}
                onShowHtmlPreview={handleShowHtmlPreview}
                onEditContent={handleEditClick}
                anchorElement={moreOptionsButtonRef.current}
              />
            </Suspense>
          )}
        </div>
      )}

      {/* Lazy load editor only when opened */}
      {isEditorOpen && (
        <Suspense fallback={null}>
          <FullScreenMarkdownEditor
            isOpen={isEditorOpen}
            initialContent={message.content}
            onSave={handleSaveEdit}
            onCancel={handleCancelEdit}
            tabs={["write", "markdown", "wysiwyg", "preview"]}
            initialTab="write"
          />
        </Suspense>
      )}
    </div>
  );
}

// ============================================================================
// MESSAGE LIST (Matching SmartMessageList UI)
// ============================================================================

interface MessageListProps {
  messages: ChatMessage[];
  streamEvents?: TypedStreamEvent[];
  isStreaming?: boolean;
  emptyStateMessage?: string;
  className?: string;
  /** Compact mode: reduces spacing and simplifies message display */
  compact?: boolean;
  /** Callback when a message content is edited */
  onMessageContentChange?: (messageId: string, newContent: string) => void;
  /** Ref to attach at the position of the latest assistant message (for scroll targeting) */
  latestAssistantRef?: React.RefObject<HTMLDivElement>;
}

export function MessageList({
  messages,
  streamEvents,
  isStreaming,
  emptyStateMessage = "Ready to start chatting",
  className = "",
  compact = false,
  onMessageContentChange,
  latestAssistantRef,
}: MessageListProps) {
  // Empty state - matching SmartMessageList
  if (messages.length === 0 && !isStreaming) {
    return (
      <div
        className={`flex flex-col items-center justify-center h-full min-h-[400px] text-muted-foreground ${className}`}
      >
        <MessageSquare className="w-16 h-16 mb-4" />
        <p className="text-lg font-medium">{emptyStateMessage}</p>
        <p className="text-sm mt-2 text-center px-6">
          Type your message below to get started
        </p>
      </div>
    );
  }

  // Adjust spacing classes based on compact mode
  const spacingClasses = compact
    ? "space-y-2 pt-0 pb-2"
    : "space-y-6 pt-0 pb-4";

  // Find the index of the last assistant message
  const lastAssistantIndex = messages.reduce(
    (acc, msg, idx) => (msg.role === "assistant" ? idx : acc),
    -1,
  );

  // Detect the boundary between condensed and active messages
  const firstActiveIndex = messages.findIndex((m) => !m.isCondensed);
  const hasCondensedMessages = firstActiveIndex > 0;

  return (
    <div className={`${spacingClasses} ${className}`}>
      {messages.map((message, index) => {
        const isLastMessage = index === messages.length - 1;
        const isLastAssistant = isLastMessage && message.role === "assistant";
        const isLatestAssistant = index === lastAssistantIndex;

        // Show separator between condensed and active messages
        const showCondensedSeparator =
          hasCondensedMessages && index === firstActiveIndex;

        return (
          <div
            key={message.id}
            // Latest assistant message gets min-height so the user can
            // scroll past the end of the content — keeps the last lines
            // comfortably above the input bar rather than pinned to the bottom.
            className={isLatestAssistant ? "min-h-[50dvh]" : ""}
          >
            {/* Condensed/Active boundary separator */}
            {showCondensedSeparator && (
              <div className="flex items-center gap-3 py-2 mb-4">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Older messages
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
            )}

            {/* Scroll anchor: placed right before the latest assistant message */}
            {/* h-4 creates breathing room below the header when scrolled to top */}
            {isLatestAssistant && latestAssistantRef && (
              <div ref={latestAssistantRef} className="h-2" />
            )}

            {/* Condensed message wrapper — dimmed opacity */}
            <div className={message.isCondensed ? "opacity-60" : ""}>
              {message.role === "user" ? (
                <UserMessage message={message} />
              ) : (
                <MessageErrorBoundary messageId={message.id}>
                  <AssistantMessage
                    message={message}
                    streamEvents={isLastAssistant ? streamEvents : undefined}
                    isStreaming={isLastAssistant && isStreaming}
                    onContentChange={onMessageContentChange}
                  />
                </MessageErrorBoundary>
              )}
            </div>
          </div>
        );
      })}

      {/* Breathing room: allows user to scroll content a bit higher */}
      <div className="h-64" aria-hidden="true" />
    </div>
  );
}

export default MessageList;
