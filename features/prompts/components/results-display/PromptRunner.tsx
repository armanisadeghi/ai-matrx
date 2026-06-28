/**
 * @deprecated
 * PromptRunner is superseded by components/conversation/ConversationShell.
 * Use ConversationShell with usePromptExecutionAdapter for new code.
 * This file will be removed after prompt-execution is fully migrated to chatConversations.
 */
"use client";

import React, { useEffect, useState } from "react";

export interface PromptRunnerProps {
  /** Required: The run ID - instance must exist in Redux */
  runId: string;

  /** Callback when execution completes */
  onExecutionComplete?: (result: {
    runId: string;
    response: string;
    metadata: any;
  }) => void;

  /** Optional title to display */
  title?: string;

  /** Callback when close is requested */
  onClose?: () => void;

  /** Additional CSS classes */
  className?: string;

  /** Show/hide system messages in the message list (default: true) */
  showSystemMessage?: boolean;

  /** Enable inline canvas (side-by-side with messages) - Canvas always on right */
  enableInlineCanvas?: boolean;
}

/**
 * PromptRunner - Core prompt display component (Redux-Driven)
 *
 * IMPORTANT: This component requires the instance to exist in Redux.
 * Callers must initialize via startPromptInstance or loadRun BEFORE rendering.
 *
 * The component reads ALL state from Redux:
 * - If requiresVariableReplacement && auto_run && status === 'ready' → auto-execute
 * - Otherwise → just render and wait for user input
 *
 * Supports inline canvas mode (side-by-side) with canvas priority sizing.
 */
export function PromptRunner({
  runId,
  onExecutionComplete,
  title,
  onClose,
  className,
  showSystemMessage = true,
  enableInlineCanvas = false,
}: PromptRunnerProps) {
  const dispatch = useAppDispatch();
  const isMobile = useIsMobile();

  // Canvas state
  const { isOpen: isCanvasOpen } = useCanvas();
  const currentCanvasItem = useAppSelector(selectCurrentCanvasItem);
  const canvasWidth = useAppSelector(selectCanvasWidth);

  // Select instance from Redux - MUST exist (caller is responsible for initialization)
  const instance = useAppSelector((state) => selectInstance(state, runId));

  // Viewport size tracking for inline canvas
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1200,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Handle auto-run logic - ONLY for first execution
  // Redux tells us everything: requiresVariableReplacement means first execution hasn't happened
  useEffect(() => {
    if (
      instance &&
      instance.requiresVariableReplacement &&
      instance.executionConfig.auto_run &&
      instance.status === "ready"
    ) {
      dispatch(executeMessage({ runId }));
    }
  }, [runId, instance, dispatch]);

  // ============================================================================================
  // STREAMING LOGIC
  // ============================================================================================
  const currentTaskId = instance?.execution?.currentTaskId;

  // Select ONLY the completion status, NOT the text
  const isResponseEnded = useAppSelector((state) =>
    currentTaskId
      ? true
      : false,
  );

  // Finalize execution when streaming ends
  useEffect(() => {
    if (runId && currentTaskId && isResponseEnded) {
      dispatch(finalizeExecution({ runId, taskId: currentTaskId }));

      // Trigger completion callback if needed
      if (onExecutionComplete) {
        // We might want to pass the final text here, but we'd need to select it.
        // For now, we'll just notify completion.
        onExecutionComplete({
          runId,
          response: "", // TODO: If needed, select final text here or let thunk handle it
          metadata: {},
        });
      }
    }
  }, [runId, currentTaskId, isResponseEnded, dispatch, onExecutionComplete]);

  // Determine if we should show inline canvas
  // Conditions:
  // 1. enableInlineCanvas prop is true
  // 2. Canvas is open
  // 3. Not on mobile
  // 4. Viewport is wide enough (min 1150px = 800px canvas + 400px messages)
  const minViewportForInline = 1200;
  const shouldShowInlineCanvas =
    enableInlineCanvas &&
    isCanvasOpen &&
    currentCanvasItem &&
    !isMobile &&
    viewportWidth >= minViewportForInline;

  // Handle canvas width changes
  const handleCanvasWidthChange = (newWidth: number) => {
    dispatch(setCanvasWidth(newWidth));
  };

  // Instance must exist in Redux (caller is responsible for initialization)
  if (!instance) {
    return (
      <div
        className={`flex flex-col items-center justify-center h-full gap-4 ${className || ""}`}
      >
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading run...</p>
      </div>
    );
  }

  // Render error state
  if (instance?.status === "error") {
    return (
      <div
        className={`flex flex-col items-center justify-center h-full gap-4 p-8 ${className || ""}`}
      >
        <div className="p-3 bg-destructive/10 rounded-full">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Execution Error
          </h3>
          <p className="text-sm text-muted-foreground">
            {instance.error || "An error occurred"}
          </p>
        </div>
        {onClose && (
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col h-full bg-textured w-full ${className || ""}`}
    >
      {/* Header / Title if needed */}
      {title && (
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
      )}

      <div
        className={`flex-1 flex flex-row min-h-0 px-2 ${isMobile ? "w-full overflow-x-hidden" : ""}`}
      >
        {/* Main Content Area - Messages Container */}
        <div
          className={`flex-1 flex flex-col min-h-0 ${isMobile ? "min-w-0" : "min-w-[400px]"}`}
        >
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            <SmartMessageList
              runId={runId}
              showSystemMessage={showSystemMessage}
            />
          </div>

          {/* Input Area - Fixed at Bottom using flex-shrink */}
          <div
            className={`flex-shrink-0 bg-textured ${
              isMobile ? "pt-4 pb-safe" : "pt-6 pb-2"
            }`}
          >
            <div
              className={`rounded-xl ${
                isMobile ? "w-full" : "max-w-[800px] mx-auto"
              }`}
            >
              <SmartPromptInput
                runId={runId}
                placeholder="Type a message..."
                sendButtonVariant="blue"
              />
            </div>
          </div>
        </div>

        {/* Inline Canvas - Right Side (Canvas Priority) */}
        {shouldShowInlineCanvas && currentCanvasItem && (
          <ResizableCanvas
            initialWidth={canvasWidth}
            minWidth={500}
            maxWidth={1200}
            onWidthChange={handleCanvasWidthChange}
            className="border-l border-zinc-200 dark:border-zinc-800"
          >
            <CanvasRenderer
              content={currentCanvasItem.content}
              variant="default"
            />
          </ResizableCanvas>
        )}
      </div>
    </div>
  );
}
