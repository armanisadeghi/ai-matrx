"use client";

import {
  RefObject,
  useRef,
  useState,
  useLayoutEffect,
  useCallback,
  useMemo,
} from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  selectAgentMessageAtIndex,
  selectAgentMessages,
  selectAgentVariableDefinitions,
} from "@/features/agents/redux/agent-definition/selectors";
import { setAgentMessages } from "@/features/agents/redux/agent-definition/slice";

// Universal v3 context menu — the SAME menu everywhere. The wrapper is the
// lightweight shell (imported statically); MenuContent lazy-loads on first open.
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import { HighlightedText } from "@/features/agents/components/variables-management/HighlightedText";
import { MessageItemButtons } from "@/features/agents/components/builder/message-builders/MessageItemButtons";
import {
  MessageViewModeMenu,
  type MessageViewMode,
} from "@/features/agents/components/builder/message-builders/MessageViewModeMenu";
import {
  BlockList,
  BlockType,
} from "@/features/agents/components/builder/message-builders/AddBlockButton";
import type {
  AgentDefinitionMessage,
  PrimingMessageRole,
} from "@/features/agents/types/agent-message-types";
import { useAgentUndoRedo } from "@/features/agents/hooks/useAgentUndoRedo";
import { useAgentBuilderSurfaceScope } from "@/features/agents/hooks/useAgentBuilderSurfaceScope";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import MarkdownStream from "@/components/MarkdownStream";

/** Extract text from a TextBlock. */
function extractTextFromBlock(block: Record<string, unknown>): string {
  return (block.text as string | undefined) ?? "";
}

/**
 * Untagged text-block check (block-local, no position info).
 * Used by `findPrimaryIndex` below.
 */
function isUntaggedText(block: Record<string, unknown>): boolean {
  if (block.type !== "text") return false;
  const meta = block.metadata as Record<string, unknown> | undefined;
  const role = meta && typeof meta === "object" ? meta.role : undefined;
  return !role;
}

/**
 * Index of the message's "primary" text block — the FIRST untagged text in
 * `content`. Returns -1 if every text block has a role (legal but unusual).
 *
 * Why first-only: a user might add a second untagged text block by accident
 * (e.g. clicked "Add Text" without setting a role). Treating ALL untagged
 * text as primary would either drop their input on next textarea edit or
 * silently merge it. Treating ONLY the first untagged text as primary keeps
 * subsequent untagged blocks visible in the BlockList — the user can then
 * either tag them with a role, edit them, or remove them.
 */
function findPrimaryIndex(blocks: Record<string, unknown>[]): number {
  return blocks.findIndex(isUntaggedText);
}

