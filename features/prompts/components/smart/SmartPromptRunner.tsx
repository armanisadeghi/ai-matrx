"use client";

import React, { useEffect, useMemo } from "react";

export interface SmartPromptRunnerProps {
    promptId?: string;
    executionConfig?: Omit<NewExecutionConfig, 'result_display'>;

    variables?: Record<string, string>;
    initialMessage?: string;
    onExecutionComplete?: (result: { runId: string; response: string; metadata: any }) => void;
    title?: string;
    runId?: string;
    onClose?: () => void;
    className?: string;
    isActive?: boolean; // Used to control initialization/reset
    customMessage?: string; // Optional custom message for AdditionalInfoModal
    countdownSeconds?: number; // Optional countdown override for AdditionalInfoModal

    enableAdditionalInfoModal?: boolean;

    /** Show/hide system messages in the message list (default: false) */
    showSystemMessage?: boolean;
}

/**
 * PromptRunner - Core prompt running functionality (Redux-Integrated)
 * 
 * This component now relies on the global Redux state for prompt execution.
 * It initializes the run if needed, but primarily acts as a view layer
 * connecting SmartPromptInput and SmartMessageList.
 */
export function SmartPromptRunner({
    promptId,
    executionConfig,
    variables: initialVariables,
    initialMessage,
    onExecutionComplete,
    title,
    runId,
    onClose,
    className,
    isActive = true,
    showSystemMessage = true,
}: SmartPromptRunnerProps) {
    const dispatch = useAppDispatch();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { isOpen: isCanvasOpen, close: closeCanvas, open: openCanvas, content: canvasContent } = useCanvas();

    // Selectors
    const instance = useAppSelector(state => runId ? selectInstance(state, runId) : null);
    const reduxConfig = useAppSelector(state => runId ? selectExecutionConfig(state, runId) : null);

    // Resolve configuration (prefer Redux if available, else props)
    const resolvedConfig = useMemo(() => {
        if (reduxConfig) return reduxConfig;
        return resolveExecutionConfig(executionConfig);
    }, [reduxConfig, executionConfig]);

    const { auto_run: autoRun } = resolvedConfig;

    // Initialize run if needed (and if we have a runId but no instance yet)
    useEffect(() => {
        if (isActive && runId && !instance && promptId) {
            dispatch(startPromptInstance({
                runId,
                promptId,
                executionConfig: resolvedConfig,
                variables: initialVariables,
                initialMessage,
                promptSource: 'prompts' // Default
            }));
        }
    }, [isActive, runId, instance, promptId, resolvedConfig, initialVariables, initialMessage, dispatch]);

    // Handle auto-run logic
    useEffect(() => {
        if (isActive && runId && instance && autoRun && instance.messages.length === 0 && instance.status === 'ready') {
            // Trigger execution
            dispatch(executeMessage({ runId }));
        }
    }, [isActive, runId, instance, autoRun, dispatch]);

    // ============================================================================================
    // STREAMING LOGIC
    // ============================================================================================
    const currentTaskId = instance?.execution?.currentTaskId;

    // Select ONLY the completion status, NOT the text
    const isResponseEnded = true;

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
                    metadata: {}
                });
            }
        }
    }, [runId, currentTaskId, isResponseEnded, dispatch, onExecutionComplete]);

    // Mobile detection (simplified for now)
    const isMobile = false;

    if (!runId) {
        return (
            <div className={`flex flex-col items-center justify-center h-full gap-4 ${className || ''}`}>
                <Loader2 className="w-12 h-12 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Initializing smart runner...</p>
            </div>
        );
    }

    // Render error state
    if (instance?.status === 'error') {
        return (
            <div className={`flex flex-col items-center justify-center h-full gap-4 p-8 ${className || ''}`}>
                <div className="p-3 bg-destructive/10 rounded-full">
                    <AlertCircle className="h-8 w-8 text-destructive" />
                </div>
                <div className="text-center">
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                        Execution Error
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        {instance.error || 'An error occurred'}
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
        <div className={`flex flex-col h-full overflow-hidden bg-background ${className || ''}`}>
            {/* Header / Title if needed */}
            {title && (
                <div className="flex items-center justify-between px-4 py-2 border-b">
                    <h2 className="text-lg font-semibold">{title}</h2>
                    {onClose && (
                        <Button variant="ghost" size="icon" onClick={onClose}>
                            <span className="sr-only">Close</span>
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-4 w-4"
                            >
                                <path d="M18 6 6 18" />
                                <path d="m6 6 12 12" />
                            </svg>
                        </Button>
                    )}
                </div>
            )}

            <div className="flex-1 flex overflow-hidden">
                {/* Main Content Area */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto scrollbar-hide">
                        <SmartMessageList runId={runId} showSystemMessage={showSystemMessage} />
                    </div>

                    {/* Input Area - Fixed at Bottom using flex-shrink */}
                    <div className={`flex-shrink-0 bg-textured ${isMobile
                        ? 'pt-4 pb-safe px-3'
                        : 'pt-6 pb-4 px-6'
                        }`}>
                        <div className={`rounded-xl ${isMobile ? 'w-full' : 'max-w-[800px] mx-auto'
                            }`}>
                            <SmartPromptInput
                                runId={runId}
                                placeholder="Type a message..."
                                sendButtonVariant="blue"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
