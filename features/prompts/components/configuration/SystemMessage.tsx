import React, { RefObject, useRef, useState, useLayoutEffect } from "react";
import { Maximize2, Braces, Edit2, Zap, Eraser, FileText, Eye } from "lucide-react";
import { VariableSelector } from "../VariableSelector";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UnifiedContextMenu } from "@/features/context-menu";
import { HighlightedText } from "../HighlightedText";
import { PromptMessage, PromptVariable, PromptSettings } from "@/features/prompts/types/core";
import { SystemPromptOptimizer } from "@/features/prompts/components/actions/prompt-optimizers/SystemPromptOptimizer";
import { TemplateSelector } from "@/features/content-templates/components/TemplateSelector";
import { ResponsiveIconButtonGroup, IconButtonConfig } from "@/components/official/ResponsiveIconButtonGroup";

interface SystemMessageProps {
    developerMessage: string;
    onDeveloperMessageChange: (value: string) => void;
    onDeveloperMessageClear: () => void;
    variableDefaults?: PromptVariable[];
    variablePopoverOpen?: boolean;
    onVariablePopoverOpenChange?: (open: boolean) => void;
    onInsertVariable?: (variable: string) => void;
    textareaRefs?: RefObject<Record<number, HTMLTextAreaElement | null>>;
    cursorPositions?: Record<number, number>;
    onCursorPositionChange?: (positions: Record<number, number>) => void;
    onOpenFullScreenEditor?: () => void;
    isEditing?: boolean;
    onIsEditingChange?: (isEditing: boolean) => void;
    scrollContainerRef?: RefObject<HTMLDivElement>;
    // Context data for UnifiedContextMenu
    allMessages?: PromptMessage[];
    modelConfig?: PromptSettings;
}

