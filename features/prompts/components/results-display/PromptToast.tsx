"use client";

import React, { useState, useMemo } from 'react';

/**
 * Process streaming content to handle <thinking> and <planning> tags
 */
function processStreamingContent(content: string): {
  displayContent: string;
  isInThinking: boolean;
  isInPlanning: boolean;
} {
  // Check if we're currently inside an unclosed thinking tag
  const thinkingOpenCount = (content.match(/<thinking>/g) || []).length;
  const thinkingCloseCount = (content.match(/<\/thinking>/g) || []).length;
  const isInThinking = thinkingOpenCount > thinkingCloseCount;
  
  // Check if we're currently inside an unclosed planning tag
  const planningOpenCount = (content.match(/<planning>/g) || []).length;
  const planningCloseCount = (content.match(/<\/planning>/g) || []).length;
  const isInPlanning = planningOpenCount > planningCloseCount;
  
  // Remove all complete thinking and planning tag blocks
  let displayContent = content
    .replace(/<thinking>[\s\S]*?<\/thinking>/g, '')
    .replace(/<planning>[\s\S]*?<\/planning>/g, '');
  
  // If we're inside an unclosed tag, remove everything from that opening tag onwards
  if (isInThinking) {
    displayContent = displayContent.replace(/<thinking>[\s\S]*$/g, '');
  }
  if (isInPlanning) {
    displayContent = displayContent.replace(/<planning>[\s\S]*$/g, '');
  }
  
  // Trim whitespace
  displayContent = displayContent.trim();
  
  return {
    displayContent,
    isInThinking,
    isInPlanning
  };
}

interface PromptToastProps {
  toastId: string;
  result: string;
  promptName: string;
  promptData?: any;
  executionConfig?: any;
  runId?: string; // ⭐ Execution instance runId
  taskId?: string; // Socket.io task ID for loading full result
  isStreaming?: boolean; // Whether the response is currently streaming
  onDismiss: (toastId: string) => void;
}

/**
 * PromptToast - Toast notification for quick AI prompt results
 * 
 * Features:
 * - Permanent display until manually dismissed
 * - Shows prompt name and result with markdown rendering
 * - "Show More" button to expand to compact modal for long content
 * - Manual dismiss option
 * - Stacks with other toasts
 * - Slide-in animation
 * - Uses RichDocument (remote action surface) for rendering + actions
 */
export default function PromptToast({
  toastId,
  result: initialResult,
  promptName,
  promptData,
  executionConfig,
  runId,
  taskId,
  isStreaming: initialStreaming = false,
  onDismiss,
}: PromptToastProps) {
  const dispatch = useAppDispatch();
  const [isExiting, setIsExiting] = useState(false);
  
  // Get live streaming response from Redux if taskId provided
  const streamingResponse = useAppSelector((state) =>
    taskId ? '' : null
  );
  const hasEnded = true;
  
  // Use streaming response if available, otherwise use initial result
  const result = streamingResponse || initialResult;
  const isStreaming = taskId ? !hasEnded : initialStreaming;
  
  // Process content to handle thinking/planning tags
  const processedContent = useMemo(() => {
    return processStreamingContent(result);
  }, [result]);
  
  const { displayContent, isInThinking, isInPlanning } = processedContent;
  
  // Check if content is long (more than 150 characters or 3 lines)
  const isLongContent = displayContent.length > 150 || displayContent.split('\n').length > 3;

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss(toastId);
    }, 300);
  };
  
  const handleShowMore = () => {
    // Open compact modal - use runId for Redux-driven display
    dispatch(openCompactModal({
      promptData: promptData || { 
        id: toastId, 
        name: promptName, 
        messages: [], 
        variableDefaults: [], 
        settings: {} 
      },
      executionConfig,
      title: promptName,
      runId: runId, // CRITICAL: Pass runId so PromptCompactModal can render
      // Use taskId for loading from state (preferred) or fallback to preloaded result
      taskId: taskId,
      preloadedResult: taskId ? undefined : displayContent,
    } as any));
    
    // Dismiss the toast
    handleDismiss();
  };

  return (
    <>
      {/* Fade animation for loading state */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes fadeInOut {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 1; }
          }
        `
      }} />
      
      <div
        className={`
          bg-card dark:bg-card
          border border-border dark:border-border
          rounded-lg shadow-lg
          max-w-sm w-full
          transition-all duration-300
          ${isExiting 
            ? 'opacity-0 translate-x-full' 
            : 'opacity-100 translate-x-0 animate-in slide-in-from-right-5'
          }
        `}
      >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-full bg-primary/10">
              <Check className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="text-xs font-medium text-muted-foreground">
              {promptName || 'AI Response'}
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content - Markdown rendered, line-clamped.
            actionsSurfaceId = `prompt-toast-${toastId}` so two toasts on
            screen don't share actions. */}
        <div className="text-sm leading-relaxed line-clamp-3 overflow-hidden">
          {isInThinking ? (
            <div className="flex items-start">
              <span className="text-sm text-muted-foreground animate-[fadeInOut_2s_ease-in-out_infinite]">
                Thinking....
              </span>
            </div>
          ) : isInPlanning ? (
            <div className="flex items-start">
              <span className="text-sm text-muted-foreground animate-[fadeInOut_2s_ease-in-out_infinite]">
                Planning....
              </span>
            </div>
          ) : isStreaming && !displayContent ? (
            <div className="flex items-start">
              <span className="text-sm text-muted-foreground animate-[fadeInOut_2s_ease-in-out_infinite]">
                Loading...
              </span>
            </div>
          ) : displayContent ? (
            // RichDocument wraps the same engine BasicMarkdownContent uses.
            // actionsVariant="remote" keeps the body chrome-free; the
            // action bar renders below via <RichDocumentActionSurface/>
            // (proves the remote-surface design end-to-end).
            <RichDocument
              content={displayContent}
              source={
                runId
                  ? ({ type: "prompt-result", executionId: runId } as ContentSource)
                  : ({ type: "raw" } as ContentSource)
              }
              actionsVariant="remote"
              actionsSurfaceId={`prompt-toast-${toastId}`}
              actions={{
                // Trim app-level entries — toasts don't need announcements
                // or preferences in their overflow.
                exclude: ["announcements", "preferences"],
              }}
              hideCopyButton
            />
          ) : (
            <span className="text-muted-foreground italic">No response</span>
          )}
        </div>

        {/* Action bar — renders below the line-clamp via the remote
            surface. Hidden during thinking/planning/loading. */}
        {!isInThinking && !isInPlanning && !isStreaming && displayContent ? (
          <div className="mt-1 -ml-1">
            <RichDocumentActionSurface
              surfaceId={`prompt-toast-${toastId}`}
              variant="mini-bar"
            />
          </div>
        ) : null}

        {/* Show More button for long content */}
        {isLongContent && (
          <button
            onClick={handleShowMore}
            className="mt-2 flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            <Maximize2 className="w-3 h-3" />
            <span>Show full response</span>
          </button>
        )}
      </div>
    </div>
    </>
  );
}