/** Compute character offset of (node, offset) within `root`'s text content. */
function getOffsetWithinRoot(root: Node, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

interface MessageItemProps {
  messageIndex: number;
  agentId: string;
  onOpenFullScreenEditor?: (messageIndex: number) => void;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
}

export function MessageItem({
  messageIndex,
  agentId,
  onOpenFullScreenEditor,
  scrollContainerRef,
}: MessageItemProps) {
  const dispatch = useAppDispatch();

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
  const [pendingAddType, setPendingAddType] = useState<
    BlockType | null | undefined
  >(undefined);
  const [cursorPositions, setCursorPositions] = useState<
    Record<number, number>
  >({});
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const contextMenuOpenRef = useRef(false);
  const textareaInitializedRef = useRef(false);
  const scrollLockRef = useRef<{ scrollTop: number; overflow: string } | null>(
    null,
  );

  const message = useAppSelector((state) =>
    selectAgentMessageAtIndex(state, agentId, messageIndex),
  );
  const allMessages = useAppSelector((state) =>
    selectAgentMessages(state, agentId),
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

  const hasVariableSupport =
    variableDefinitions != null && variableDefinitions.length > 0;
  const variableNames = variableDefinitions?.map((v) => v.name) ?? [];

  // Derive content from blocks. The block editor (AddBlockButton/BlockList)
  // deliberately works on loose records so a single generic UI can edit any
  // block type by field; only the write-back below re-narrows to the
  // concrete discriminated union.
  // MATRX-EXCEPTION: generic multi-type block editor, narrowed at write-back only.
  const rawBlocks: Record<string, unknown>[] = message
    ? (message.content as unknown as Record<string, unknown>[])
    : [];
  const primaryIndex = findPrimaryIndex(rawBlocks);
  const primaryTextBlock =
    primaryIndex >= 0 ? rawBlocks[primaryIndex] : undefined;
  const currentText = primaryTextBlock
    ? extractTextFromBlock(primaryTextBlock)
    : "";
  // Everything except the message's primary text — role-tagged text
  // (negative_prompt, etc.), media blocks, AND any subsequent untagged
  // text blocks (the user can either tag those with a role or edit them
  // out). Listed in their `content` order so the indices passed to
  // remove/update map back deterministically.
  const extraBlocks = rawBlocks.filter((_, i) => i !== primaryIndex);

  // Redux write-backs
  const handleTextChange = useCallback(
    (value: string) => {
      if (!allMessages || !message) return;
      // Preserve every other block in place; only the primary text is
      // rewritten. If no primary existed (every text block was role-tagged),
      // prepend a fresh untagged text block when the user types something.
      const idx = findPrimaryIndex(rawBlocks);
      let updatedContent: AgentDefinitionMessage["content"];
      if (idx >= 0) {
        // MATRX-EXCEPTION: generic block editor, narrowed at write-back only.
        updatedContent = rawBlocks.map((b, i) =>
          i === idx
            ? ({ type: "text", text: value } as Record<string, unknown>)
            : b,
        ) as unknown as AgentDefinitionMessage["content"];
      } else if (value) {
        // MATRX-EXCEPTION: generic block editor, narrowed at write-back only.
        updatedContent = [
          { type: "text", text: value },
          ...rawBlocks,
        ] as unknown as AgentDefinitionMessage["content"];
      } else {
        // No primary, empty value — leave content untouched.
        // MATRX-EXCEPTION: generic block editor, narrowed at write-back only.
        updatedContent =
          rawBlocks as unknown as AgentDefinitionMessage["content"];
      }
      const updated = allMessages.map((m, i) =>
        i === messageIndex ? { ...m, content: updatedContent } : m,
      );
      dispatch(setAgentMessages({ id: agentId, messages: updated }));
    },
    [agentId, messageIndex, allMessages, message, rawBlocks, dispatch],
  );

  const handleRoleChange = useCallback(
    (role: PrimingMessageRole) => {
      if (!allMessages) return;
      const updated = allMessages.map((m, i) =>
        i === messageIndex ? { ...m, role } : m,
      );
      dispatch(setAgentMessages({ id: agentId, messages: updated }));
    },
    [agentId, messageIndex, allMessages, dispatch],
  );

  const handleRemoveBlock = useCallback(
    (blockIndexInExtras: number) => {
      if (!allMessages || !message) return;
      const primary = findPrimaryIndex(rawBlocks);
      let extraCount = -1;
      // MATRX-EXCEPTION: generic block editor, narrowed at write-back only.
      const newContent = rawBlocks.filter((_, i) => {
        if (i === primary) return true;
        extraCount++;
        return extraCount !== blockIndexInExtras;
      }) as unknown as AgentDefinitionMessage["content"];
      const updated = allMessages.map((m, i) =>
        i === messageIndex ? { ...m, content: newContent } : m,
      );
      dispatch(setAgentMessages({ id: agentId, messages: updated }));
    },
    [agentId, messageIndex, allMessages, message, rawBlocks, dispatch],
  );

  const handleAddBlock = useCallback(
    (block: Record<string, unknown>) => {
      if (!allMessages || !message) return;
      // MATRX-EXCEPTION: generic block editor, narrowed at write-back only.
      const newContent = [
        ...rawBlocks,
        block,
      ] as unknown as AgentDefinitionMessage["content"];
      const updated = allMessages.map((m, i) =>
        i === messageIndex ? { ...m, content: newContent } : m,
      );
      dispatch(setAgentMessages({ id: agentId, messages: updated }));
    },
    [agentId, messageIndex, allMessages, message, rawBlocks, dispatch],
  );

  const handleUpdateBlock = useCallback(
    (index: number, block: Record<string, unknown>) => {
      if (!allMessages || !message) return;
      const primary = findPrimaryIndex(rawBlocks);
      let extraCount = -1;
      // MATRX-EXCEPTION: generic block editor, narrowed at write-back only.
      const newContent = rawBlocks.map((b, i) => {
        if (i === primary) return b;
        extraCount++;
        return extraCount === index ? block : b;
      }) as unknown as AgentDefinitionMessage["content"];
      const updated = allMessages.map((m, i) =>
        i === messageIndex ? { ...m, content: newContent } : m,
      );
      dispatch(setAgentMessages({ id: agentId, messages: updated }));
    },
    [agentId, messageIndex, allMessages, message, rawBlocks, dispatch],
  );

  const handleDelete = useCallback(() => {
    if (!allMessages) return;
    const updated = allMessages.filter((_, i) => i !== messageIndex);
    dispatch(setAgentMessages({ id: agentId, messages: updated }));
  }, [agentId, messageIndex, allMessages, dispatch]);

  const handleClear = useCallback(
    () => handleTextChange(""),
    [handleTextChange],
  );

  const handleVoiceTranscription = useCallback(
    (transcribedText: string) => {
      const trimmed = transcribedText.trim();
      if (!trimmed) return;
      const updated = currentText ? currentText + "\n\n" + trimmed : trimmed;
      handleTextChange(updated);
    },
    [currentText, handleTextChange],
  );

  // Scroll fix: restore scroll after re-render
  useLayoutEffect(() => {
    if (!isEditing) return;
    const textarea = textareaRef.current;
    const scrollContainer = scrollContainerRef?.current;
    if (!textarea || !scrollContainer) return;

    const lockData = scrollLockRef.current;
    const savedScroll = lockData?.scrollTop ?? scrollContainer.scrollTop;
    const originalOverflow =
      lockData?.overflow ?? scrollContainer.style.overflow;

    scrollContainer.style.overflow = "hidden";
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
    scrollContainer.scrollTop = savedScroll;
    scrollContainer.style.overflow = originalOverflow;
    scrollLockRef.current = null;
  }, [currentText, isEditing, scrollContainerRef]);

  useLayoutEffect(() => {
    if (!isEditing) {
      textareaInitializedRef.current = false;
    }
  }, [isEditing]);

  // Context menu handlers
  const handleTextReplace = useCallback(
    (newText: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      handleTextChange(
        currentText.substring(0, start) + newText + currentText.substring(end),
      );
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start, start + newText.length);
      }, 0);
    },
    [currentText, handleTextChange],
  );

  const handleTextInsertBefore = useCallback(
    (text: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const insertText = text + "\n\n";
      handleTextChange(
        currentText.substring(0, start) +
          insertText +
          currentText.substring(start),
      );
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(
          start + insertText.length,
          start + insertText.length,
        );
      }, 0);
    },
    [currentText, handleTextChange],
  );

  const handleTextInsertAfter = useCallback(
    (text: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const end = textarea.selectionEnd;
      const insertText = "\n\n" + text;
      handleTextChange(
        currentText.substring(0, end) + insertText + currentText.substring(end),
      );
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(
          end + insertText.length,
          end + insertText.length,
        );
      }, 0);
    },
    [currentText, handleTextChange],
  );

  const handleContentInserted = useCallback(() => {
    contextMenuOpenRef.current = false;
  }, []);

  const insertVariableAtCursor = useCallback(
    (variable: string) => {
      const textarea = textareaRef.current;
      const cursorPos = cursorPositions[messageIndex] ?? currentText.length;
      const insertion = `{{${variable}}}`;
      const newText =
        currentText.substring(0, cursorPos) +
        insertion +
        currentText.substring(cursorPos);
      handleTextChange(newText);
      const newCursorPos = cursorPos + insertion.length;
      setCursorPositions((prev) => ({
        ...prev,
        [messageIndex]: newCursorPos,
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
    [currentText, cursorPositions, messageIndex, handleTextChange],
  );

  const handleBeforeVariableSelectorOpen = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      setCursorPositions((prev) => ({
        ...prev,
        [messageIndex]: textarea.selectionStart,
      }));
    }
    if (!isEditing) {
      setIsEditing(true);
    }
  }, [messageIndex, isEditing]);

  // Textarea handlers
  const handleTextareaRef = useCallback((el: HTMLTextAreaElement | null) => {
    textareaRef.current = el;
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
            if (scrollContainerRef.current)
              scrollContainerRef.current.scrollTop = savedScroll;
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
          if (scrollContainerRef.current)
            scrollContainerRef.current.scrollTop = savedScroll;
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
          if (scrollContainerRef.current)
            scrollContainerRef.current.scrollTop = savedScroll;
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
          if (scrollContainerRef.current)
            scrollContainerRef.current.scrollTop = savedScroll;
        });
      }
      const target = e.target as HTMLTextAreaElement;
      setCursorPositions((prev) => ({
        ...prev,
        [messageIndex]: target.selectionStart,
      }));
    },
    [scrollContainerRef, messageIndex],
  );

  const handleContextMenu = useCallback(() => {
    contextMenuOpenRef.current = true;
  }, []);

  const handleFocus = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      setCursorPositions((prev) => ({
        ...prev,
        [messageIndex]: e.target.selectionStart,
      }));
    },
    [messageIndex],
  );

  const handleBlur = useCallback(() => {
    if (!contextMenuOpenRef.current) setIsEditing(false);
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
        if (textareaRef.current && clickPosition > 0) {
          textareaRef.current.setSelectionRange(clickPosition, clickPosition);
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
        if (textareaRef.current) {
          textareaRef.current.focus({ preventScroll: true });
          textareaRef.current.setSelectionRange(start, end);
        }
      });
    },
    [isEditing, scrollContainerRef],
  );

  const buildAgentScope = useAgentBuilderSurfaceScope(agentId);

  // Surface scope for `matrx-user/agent-builder`. Agent-level values come from
  // the hook; `content` is the message text being edited. Top-level keys flow
  // through EditableContextMenu into the ApplicationScope.
  const contextMenuData = useMemo(
    () => ({
      ...buildAgentScope(),
      content: currentText,
      focused_field: `message:${message?.role ?? "user"}`,
    }),
    [buildAgentScope, currentText, message],
  );

  const displayRole =
    message?.role === "user" || message?.role === "assistant"
      ? message.role
      : "user";

  if (!message || !allMessages) {
    return <Skeleton className="h-[120px] w-full rounded-md" />;
  }

  return (
    <div className={cn("group rounded-lg bg-muted ")}>
      {/* Header */}
      <div className="flex items-center justify-between sticky top-0 z-10 pt-0 pb-1 pr-2 rounded-t-lg bg-transparent">
        <div className="flex items-center gap-1">
          <Select
            value={displayRole}
            onValueChange={(v) => handleRoleChange(v as PrimingMessageRole)}
          >
            <SelectTrigger className="h-4 bg-transparent text-foreground !border-none hover:bg-accent w-auto min-w-[120px] text-xs !shadow-none focus:ring-0 focus:ring-offset-0 [&>svg]:opacity-0 [&>svg]:group-hover:opacity-100 [&>svg]:transition-opacity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="assistant">Assistant</SelectItem>
            </SelectContent>
          </Select>
          <MessageViewModeMenu viewMode={viewMode} onChange={setViewMode} />
        </div>
        <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <MessageItemButtons
            hasVariableSupport={hasVariableSupport}
            hasFullScreenEditor={!!onOpenFullScreenEditor}
            variableNames={variableNames}
            onVariableSelected={insertVariableAtCursor}
            onBeforeVariableSelectorOpen={handleBeforeVariableSelectorOpen}
            templateRole={message.role}
            templateCurrentContent={currentText}
            onTemplateContentSelected={handleTextChange}
            templateMessageIndex={messageIndex}
            onSaveTemplate={() => {}}
            onOpenFullScreenEditor={
              onOpenFullScreenEditor
                ? () => onOpenFullScreenEditor(messageIndex)
                : undefined
            }
            onClear={handleClear}
            onDelete={handleDelete}
            onAddBlockType={(type) => setPendingAddType(type)}
            onVoiceTranscription={handleVoiceTranscription}
            sheetTitle={`${message.role} Message Actions`}
          />
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {viewMode === "preview" ? (
          <div
            className="cursor-text"
            style={{ minHeight: "80px" }}
            onClick={() => setViewMode("edit")}
            title="Click to edit"
          >
            {currentText ? (
              <MarkdownStream
                content={currentText}
                hideCopyButton
                className="text-sm"
                // Persist in-block edits (JSON reformat, code edits, etc.)
                // back to the agent definition so they survive the
                // preview ↔ edit toggle and reach the DB.
                onContentChange={handleTextChange}
              />
            ) : (
              <span className="text-xs text-muted-foreground italic">
                {message.role === "assistant"
                  ? "Assistant response / example output..."
                  : "User message / example input..."}
              </span>
            )}
          </div>
        ) : isEditing ? (
          <EditableContextMenu
            sourceFeature="agent-builder"
            surfaceName="matrx-user/agent-builder"
            getTextarea={() => textareaRef.current}
            contextData={contextMenuData}
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
              value={currentText}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              onMouseDown={handleMouseDown}
              onSelect={handleSelect}
              onContextMenu={handleContextMenu}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder={
                message.role === "assistant"
                  ? "Assistant response / example output..."
                  : "User message / example input..."
              }
              className="w-full bg-transparent border-none outline-none text-xs text-foreground placeholder:text-muted-foreground p-0 resize-none overflow-hidden leading-normal"
              style={{ minHeight: "80px", lineHeight: "1.5" }}
            />
          </EditableContextMenu>
        ) : (
          <div
            className="text-xs text-muted-foreground whitespace-pre-wrap cursor-text leading-normal"
            onClick={handleViewClick}
            onMouseUp={handleViewMouseUp}
            style={{ minHeight: "80px", lineHeight: "1.5" }}
          >
            {currentText ? (
              <HighlightedText
                text={currentText}
                validVariables={variableNames}
              />
            ) : (
              <span className="italic">
                {message.role === "assistant"
                  ? "Assistant response / example output..."
                  : "User message / example input..."}
              </span>
            )}
          </div>
        )}

        {/* Content blocks (non-primary: role-tagged text + media) */}
        {(extraBlocks.length > 0 || pendingAddType != null) && (
          <div className="pt-2">
            <BlockList
              blocks={extraBlocks}
              onUpdateBlock={handleUpdateBlock}
              onRemoveBlock={handleRemoveBlock}
              onAddBlock={handleAddBlock}
              pendingAddType={pendingAddType}
              onPendingAddTypeClear={() => setPendingAddType(undefined)}
              validVariables={variableNames}
            />
          </div>
        )}
      </div>
    </div>
  );
}