export function SystemMessage({
    developerMessage,
    onDeveloperMessageChange,
    onDeveloperMessageClear,
    variableDefaults = [],
    variablePopoverOpen = false,
    onVariablePopoverOpenChange,
    onInsertVariable,
    textareaRefs,
    cursorPositions = {},
    onCursorPositionChange,
    onOpenFullScreenEditor,
    isEditing = false,
    onIsEditingChange,
    scrollContainerRef,
    allMessages = [],
    modelConfig,
}: SystemMessageProps) {
    // System message uses index -1 in textareaRefs
    const systemMessageIndex = -1;
    
    // Track if context menu is open to prevent blur from closing edit mode
    const contextMenuOpenRef = useRef(false);
    
    // ⚠️ SCROLL FIX: Track whether textarea has been initialized (mounted).
    // Inline ref callbacks create new function refs on every render (React Compiler not enabled),
    // so React re-runs them on each keystroke. Without this guard, height="auto" in the ref
    // callback collapses the textarea without scroll protection.
    // Cleanup is handled via useLayoutEffect on isEditing (not in ref callback's else branch).
    const textareaInitializedRef = useRef(false);
    
    // ⚠️ SCROLL FIX: Bridge scroll position from event handlers to useLayoutEffect.
    // The onChange handler saves the CORRECT scroll position here BEFORE any state update.
    // The useLayoutEffect reads it AFTER React re-renders (when scrollTop may already be wrong
    // because the browser scrolled the focused textarea into view between onChange completing
    // and useLayoutEffect running).
    const scrollLockRef = useRef<{ scrollTop: number; overflow: string } | null>(null);
    
    // ⚠️ SCROLL FIX: Restore scroll position and overflow AFTER React re-renders.
    // useLayoutEffect runs synchronously after DOM commit but BEFORE browser paint.
    // By this point, onChange has already locked overflow:hidden and saved the correct
    // scroll position to scrollLockRef. We resize the textarea, restore scroll, and
    // THEN restore overflow — ensuring NO gap where the browser can auto-scroll.
    useLayoutEffect(() => {
        if (!isEditing) return;
        const textarea = textareaRefs?.current?.[systemMessageIndex];
        const scrollContainer = scrollContainerRef?.current;
        if (!textarea || !scrollContainer) return;
        
        // Use saved scroll from event handler, or current scrollTop as fallback
        // (fallback handles programmatic content changes where onChange didn't fire)
        const lockData = scrollLockRef.current;
        const savedScroll = lockData?.scrollTop ?? scrollContainer.scrollTop;
        const originalOverflow = lockData?.overflow ?? scrollContainer.style.overflow;
        
        // Ensure overflow is hidden during height recalculation
        scrollContainer.style.overflow = "hidden";
        textarea.style.height = "auto";
        textarea.style.height = textarea.scrollHeight + "px";
        
        // Restore scroll position FIRST (while overflow is still hidden)
        scrollContainer.scrollTop = savedScroll;
        // THEN restore overflow — no gap for browser to auto-scroll
        scrollContainer.style.overflow = originalOverflow;
        
        // Clear the lock
        scrollLockRef.current = null;
    }, [developerMessage, isEditing, scrollContainerRef, textareaRefs, systemMessageIndex]);
    
    // Clear initialization tracking when editing stops, so the textarea
    // re-initializes properly when editing resumes.
    useLayoutEffect(() => {
        if (!isEditing) {
            textareaInitializedRef.current = false;
        }
    }, [isEditing]);
    
    // Optimizer state
    const [isOptimizerOpen, setIsOptimizerOpen] = useState(false);
    
    // Check if variable insertion is enabled
    const hasVariableSupport = variableDefaults.length > 0 && onInsertVariable && onVariablePopoverOpenChange && textareaRefs && onCursorPositionChange;
    
    // Derive variable names from variableDefaults
    const variableNames = variableDefaults.map(v => v.name);
    
    const handleOptimizedAccept = (optimizedText: string) => {
        onDeveloperMessageChange(optimizedText);
    };

    // Configure buttons for ResponsiveIconButtonGroup
    const buttons: IconButtonConfig[] = [
        {
            id: 'variable',
            icon: Braces,
            tooltip: 'Insert Variable',
            mobileLabel: 'Insert Variable',
            hidden: !hasVariableSupport,
            render: () => {
                if (!hasVariableSupport) return null;
                
                return (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span 
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                }}
                            >
                                <VariableSelector
                                    variables={variableNames}
                                    onVariableSelected={(variable) => {
                                        if (onInsertVariable) {
                                            onInsertVariable(variable);
                                        }
                                    }}
                                    onBeforeOpen={() => {
                                        const textarea = textareaRefs?.current[systemMessageIndex];
                                        if (textarea && onCursorPositionChange) {
                                            onCursorPositionChange({
                                                ...cursorPositions,
                                                [systemMessageIndex]: textarea.selectionStart,
                                            });
                                        }
                                        if (!isEditing && onIsEditingChange) {
                                            onIsEditingChange(true);
                                        }
                                    }}
                                />
                            </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="z-[9999]">
                            Insert Variable
                        </TooltipContent>
                    </Tooltip>
                );
            },
        },
        {
            id: 'template',
            icon: FileText,
            tooltip: 'Templates',
            mobileLabel: 'Templates',
            render: (isMobile) => {
                // On desktop, use icon-only version; on mobile, show in menu
                return (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span>
                                <TemplateSelector
                                    role="system"
                                    currentContent={developerMessage}
                                    onTemplateSelected={(content) => onDeveloperMessageChange(content)}
                                    onSaveTemplate={() => {}}
                                    messageIndex={systemMessageIndex}
                                />
                            </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="z-[9999]">
                            Templates
                        </TooltipContent>
                    </Tooltip>
                );
            },
        },
        {
            id: 'optimize',
            icon: Zap,
            tooltip: 'Optimize with AI',
            mobileLabel: 'Optimize with AI',
            onClick: (e) => {
                e?.stopPropagation();
                setIsOptimizerOpen(true);
            },
            onMouseDown: (e) => {
                e.preventDefault();
                e.stopPropagation();
            },
            iconClassName: 'text-purple-400',
            className: 'hover:text-purple-300',
        },
        {
            id: 'fullscreen',
            icon: Maximize2,
            tooltip: 'Open in full screen editor',
            mobileLabel: 'Full Screen Editor',
            onClick: (e) => {
                e?.stopPropagation();
                onOpenFullScreenEditor?.();
            },
            onMouseDown: (e) => {
                e.preventDefault();
                e.stopPropagation();
            },
            hidden: !onOpenFullScreenEditor,
        },
        {
            id: 'edit',
            icon: isEditing ? Eye : Edit2,
            tooltip: isEditing ? 'View' : 'Edit',
            mobileLabel: isEditing ? 'View' : 'Edit',
            onClick: (e) => {
                e?.stopPropagation();
                onIsEditingChange?.(!isEditing);
            },
            onMouseDown: (e) => {
                e.preventDefault();
                e.stopPropagation();
            },
            hidden: !onIsEditingChange,
        },
        {
            id: 'clear',
            icon: Eraser,
            tooltip: 'Clear message',
            mobileLabel: 'Clear Message',
            onClick: (e) => {
                e?.stopPropagation();
                onDeveloperMessageClear();
            },
            onMouseDown: (e) => {
                e.preventDefault();
                e.stopPropagation();
            },
        },
    ];
    
    return (
        <div className="space-y-3">
            <div className="group border-border rounded-lg bg-gray-50 dark:bg-gray-800">
                {/* Header */}
                <div className="flex items-center justify-between px-2 py-1">
                    <Label className="text-xs text-gray-600 dark:text-gray-400">System</Label>
                    <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                        <ResponsiveIconButtonGroup
                            buttons={buttons}
                            sheetTitle="System Message Actions"
                            size="sm"
                        />
                    </div>
                </div>

                {/* Content */}
                <div className="p-4">
                    {isEditing ? (
                        <UnifiedContextMenu 
                            getTextarea={() => textareaRefs?.current[systemMessageIndex] || null}
                            contextData={{
                                content: developerMessage,
                                context: JSON.stringify({
                                    messages: allMessages,
                                    systemMessage: developerMessage,
                                    variableDefaults,
                                    settings: modelConfig,
                                }),
                                currentMessageRole: "system",
                                allMessages: JSON.stringify(allMessages),
                                systemMessage: developerMessage,
                                promptVariables: JSON.stringify(variableDefaults),
                            }}
                            enabledPlacements={['ai-action', 'content-block', 'quick-action']}
                            isEditable={true}
                            enableFloatingIcon={true}
                            onTextReplace={(newText) => {
                                const textarea = textareaRefs?.current[systemMessageIndex];
                                if (textarea) {
                                    const start = textarea.selectionStart;
                                    const end = textarea.selectionEnd;
                                    const before = developerMessage.substring(0, start);
                                    const after = developerMessage.substring(end);
                                    onDeveloperMessageChange(before + newText + after);
                                    
                                    setTimeout(() => {
                                        textarea.focus();
                                        textarea.setSelectionRange(start, start + newText.length);
                                    }, 0);
                                }
                            }}
                            onTextInsertBefore={(text) => {
                                const textarea = textareaRefs?.current[systemMessageIndex];
                                if (textarea) {
                                    const start = textarea.selectionStart;
                                    const before = developerMessage.substring(0, start);
                                    const after = developerMessage.substring(start);
                                    const insertText = text + '\n\n';
                                    onDeveloperMessageChange(before + insertText + after);
                                    
                                    setTimeout(() => {
                                        textarea.focus();
                                        textarea.setSelectionRange(start + insertText.length, start + insertText.length);
                                    }, 0);
                                }
                            }}
                            onTextInsertAfter={(text) => {
                                const textarea = textareaRefs?.current[systemMessageIndex];
                                if (textarea) {
                                    const end = textarea.selectionEnd;
                                    const before = developerMessage.substring(0, end);
                                    const after = developerMessage.substring(end);
                                    const insertText = '\n\n' + text;
                                    onDeveloperMessageChange(before + insertText + after);
                                    
                                    setTimeout(() => {
                                        textarea.focus();
                                        textarea.setSelectionRange(end + insertText.length, end + insertText.length);
                                    }, 0);
                                }
                            }}
                            onContentInserted={() => {
                                // Reset context menu flag after insertion
                                contextMenuOpenRef.current = false;
                            }}
                        >
                            <textarea
                                ref={(el) => {
                                    if (textareaRefs?.current) {
                                        textareaRefs.current[systemMessageIndex] = el;
                                    }
                                    if (el) {
                                        // ⚠️ SCROLL FIX: Only run initialization on FIRST mount.
                                        // DO NOT add an else branch to clear textareaInitializedRef here!
                                        // Inline ref callbacks create new function refs on every render,
                                        // so React calls old ref(null) then new ref(el) on each re-render.
                                        // Cleanup is handled by the useLayoutEffect on isEditing.
                                        if (!textareaInitializedRef.current) {
                                            textareaInitializedRef.current = true;
                                            el.style.height = "auto";
                                            el.style.height = el.scrollHeight + "px";
                                            el.focus({ preventScroll: true });
                                        }
                                    }
                                }}
                                value={developerMessage}
                                onChange={(e) => {
                                    if (!scrollContainerRef?.current) {
                                        // Fallback if no scroll container ref
                                        onDeveloperMessageChange(e.target.value);
                                        e.target.style.height = "auto";
                                        e.target.style.height = e.target.scrollHeight + "px";
                                        return;
                                    }
                                    
                                    // ⚠️ SCROLL FIX: Save scroll position and lock overflow BEFORE state update.
                                    // The overflow stays hidden until useLayoutEffect restores it after React
                                    // re-renders. This eliminates the gap where the browser would auto-scroll
                                    // the focused textarea to the top of the scroll container.
                                    const scrollContainer = scrollContainerRef.current;
                                    if (!scrollLockRef.current) {
                                        // First keystroke — save original overflow
                                        scrollLockRef.current = {
                                            scrollTop: scrollContainer.scrollTop,
                                            overflow: scrollContainer.style.overflow,
                                        };
                                    } else {
                                        // Rapid typing — update scroll position but keep original overflow
                                        scrollLockRef.current.scrollTop = scrollContainer.scrollTop;
                                    }
                                    scrollContainer.style.overflow = "hidden";
                                    
                                    // State update (batched, re-render happens after event handler)
                                    onDeveloperMessageChange(e.target.value);
                                    
                                    // Synchronous height resize (overflow is already hidden)
                                    e.target.style.height = "auto";
                                    e.target.style.height = e.target.scrollHeight + "px";
                                    
                                    // Restore scroll position (may have shifted during height=auto)
                                    scrollContainer.scrollTop = scrollLockRef.current.scrollTop;
                                    
                                    // ⚠️ DO NOT restore overflow here — useLayoutEffect will do it
                                    // after React re-renders. Restoring here creates a gap where the
                                    // browser auto-scrolls the focused textarea into view.
                                }}
                                onKeyDown={(e) => {
                                    // ⚠️ CRITICAL: Lock scroll on keyboard input to prevent browser auto-scroll
                                    if (scrollContainerRef?.current) {
                                        const savedScroll = scrollContainerRef.current.scrollTop;
                                        // Use multiple RAF to catch any delayed scroll attempts
                                        requestAnimationFrame(() => {
                                            requestAnimationFrame(() => {
                                                if (scrollContainerRef.current) {
                                                    scrollContainerRef.current.scrollTop = savedScroll;
                                                }
                                            });
                                        });
                                    }
                                }}
                                onInput={(e) => {
                                    // ⚠️ CRITICAL: Lock scroll during input events (fires before onChange)
                                    if (scrollContainerRef?.current) {
                                        const savedScroll = scrollContainerRef.current.scrollTop;
                                        requestAnimationFrame(() => {
                                            if (scrollContainerRef.current) {
                                                scrollContainerRef.current.scrollTop = savedScroll;
                                            }
                                        });
                                    }
                                }}
                                onMouseDown={(e) => {
                                    // ⚠️ CRITICAL: Prevent scroll BEFORE focus event
                                    // Save scroll position before any potential scroll
                                    if (scrollContainerRef?.current) {
                                        const savedScroll = scrollContainerRef.current.scrollTop;
                                        // Restore after any browser scroll attempts
                                        requestAnimationFrame(() => {
                                            if (scrollContainerRef.current) {
                                                scrollContainerRef.current.scrollTop = savedScroll;
                                            }
                                        });
                                    }
                                }}
                                onSelect={(e) => {
                                    // ⚠️ CRITICAL: Lock scroll position during cursor movement
                                    if (scrollContainerRef?.current) {
                                        const savedScroll = scrollContainerRef.current.scrollTop;
                                        requestAnimationFrame(() => {
                                            if (scrollContainerRef.current) {
                                                scrollContainerRef.current.scrollTop = savedScroll;
                                            }
                                        });
                                    }
                                    
                                    // Track cursor position
                                    if (onCursorPositionChange) {
                                        const target = e.target as HTMLTextAreaElement;
                                        onCursorPositionChange({
                                            ...cursorPositions,
                                            [systemMessageIndex]: target.selectionStart,
                                        });
                                    }
                                }}
                                onContextMenu={() => {
                                    // Mark that context menu is being opened
                                    contextMenuOpenRef.current = true;
                                }}
                                onFocus={(e) => {
                                    // Note: Auto-resize handled in ref callback to prevent glitch
                                    // Note: Cursor position set by click handler (see SCROLL_FIX.md)
                                    // Only track the current cursor position on focus
                                    if (onCursorPositionChange) {
                                        onCursorPositionChange({
                                            ...cursorPositions,
                                            [systemMessageIndex]: e.target.selectionStart,
                                        });
                                    }
                                }}
                                onBlur={() => {
                                    // Don't close edit mode if context menu is open
                                    if (!contextMenuOpenRef.current && onIsEditingChange) {
                                        onIsEditingChange(false);
                                    }
                                    // Reset the flag after a short delay (in case menu was opened)
                                    setTimeout(() => {
                                        contextMenuOpenRef.current = false;
                                    }, 100);
                                }}
                                placeholder="You're a very helpful assistant"
                                className="w-full bg-gray-50 dark:bg-gray-800 border-none outline-none text-xs text-gray-900 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500 p-0 resize-none overflow-hidden leading-normal"
                                style={{
                                    minHeight: "240px",
                                    lineHeight: "1.5",
                                }}
                            />
                        </UnifiedContextMenu>
                    ) : (
                        <div
                            className="text-xs pb-2 text-gray-600 dark:text-gray-400 whitespace-pre-wrap cursor-text leading-normal"
                            onClick={(e) => {
                                // ⚠️ CRITICAL: DO NOT MODIFY THIS CLICK HANDLER WITHOUT READING ../SCROLL_FIX.md
                                // This prevents browser auto-scroll when transitioning to edit mode.
                                // Removing or modifying will break scroll position preservation.
                                
                                if (!scrollContainerRef?.current) return;
                                
                                const scrollContainer = scrollContainerRef.current;
                                const savedScrollPosition = scrollContainer.scrollTop;
                                
                                // Calculate approximate cursor position from click
                                const target = e.target as HTMLElement;
                                const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
                                let clickPosition = 0;
                                
                                if (range) {
                                    // Get text content up to the click point
                                    const preCaretRange = range.cloneRange();
                                    preCaretRange.selectNodeContents(target);
                                    preCaretRange.setEnd(range.endContainer, range.endOffset);
                                    clickPosition = preCaretRange.toString().length;
                                }
                                
                                onIsEditingChange && onIsEditingChange(true);
                                
                                // CRITICAL: Single requestAnimationFrame waits for React to render textarea
                                requestAnimationFrame(() => {
                                    scrollContainer.scrollTop = savedScrollPosition;
                                    
                                    // Set cursor position in the textarea
                                    const textarea = textareaRefs?.current?.[systemMessageIndex];
                                    if (textarea && clickPosition > 0) {
                                        textarea.setSelectionRange(clickPosition, clickPosition);
                                    }
                                });
                            }}
                            style={{
                                minHeight: "240px",
                                lineHeight: "1.5",
                            }}
                        >
                            {developerMessage ? (
                                <HighlightedText text={developerMessage} validVariables={variableNames} />
                            ) : (
                                <span className="text-gray-500 dark:text-gray-500 italic">
                                    You're a very helpful assistant
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>
            
            {/* System Prompt Optimizer Dialog */}
            <SystemPromptOptimizer
                isOpen={isOptimizerOpen}
                onClose={() => setIsOptimizerOpen(false)}
                currentSystemMessage={developerMessage}
                onAccept={handleOptimizedAccept}
            />
        </div>
    );
}

