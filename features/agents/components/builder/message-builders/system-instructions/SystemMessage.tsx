import {
  RefObject,
  useRef,
  useState,
  useLayoutEffect,
  useCallback,
  useMemo,
} from "react";
import { Label } from "@/components/ui/label";

// Universal v3 context menu — the SAME menu everywhere. The wrapper is the
// lightweight shell (imported statically); MenuContent lazy-loads on first open.
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";

import { SystemPromptOptimizer } from "@/features/agents/components/builder/message-builders/system-instructions/SystemPromptOptimizer";

// Agent Types
import type { AgentDefinitionMessage } from "@/features/agents/types/agent-message-types";

// Module Shared Components
import { HighlightedText } from "@/features/agents/components/variables-management/HighlightedText";
import { SystemMessageButtons } from "@/features/agents/components/builder/message-builders/system-instructions/SystemMessageButtons";
import {
  MessageViewModeMenu,
  type MessageViewMode,
} from "@/features/agents/components/builder/message-builders/MessageViewModeMenu";
import MarkdownStream from "@/components/MarkdownStream";
import {
  BlockList,
  BlockType,
} from "@/features/agents/components/builder/message-builders/AddBlockButton";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAgentMessages,
  selectAgentSettings,
  selectAgentVariableDefinitions,
} from "@/features/agents/redux/agent-definition/selectors";
import { selectAgentSystemMessage } from "@/features/agents/redux/agent-definition/selectors";
import { setAgentMessages } from "@/features/agents/redux/agent-definition/slice";
import { useAgentUndoRedo } from "@/features/agents/hooks/useAgentUndoRedo";
import { useAgentBuilderSurfaceScope } from "@/features/agents/hooks/useAgentBuilderSurfaceScope";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { Terminal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/** Extract text from a TextBlock. Canonical field is `.text` — normalised at the Redux boundary. */
function extractTextFromBlock(block: Record<string, unknown>): string {
  return (block.text as string | undefined) ?? "";
}

/** Compute character offset of (node, offset) within `root`'s text content. */
function getOffsetWithinRoot(root: Node, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

interface SystemMessageProps {
  agentId: string;
  onOpenFullScreenEditor?: () => void;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
}

export function SystemMessage({
  agentId,
  onOpenFullScreenEditor,
  scrollContainerRef,
}: SystemMessageProps) {
  const [viewMode, setViewMode] = useState<MessageViewMode>("plain");
  const isEditing = viewMode === "edit";
  const setIsEditing = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setViewMode((prev) => {
        const wasEditing = prev === "edit";
        const nextEditing =
          typeof next === "function" ? next(wasEditing) : next;
        if (nextEditing === wasEditing) return prev;
        return nextEditing ? "edit" : "plain";
      });
    },
    [],
  );
  const [cursorPositions, setCursorPositions] = useState<
    Record<number, number>
  >({});
  const textareaRefs = useRef<Record<number, HTMLTextAreaElement | null>>({});
  const dispatch = useAppDispatch();

  // Full messages array — needed for write-back
  const messages = useAppSelector((state) =>
    selectAgentMessages(state, agentId),
  );

  // Full system message object — raw, all blocks intact
  const systemMessage = useAppSelector((state) =>
    selectAgentSystemMessage(state, agentId),
  );

  const agentSettings = useAppSelector((state) =>
    selectAgentSettings(state, agentId),
  );

  const variableDefinitions = useAppSelector((state) =>
    selectAgentVariableDefinitions(state, agentId),
  );

  const { canUndo, canRedo, undo, redo, undoHint, redoHint } = useAgentUndoRedo(
    { agentId },
  );

  const handleViewHistory = useCallback(() => {
    dispatch(
      openOverlay({
        overlayId: "undoHistory",
        data: { agentId },
      }),
    );
  }, [dispatch, agentId]);

  // console.log("[AGENT SYSTEM MESSAGE] messages", messages);
  // console.log("[AGENT SYSTEM MESSAGE] systemMessage", systemMessage);

  // All blocks as plain objects so we can read any field regardless of TS types
  const rawBlocks: Record<string, unknown>[] = systemMessage
    ? (systemMessage.content as unknown as Record<string, unknown>[])
    : [];

  // The first text block drives the textarea — look for `.text` or `.content`
  const textBlockRaw = rawBlocks.find((b) => b.type === "text");
  const developerMessage = textBlockRaw
    ? extractTextFromBlock(textBlockRaw)
    : "";

  // All non-text blocks — rendered as pills
  const nonTextBlocks = rawBlocks.filter((b) => b.type !== "text");

  const handleTextChange = useCallback(
    (value: string) => {
      if (!messages) return;
      const nonSystemMessages = messages.filter((m) => m.role !== "system");

      // Rebuild non-text blocks from raw (round-trip them untouched)
      const preservedNonText = rawBlocks.filter(
        (b) => b.type !== "text",
      ) as unknown as AgentDefinitionMessage["content"];

      const newContent: AgentDefinitionMessage["content"] = value.trim()
        ? [{ type: "text", text: value }, ...preservedNonText]
        : preservedNonText;

      const updated: AgentDefinitionMessage[] =
        newContent.length > 0
          ? [{ role: "system", content: newContent }, ...nonSystemMessages]
          : nonSystemMessages;

      dispatch(setAgentMessages({ id: agentId, messages: updated }));
    },
    [agentId, messages, rawBlocks, dispatch],
  );

  const handleRemoveNonTextBlock = useCallback(
    (indexInNonText: number) => {
      if (!messages) return;
      const nonSystemMessages = messages.filter((m) => m.role !== "system");

      const newNonText = nonTextBlocks.filter((_, i) => i !== indexInNonText);
      const newContent: AgentDefinitionMessage["content"] = [
        ...(developerMessage.trim()
          ? [{ type: "text" as const, text: developerMessage }]
          : []),
        ...(newNonText as unknown as AgentDefinitionMessage["content"]),
      ];

      const updated: AgentDefinitionMessage[] =
        newContent.length > 0
          ? [{ role: "system", content: newContent }, ...nonSystemMessages]
          : nonSystemMessages;

      dispatch(setAgentMessages({ id: agentId, messages: updated }));
    },
    [agentId, messages, developerMessage, nonTextBlocks, dispatch],
  );

  const handleAddBlock = useCallback(
    (block: Record<string, unknown>) => {
      if (!messages) return;
      const nonSystemMessages = messages.filter((m) => m.role !== "system");
      const newContent: AgentDefinitionMessage["content"] = [
        ...(developerMessage.trim()
          ? [{ type: "text" as const, text: developerMessage }]
          : []),
        ...(nonTextBlocks as unknown as AgentDefinitionMessage["content"]),
        block as unknown as AgentDefinitionMessage["content"][number],
      ];
      const updated: AgentDefinitionMessage[] = [
        { role: "system", content: newContent },
        ...nonSystemMessages,
      ];
      dispatch(setAgentMessages({ id: agentId, messages: updated }));
    },
    [agentId, messages, developerMessage, nonTextBlocks, dispatch],
  );

  const handleUpdateBlock = useCallback(
    (index: number, block: Record<string, unknown>) => {
      if (!messages) return;
      const nonSystemMessages = messages.filter((m) => m.role !== "system");
      const updatedNonText = nonTextBlocks.map((b, i) =>
        i === index ? block : b,
      );
      const newContent: AgentDefinitionMessage["content"] = [
        ...(developerMessage.trim()
          ? [{ type: "text" as const, text: developerMessage }]
          : []),
        ...(updatedNonText as unknown as AgentDefinitionMessage["content"]),
      ];
      const updated: AgentDefinitionMessage[] = [
        { role: "system", content: newContent },
        ...nonSystemMessages,
      ];
      dispatch(setAgentMessages({ id: agentId, messages: updated }));
    },
    [agentId, messages, developerMessage, nonTextBlocks, dispatch],
  );

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
  const scrollLockRef = useRef<{ scrollTop: number; overflow: string } | null>(
    null,
  );

  // ⚠️ SCROLL FIX: Restore scroll position and overflow AFTER React re-renders.
  // useLayoutEffect runs synchronously after DOM commit but BEFORE browser paint.
  // By this point, onChange has already locked overflow:hidden and saved the correct
  // scroll position to scrollLockRef. We resize the textarea, restore scroll, and
  // THEN restore overflow — ensuring NO gap where the browser can auto-scroll.
  useLayoutEffect(() => {
    if (!isEditing) return;
    const textarea = textareaRefs.current?.[systemMessageIndex];
    const scrollContainer = scrollContainerRef?.current;
    if (!textarea || !scrollContainer) return;

    // Use saved scroll from event handler, or current scrollTop as fallback
    // (fallback handles programmatic content changes where onChange didn't fire)
    const lockData = scrollLockRef.current;
    const savedScroll = lockData?.scrollTop ?? scrollContainer.scrollTop;
    const originalOverflow =
      lockData?.overflow ?? scrollContainer.style.overflow;

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
  }, [
    developerMessage,
    isEditing,
    scrollContainerRef,
    textareaRefs,
    systemMessageIndex,
  ]);

  // Clear initialization tracking when editing stops, so the textarea
  // re-initializes properly when editing resumes.
  useLayoutEffect(() => {
    if (!isEditing) {
      textareaInitializedRef.current = false;
    }
  }, [isEditing]);

  // Optimizer state
  const [isOptimizerOpen, setIsOptimizerOpen] = useState(false);
  const [pendingAddType, setPendingAddType] = useState<
    BlockType | null | undefined
  >(undefined);

  // Check if variable insertion is enabled
  const hasVariableSupport =
    !!variableDefinitions && variableDefinitions.length > 0;

  // Derive variable names from variableDefaults
  const variableNames = variableDefinitions
    ? variableDefinitions.map((v) => v.name)
    : [];

  const handleOptimizedAccept = (optimizedText: string) => {
    handleTextChange(optimizedText);
  };

  const handleVoiceTranscription = useCallback(
    (transcribedText: string) => {
      const trimmed = transcribedText.trim();
      if (!trimmed) return;
      const updated = developerMessage
        ? developerMessage + "\n\n" + trimmed
        : trimmed;
      handleTextChange(updated);
    },
    [developerMessage, handleTextChange],
  );

  const handleBeforeVariableSelectorOpen = useCallback(() => {
    const textarea = textareaRefs.current[systemMessageIndex];
    if (textarea) {
      setCursorPositions((prev) => ({
        ...prev,
        [systemMessageIndex]: textarea.selectionStart,
      }));
    }
    if (!isEditing) {
      setIsEditing(true);
    }
  }, [systemMessageIndex, isEditing]);

  const insertVariableIntoSystemMessage = useCallback(
    (variable: string) => {
      const textarea = textareaRefs.current[systemMessageIndex];
      const cursorPos =
        cursorPositions[systemMessageIndex] ?? developerMessage.length;
      const insertion = `{{${variable}}}`;
      const newContent =
        developerMessage.substring(0, cursorPos) +
        insertion +
        developerMessage.substring(cursorPos);
      handleTextChange(newContent);
      const newCursorPos = cursorPos + insertion.length;
      setCursorPositions((prev) => ({
        ...prev,
        [systemMessageIndex]: newCursorPos,
      }));
      setTimeout(() => {
        if (textarea) {
          textarea.focus({ preventScroll: true });
          textarea.setSelectionRange(newCursorPos, newCursorPos);
          textarea.style.height = "auto";
          textarea.style.height = `${textarea.scrollHeight}px`;
        }
      }, 0);
    },
    [developerMessage, cursorPositions, systemMessageIndex, handleTextChange],
  );

  const handleTextReplace = useCallback(
    (newText: string) => {
      const textarea = textareaRefs.current[systemMessageIndex];
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const before = developerMessage.substring(0, start);
      const after = developerMessage.substring(end);
      handleTextChange(before + newText + after);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start, start + newText.length);
      }, 0);
    },
    [developerMessage, handleTextChange],
  );

  const handleTextInsertBefore = useCallback(
    (text: string) => {
      const textarea = textareaRefs.current[systemMessageIndex];
      if (!textarea) return;
      const start = textarea.selectionStart;
      const before = developerMessage.substring(0, start);
      const after = developerMessage.substring(start);
      const insertText = text + "\n\n";
      handleTextChange(before + insertText + after);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(
          start + insertText.length,
          start + insertText.length,
        );
      }, 0);
    },
    [developerMessage, handleTextChange],
  );

  const handleTextInsertAfter = useCallback(
    (text: string) => {
      const textarea = textareaRefs.current[systemMessageIndex];
      if (!textarea) return;
      const end = textarea.selectionEnd;
      const before = developerMessage.substring(0, end);
      const after = developerMessage.substring(end);
      const insertText = "\n\n" + text;
      handleTextChange(before + insertText + after);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(
          end + insertText.length,
          end + insertText.length,
        );
      }, 0);
    },
    [developerMessage, handleTextChange],
  );

  const handleContentInserted = useCallback(() => {
    contextMenuOpenRef.current = false;
  }, []);

  const handleTextareaRef = useCallback((el: HTMLTextAreaElement | null) => {
    textareaRefs.current[systemMessageIndex] = el;
    if (el && !textareaInitializedRef.current) {
      textareaInitializedRef.current = true;
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
      el.focus({ preventScroll: true });
    }
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!scrollContainerRef?.current) {
        handleTextChange(e.target.value);
        e.target.style.height = "auto";
        e.target.style.height = e.target.scrollHeight + "px";
        return;
      }
      const scrollContainer = scrollContainerRef.current;
      if (!scrollLockRef.current) {
        scrollLockRef.current = {
          scrollTop: scrollContainer.scrollTop,
          overflow: scrollContainer.style.overflow,
        };
      } else {
        scrollLockRef.current.scrollTop = scrollContainer.scrollTop;
      }
      scrollContainer.style.overflow = "hidden";
      handleTextChange(e.target.value);
      e.target.style.height = "auto";
      e.target.style.height = e.target.scrollHeight + "px";
      scrollContainer.scrollTop = scrollLockRef.current.scrollTop;
    },
    [handleTextChange, scrollContainerRef],
  );

  const handleKeyDown = useCallback(
    (_e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (scrollContainerRef?.current) {
        const savedScroll = scrollContainerRef.current.scrollTop;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (scrollContainerRef.current) {
              scrollContainerRef.current.scrollTop = savedScroll;
            }
          });
        });
      }
    },
    [scrollContainerRef],
  );

  const handleInput = useCallback(
    (_e: React.FormEvent<HTMLTextAreaElement>) => {
      if (scrollContainerRef?.current) {
        const savedScroll = scrollContainerRef.current.scrollTop;
        requestAnimationFrame(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = savedScroll;
          }
        });
      }
    },
    [scrollContainerRef],
  );

  const handleMouseDown = useCallback(
    (_e: React.MouseEvent<HTMLTextAreaElement>) => {
      if (scrollContainerRef?.current) {
        const savedScroll = scrollContainerRef.current.scrollTop;
        requestAnimationFrame(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = savedScroll;
          }
        });
      }
    },
    [scrollContainerRef],
  );

  const handleSelect = useCallback(
    (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
      if (scrollContainerRef?.current) {
        const savedScroll = scrollContainerRef.current.scrollTop;
        requestAnimationFrame(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = savedScroll;
          }
        });
      }
      const target = e.target as HTMLTextAreaElement;
      setCursorPositions((prev) => ({
        ...prev,
        [systemMessageIndex]: target.selectionStart,
      }));
    },
    [scrollContainerRef],
  );

  const handleContextMenu = useCallback(() => {
    contextMenuOpenRef.current = true;
  }, []);

  const handleFocus = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      setCursorPositions((prev) => ({
        ...prev,
        [systemMessageIndex]: e.target.selectionStart,
      }));
    },
    [],
  );

  const handleBlur = useCallback(() => {
    if (!contextMenuOpenRef.current) {
      setIsEditing(false);
    }
    setTimeout(() => {
      contextMenuOpenRef.current = false;
    }, 100);
  }, []);

  const handleViewClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!scrollContainerRef?.current) return;
      const scrollContainer = scrollContainerRef.current;
      const savedScrollPosition = scrollContainer.scrollTop;
      const target = e.target as HTMLElement;
      const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
      let clickPosition = 0;
      if (range) {
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(target);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        clickPosition = preCaretRange.toString().length;
      }
      setIsEditing(true);
      requestAnimationFrame(() => {
        scrollContainer.scrollTop = savedScrollPosition;
        const textarea = textareaRefs.current?.[systemMessageIndex];
        if (textarea && clickPosition > 0) {
          textarea.setSelectionRange(clickPosition, clickPosition);
        }
      });
    },
    [scrollContainerRef],
  );

  // Drag-select handler: when a user releases the mouse with a non-empty
  // selection inside the view div, enter edit mode and mirror the selection
  // into the textarea so they can immediately type/replace the selected text.
  // Pure clicks (no movement → collapsed range) fall through to onClick above.
  const handleViewMouseUp = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0 || isEditing) return;
      const selection =
        typeof window !== "undefined" ? window.getSelection() : null;
      if (!selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (range.collapsed) return;
      const rootEl = e.currentTarget;
      if (
        !rootEl.contains(range.startContainer) ||
        !rootEl.contains(range.endContainer)
      ) {
        return;
      }
      const start = getOffsetWithinRoot(
        rootEl,
        range.startContainer,
        range.startOffset,
      );
      const end = getOffsetWithinRoot(
        rootEl,
        range.endContainer,
        range.endOffset,
      );
      const savedScroll = scrollContainerRef?.current?.scrollTop ?? 0;
      setIsEditing(true);
      requestAnimationFrame(() => {
        if (scrollContainerRef?.current) {
          scrollContainerRef.current.scrollTop = savedScroll;
        }
        const textarea = textareaRefs.current?.[systemMessageIndex];
        if (textarea) {
          textarea.focus({ preventScroll: true });
          textarea.setSelectionRange(start, end);
        }
      });
    },
    [isEditing, scrollContainerRef],
  );

  const buildAgentScope = useAgentBuilderSurfaceScope(agentId);

  // Surface scope for `matrx-user/agent-builder`. Agent-level values (model,
  // tools, agent_json, etc.) come from the hook; `content` /
  // `system_instruction` are the developer message being edited. Top-level
  // keys flow straight through EditableContextMenu into the ApplicationScope.
  const contextMenuData = useMemo(() => {
    return {
      ...buildAgentScope(),
      content: developerMessage,
      system_instruction: developerMessage,
      focused_field: "system_instruction",
    };
  }, [buildAgentScope, developerMessage]);

  // Not yet loaded
  if (messages === undefined) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-muted-foreground" />
          <Label className="text-sm font-medium">System Prompt</Label>
        </div>
        <Skeleton className="h-[120px] w-full rounded-md" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="group border-border rounded-lg bg-gray-50 dark:bg-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between px-2 py-1 sticky top-0 z-10 rounded-t-lg bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-1">
            <Label className="text-xs text-gray-600 dark:text-gray-400">
              System
            </Label>
            <MessageViewModeMenu viewMode={viewMode} onChange={setViewMode} />
          </div>
          <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <SystemMessageButtons
              hasVariableSupport={hasVariableSupport}
              hasFullScreenEditor={!!onOpenFullScreenEditor}
              variableNames={variableNames}
              onVariableSelected={insertVariableIntoSystemMessage}
              onBeforeVariableSelectorOpen={handleBeforeVariableSelectorOpen}
              templateCurrentContent={developerMessage}
              onTemplateContentSelected={handleTextChange}
              onSaveTemplate={() => {}}
              onOptimize={() => setIsOptimizerOpen(true)}
              onOpenFullScreenEditor={onOpenFullScreenEditor}
              onClear={() => handleTextChange("")}
              onAddBlockType={(type) => setPendingAddType(type)}
              onVoiceTranscription={handleVoiceTranscription}
            />
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {viewMode === "preview" ? (
            <div
              className="min-h-[240px] cursor-text"
              onClick={() => setViewMode("edit")}
              title="Click to edit"
            >
              {developerMessage ? (
                <MarkdownStream
                  content={developerMessage}
                  hideCopyButton
                  className="text-sm"
                  // Persist in-block edits (JSON reformat, code edits, etc.)
                  // back to the agent definition so they survive the
                  // preview ↔ edit toggle and reach the DB.
                  onContentChange={handleTextChange}
                />
              ) : (
                <span className="text-xs text-gray-500 dark:text-gray-500 italic">
                  You&apos;re a very helpful assistant
                </span>
              )}
            </div>
          ) : isEditing ? (
            <EditableContextMenu
              sourceFeature="agent-builder"
              surfaceName="matrx-user/agent-builder"
              getTextarea={() =>
                textareaRefs.current[systemMessageIndex] || null
              }
              contextData={
                contextMenuData as unknown as Record<string, unknown>
              }
              enableFloatingIcon={true}
              onTextReplace={handleTextReplace}
              onTextInsertBefore={handleTextInsertBefore}
              onTextInsertAfter={handleTextInsertAfter}
              onContentInserted={handleContentInserted}
              onUndo={undo}
              onRedo={redo}
              canUndo={canUndo}
              canRedo={canRedo}
              undoHint={undoHint}
              redoHint={redoHint}
              onViewHistory={handleViewHistory}
              hasHistory={canUndo || canRedo}
            >
              <textarea
                ref={handleTextareaRef}
                value={developerMessage}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onInput={handleInput}
                onMouseDown={handleMouseDown}
                onSelect={handleSelect}
                onContextMenu={handleContextMenu}
                onFocus={handleFocus}
                onBlur={handleBlur}
                placeholder="You're a very helpful assistant"
                className="w-full bg-gray-50 dark:bg-gray-800 border-none outline-none text-xs text-gray-900 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500 p-0 resize-none overflow-hidden leading-normal"
                style={{
                  minHeight: "240px",
                  lineHeight: "1.5",
                }}
              />
            </EditableContextMenu>
          ) : (
            <div
              className="text-xs pb-2 text-gray-600 dark:text-gray-400 whitespace-pre-wrap cursor-text leading-normal"
              onClick={handleViewClick}
              onMouseUp={handleViewMouseUp}
              style={{
                minHeight: "240px",
                lineHeight: "1.5",
              }}
            >
              {developerMessage ? (
                <HighlightedText
                  text={developerMessage}
                  validVariables={variableNames}
                />
              ) : (
                <span className="text-gray-500 dark:text-gray-500 italic">
                  You're a very helpful assistant
                </span>
              )}
            </div>
          )}

          {/* Content blocks */}
          {(nonTextBlocks.length > 0 || pendingAddType != null) && (
            <div className="pt-2">
              <BlockList
                blocks={nonTextBlocks}
                onUpdateBlock={handleUpdateBlock}
                onRemoveBlock={handleRemoveNonTextBlock}
                onAddBlock={handleAddBlock}
                pendingAddType={pendingAddType}
                onPendingAddTypeClear={() => setPendingAddType(undefined)}
                validVariables={variableNames}
              />
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
