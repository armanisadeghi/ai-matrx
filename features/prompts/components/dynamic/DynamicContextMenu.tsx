/**
 * DynamicContextMenu
 *
 * Fully database-driven context menu that loads system prompts.
 * Shows "Coming Soon" for placeholders without actual prompts.
 * Replaces all hardcoded menu items.
 */

"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu/context-menu";
import { useContextMenuPrompts } from "@/hooks/useSystemPrompts";
import {
  PromptContextResolver,
  type UIContext,
} from "@/lib/services/prompt-context-resolver";
import { PromptRunnerModal } from "@/features/prompts/components/results-display/PromptRunnerModal";
import { TextActionResultModal } from "@/components/modals/TextActionResultModal";
import { usePromptExecution } from "@/features/prompts/hooks/usePromptExecution";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  selectIsDebugMode,
  showPromptDebugIndicator,
} from "@/lib/redux/preferences/adminDebugSlice";
import { startPromptInstance } from "@/lib/redux/prompt-execution/thunks/startInstanceThunk";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { v4 as uuidv4 } from "uuid";

interface DynamicContextMenuProps {
  children: React.ReactNode;
  uiContext?: UIContext;
  category?: string;
  subcategory?: string;
  className?: string;
  /** For text editors: callbacks to modify text */
  onTextReplace?: (newText: string) => void;
  onTextInsertBefore?: (text: string) => void;
  onTextInsertAfter?: (text: string) => void;
  /** Set to true if this is wrapping an editable element */
  isEditable?: boolean;
}

interface GroupedPrompts {
  [category: string]: {
    label: string;
    subcategories?: {
      [subcategory: string]: {
        label: string;
        items: any[];
      };
    };
    items: any[];
  };
}

export function DynamicContextMenu({
  children,
  uiContext = {},
  category,
  subcategory,
  className,
  onTextReplace,
  onTextInsertBefore,
  onTextInsertAfter,
  isEditable = false,
}: DynamicContextMenuProps) {
  const { systemPrompts, loading } = useContextMenuPrompts(
    category,
    subcategory,
  );
  const dispatch = useAppDispatch();
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState<string>("");
  const [selectionRange, setSelectionRange] = useState<{
    start: number;
    end: number;
    element: HTMLElement | null;
  } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalRunId, setModalRunId] = useState<string | null>(null);
  const [modalTitle, setModalTitle] = useState<string>("");
  const [textResultModalOpen, setTextResultModalOpen] = useState(false);
  const [textResultData, setTextResultData] = useState<{
    original: string;
    result: string;
    promptName: string;
  } | null>(null);
  const isDebugMode = useAppSelector(selectIsDebugMode);
  const { execute, streamingText, isExecuting } = usePromptExecution();

  // Track selected text on selection change
  useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() || "";
      setSelectedText(text);
    };

    document.addEventListener("selectionchange", handleSelection);
    return () =>
      document.removeEventListener("selectionchange", handleSelection);
  }, []);

  const handleContextMenu = (e: React.MouseEvent) => {
    // CRITICAL: Capture text AND selection range IMMEDIATELY before menu opens
    const selection = window.getSelection();
    const text = selection?.toString().trim() || "";

    // Store the target element and its selection range for later use
    const target = e.target as HTMLElement;
    let start = 0;
    let end = 0;
    let element: HTMLElement | null = null;

    if (
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLInputElement
    ) {
      start = target.selectionStart || 0;
      end = target.selectionEnd || 0;
      element = target;
    } else {
      // For contenteditable or regular elements with selection
      const range = selection?.getRangeAt(0);
      if (range) {
        start = range.startOffset;
        end = range.endOffset;
        element = target;
      }
    }

    // Store both text and range (for later reference in Replace/Insert operations)
    setSelectedText(text);
    setSelectionRange({ start, end, element });
  };

  // Group prompts by category and subcategory
  const groupedPrompts = useMemo(() => {
    const groups: GroupedPrompts = {};

    systemPrompts.forEach((prompt) => {
      const cat = prompt.category || "other";
      const subcat = prompt.subcategory;

      // Initialize category if needed
      if (!groups[cat]) {
        groups[cat] = {
          label: formatCategoryName(cat),
          items: [],
          subcategories: {},
        };
      }

      // If has subcategory, group there
      if (subcat) {
        if (!groups[cat].subcategories![subcat]) {
          groups[cat].subcategories![subcat] = {
            label: formatCategoryName(subcat),
            items: [],
          };
        }
        groups[cat].subcategories![subcat].items.push(prompt);
      } else {
        // Add to category directly
        groups[cat].items.push(prompt);
      }
    });

    return groups;
  }, [systemPrompts]);

  const handleActionTrigger = async (systemPrompt: any) => {
    console.log("[DynamicContextMenu] Action triggered:", systemPrompt.name);

    // Check if placeholder
    if (systemPrompt.prompt_snapshot?.placeholder) {
      console.log(
        "[DynamicContextMenu] Skipping placeholder:",
        systemPrompt.name,
      );
      return; // Disabled
    }

    try {
      // Merge selected text with UI context
      const contextWithSelection = {
        ...uiContext,
        selection: selectedText,
        text: selectedText,
        content: selectedText,
        selected_text: selectedText,
        content_to_explain: selectedText,
        current_code: selectedText,
      };

      // Resolve variables using the CODE
      const variables = PromptContextResolver.resolve(
        systemPrompt.prompt_snapshot,
        systemPrompt.functionality_id,
        "context-menu",
        contextWithSelection,
      );

      // Check if can resolve
      const canResolve = PromptContextResolver.canResolve(
        systemPrompt.prompt_snapshot,
        systemPrompt.functionality_id,
        "context-menu",
        contextWithSelection,
      );

      // Show debug modal if debug mode is enabled
      if (isDebugMode) {
        dispatch(
          showPromptDebugIndicator({
            promptName: systemPrompt.name,
            placementType: "context-menu",
            selectedText,
            availableContext: contextWithSelection,
            resolvedVariables: variables,
            canResolve,
            metadata: {
              functionalityId: systemPrompt.functionality_id,
              promptSnapshot: systemPrompt.prompt_snapshot,
            },
          }),
        );
      }

      if (!canResolve.canResolve) {
        console.warn(
          `[DynamicContextMenu] Cannot resolve variables for ${systemPrompt.name}:`,
          canResolve.missingVariables,
        );
        alert(
          `Cannot execute: Missing variables - ${canResolve.missingVariables.join(", ")}`,
        );
        return;
      }

      // Get placement settings
      const settings = systemPrompt.placement_settings || {};
      const allowChat = settings.allowChat ?? true;
      const allowInitialMessage = settings.allowInitialMessage ?? false;

      // If this is an editable context (textarea) and has text replace callbacks
      // Execute directly and show replace modal instead of chat modal
      if (
        isEditable &&
        (onTextReplace || onTextInsertBefore || onTextInsertAfter) &&
        selectedText
      ) {
        console.log(
          "[DynamicContextMenu] Editable context detected - executing for text replacement",
        );

        // Execute the prompt
        const result = await execute({
          promptId: systemPrompt.source_prompt_id,
          promptData: !systemPrompt.source_prompt_id
            ? systemPrompt.prompt_snapshot
            : undefined,
          variables,
        });

        // Wait for streaming to complete
        // The streamingText will be updated via the hook
        // For now, show a simple result modal
        // TODO: Integrate with actual streaming result
        setTextResultData({
          original: selectedText,
          result: "Processing...", // Will be updated by streaming
          promptName: systemPrompt.name,
        });
        setTextResultModalOpen(true);
      } else {
        // Regular modal with chat - initialize via Redux
        const newRunId = uuidv4();
        const promptId =
          systemPrompt.source_prompt_id ||
          systemPrompt.prompt_snapshot?.id ||
          "unknown";

        await dispatch(
          startPromptInstance({
            runId: newRunId,
            promptId,
            promptSource: "prompts",
            executionConfig: {
              auto_run: true,
              allow_chat: allowChat,
              show_variables: false,
              apply_variables: true,
              track_in_runs: true,
              use_pre_execution_input: false,
            },
            variables,
          }),
        ).unwrap();

        setModalRunId(newRunId);
        setModalTitle(systemPrompt.name);
        setModalOpen(true);
      }

      console.log("[DynamicContextMenu] Modal state set");
    } catch (error) {
      console.error(
        "[DynamicContextMenu] Error executing system prompt:",
        error,
      );
      alert(`Error: ${error.message}`);
    }
  };

  const checkRequirements = (systemPrompt: any): boolean => {
    const settings = systemPrompt.placement_settings || {};

    // If placeholder, disable
    if (systemPrompt.prompt_snapshot?.placeholder) {
      return true; // disabled
    }

    // If requires selection but none available
    if (settings.requiresSelection && !selectedText) {
      return true; // disabled
    }

    // If requires minimum selection length
    if (
      settings.minSelectionLength &&
      (!selectedText || selectedText.length < settings.minSelectionLength)
    ) {
      return true; // disabled
    }

    return false; // enabled
  };

  const renderMenuItem = (item: any) => {
    const isPlaceholder = item.prompt_snapshot?.placeholder;
    const isDisabled = checkRequirements(item);
    const isExecuting = executingId === item.id;

    return (
      <ContextMenuItem
        key={item.id}
        onClick={() => handleActionTrigger(item)}
        disabled={isDisabled || isExecuting}
        className={cn(
          "flex items-center gap-2",
          isPlaceholder && "text-muted-foreground italic",
        )}
      >
        {isExecuting && <Loader2 className="h-3 w-3 animate-spin" />}
        {item.display_config?.icon && !isExecuting && (
          <span className="text-muted-foreground">
            {/* Icon placeholder */}
          </span>
        )}
        <span>{item.name}</span>
        {isPlaceholder && <span className="text-xs">(Coming Soon)</span>}
      </ContextMenuItem>
    );
  };

  if (loading) {
    return (
      <ContextMenu>
        <ContextMenuTrigger
          className={className}
          onContextMenu={handleContextMenu}
        >
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem disabled>
            <Loader2 className="h-3 w-3 animate-spin mr-2" />
            Loading...
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  if (systemPrompts.length === 0) {
    return (
      <ContextMenu>
        <ContextMenuTrigger
          className={className}
          onContextMenu={handleContextMenu}
        >
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem disabled>No actions available</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger
          className={className}
          onContextMenu={handleContextMenu}
        >
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-64">
          {Object.entries(groupedPrompts).map(
            ([categoryKey, categoryData], index) => {
              const hasSubcategories =
                categoryData.subcategories &&
                Object.keys(categoryData.subcategories).length > 0;

              // If category has both direct items and subcategories, render both
              if (hasSubcategories && categoryData.items.length > 0) {
                return (
                  <React.Fragment key={categoryKey}>
                    {index > 0 && <ContextMenuSeparator />}
                    <ContextMenuSub>
                      <ContextMenuSubTrigger>
                        {categoryData.label}
                      </ContextMenuSubTrigger>
                      <ContextMenuSubContent>
                        {/* Direct items */}
                        {categoryData.items.map(renderMenuItem)}

                        {/* Subcategories */}
                        {categoryData.items.length > 0 && (
                          <ContextMenuSeparator />
                        )}
                        {Object.entries(categoryData.subcategories!).map(
                          ([subKey, subData]) => (
                            <ContextMenuSub key={subKey}>
                              <ContextMenuSubTrigger>
                                {subData.label}
                              </ContextMenuSubTrigger>
                              <ContextMenuSubContent>
                                {subData.items.map(renderMenuItem)}
                              </ContextMenuSubContent>
                            </ContextMenuSub>
                          ),
                        )}
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                  </React.Fragment>
                );
              }

              // Category with only subcategories
              if (hasSubcategories) {
                return (
                  <React.Fragment key={categoryKey}>
                    {index > 0 && <ContextMenuSeparator />}
                    <ContextMenuSub>
                      <ContextMenuSubTrigger>
                        {categoryData.label}
                      </ContextMenuSubTrigger>
                      <ContextMenuSubContent>
                        {Object.entries(categoryData.subcategories!).map(
                          ([subKey, subData]) => (
                            <ContextMenuSub key={subKey}>
                              <ContextMenuSubTrigger>
                                {subData.label}
                              </ContextMenuSubTrigger>
                              <ContextMenuSubContent>
                                {subData.items.map(renderMenuItem)}
                              </ContextMenuSubContent>
                            </ContextMenuSub>
                          ),
                        )}
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                  </React.Fragment>
                );
              }

              // Category with only direct items (standalone)
              if (categoryKey === "standalone") {
                // Render standalone items at top level
                return (
                  <React.Fragment key={categoryKey}>
                    {index > 0 && <ContextMenuSeparator />}
                    {categoryData.items.map(renderMenuItem)}
                  </React.Fragment>
                );
              }

              // Regular category with direct items
              return (
                <React.Fragment key={categoryKey}>
                  {index > 0 && <ContextMenuSeparator />}
                  <ContextMenuSub>
                    <ContextMenuSubTrigger>
                      {categoryData.label}
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent>
                      {categoryData.items.map(renderMenuItem)}
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                </React.Fragment>
              );
            },
          )}
        </ContextMenuContent>
      </ContextMenu>

      {/* Modal for execution - runId must be initialized in Redux */}
      {modalOpen && modalRunId ? (
        <PromptRunnerModal
          isOpen={modalOpen}
          onClose={() => {
            console.log("[DynamicContextMenu] Closing modal");
            setModalOpen(false);
            setModalRunId(null);
            // Clear selection range when modal closes
            setSelectionRange(null);
            setSelectedText("");
          }}
          runId={modalRunId}
          title={modalTitle}
        />
      ) : null}

      {/* Text Action Result Modal (for text editors with replace/insert) */}
      {textResultModalOpen && textResultData && (
        <TextActionResultModal
          isOpen={textResultModalOpen}
          onClose={() => {
            setTextResultModalOpen(false);
            setTextResultData(null);
            // Clear selection range when operation completes or is cancelled
            setSelectionRange(null);
            setSelectedText("");
          }}
          originalText={textResultData.original}
          aiResponse={streamingText || textResultData.result}
          promptName={textResultData.promptName}
          onReplace={(newText) => {
            onTextReplace?.(newText);
            // Clear selection after replacement
            setSelectionRange(null);
            setSelectedText("");
            setTextResultModalOpen(false);
          }}
          onInsertBefore={(text) => {
            onTextInsertBefore?.(text);
            // Clear selection after insertion
            setSelectionRange(null);
            setSelectedText("");
            setTextResultModalOpen(false);
          }}
          onInsertAfter={(text) => {
            onTextInsertAfter?.(text);
            // Clear selection after insertion
            setSelectionRange(null);
            setSelectedText("");
            setTextResultModalOpen(false);
          }}
        />
      )}
    </>
  );
}

// Helper function to format category names
function formatCategoryName(name: string): string {
  return name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
