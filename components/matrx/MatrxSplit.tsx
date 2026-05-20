"use client";

import React, { useRef, useCallback, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import MarkdownStream, {
  type MarkdownStreamProps,
} from "@/components/MarkdownStream";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Eye, PenLine } from "lucide-react";
import type {
  ContentSource,
  RichDocumentActionId,
  RichDocumentActionsVariant,
  RichDocumentActionsPosition,
  RichDocumentActionsBehavior,
} from "@/features/rich-document/types";

// Lazy — only pulled into the bundle when a caller opts into actions by
// passing `actionsSource`. Consumers that don't use the action surface pay
// nothing for the rich-document registry.
const RichDocument = dynamic(
  () =>
    import("@/features/rich-document/RichDocument").then((m) => ({
      default: m.RichDocument,
    })),
  { ssr: false },
);

export interface MatrxSplitProps {
  /** The markdown content to edit and preview */
  value: string;
  /** Called with the new string value whenever the editor content changes */
  onChange: (value: string) => void;
  /** Optional ref forwarded to the underlying <textarea> element */
  textareaRef?: React.Ref<HTMLTextAreaElement>;
  /** Placeholder text shown when the editor is empty */
  placeholder?: string;
  /** Extra className applied to the outer ResizablePanelGroup */
  className?: string;
  /** Initial panel sizes as [leftPercent, rightPercent]. Defaults to [50, 50] */
  defaultLayout?: [number, number];
  /** Extra className for the textarea panel's inner element */
  textareaClassName?: string;
  /** Extra className for the preview panel's inner element */
  previewClassName?: string;
  /** Hide the copy button inside MarkdownStream. Defaults to true */
  hideCopyButton?: boolean;
  /** Message shown in the preview panel when value is empty */
  emptyPreviewMessage?: string;
  /** Enable proportional scroll sync between editor and preview. Defaults to true */
  syncScroll?: boolean;
  /** Passed to MarkdownStream preview (e.g. structured blocks in message context) */
  analysisData?: MarkdownStreamProps["analysisData"];
  messageId?: string;
  allowFullScreenEditor?: boolean;
  /** Extra className on the MarkdownStream in the preview pane */
  previewMarkdownClassName?: string;
  /**
   * Called when an edit originates inside the preview pane's MarkdownStream
   * (full-screen editor, block edits, etc.). Receives the full updated
   * markdown. If omitted, defaults to `onChange` so the editor and preview
   * stay in lockstep — which is the correct behavior for any consumer that
   * treats the textarea value and the preview as the same document.
   *
   * Pass a distinct handler only when you need to flush synchronously on
   * preview-originated edits (e.g. to skip a debounce) — keystroke edits
   * still go through `onChange`.
   */
  onPreviewChange?: (value: string) => void;
  /**
   * Optional node rendered absolutely on top of the editor textarea — used
   * by features like find/replace to paint match highlights without
   * interfering with textarea input. Must be pointer-events:none for the
   * textarea to remain interactive.
   */
  editorOverlay?: React.ReactNode;
  /**
   * Optional ref to the preview pane's scroll container. Consumers use
   * this to register CSS-highlight ranges for search matches, measure
   * scroll position, etc.
   */
  previewContainerRef?: React.Ref<HTMLDivElement | null>;
  /**
   * Opt into the RichDocument action surface on the preview pane. When set,
   * the preview renders `<RichDocument source={actionsSource} .../>` instead
   * of a bare `<MarkdownStream/>`, so users get copy / save-to-task / print /
   * etc. on the rendered content. When omitted, MatrxSplit behaves exactly
   * as before (zero impact on existing callers; RichDocument isn't even
   * loaded into the bundle).
   */
  actionsSource?: ContentSource;
  /** Action surface variant. Defaults to "remote" when actionsSurfaceId is set, else "icon-only". */
  actionsVariant?: RichDocumentActionsVariant;
  /** Action surface position. Defaults to "top-right". */
  actionsPosition?: RichDocumentActionsPosition;
  /** Action surface visibility. Defaults to "hover-only". */
  actionsBehavior?: RichDocumentActionsBehavior;
  /** Remote surface id — pairs with a <RichDocumentActionSurface/> elsewhere (e.g. a header). */
  actionsSurfaceId?: string;
  /** Action IDs to hide in the preview's action surface. */
  actionsExclude?: (RichDocumentActionId | string)[];
}

/**
 * Assign a DOM node to a React ref (callback or object form).
 * Used to merge the external textareaRef with the internal one.
 */
function setRef<T>(ref: React.Ref<T> | undefined, node: T | null) {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(node);
  } else {
    (ref as React.MutableRefObject<T | null>).current = node;
  }
}

/**
 * MatrxSplit — a resizable two-pane editor/preview component.
 * Left pane: plain textarea for writing markdown.
 * Right pane: live MarkdownStream preview.
 * Draggable divider courtesy of react-resizable-panels.
 *
 * When `syncScroll` is enabled (default), scrolling either pane
 * proportionally scrolls the other, so both stay at the same
 * relative position even when their content heights differ.
 */
export function MatrxSplit({
  value,
  onChange,
  textareaRef,
  placeholder = "Start writing...",
  className,
  defaultLayout = [50, 50],
  textareaClassName,
  previewClassName,
  hideCopyButton = true,
  emptyPreviewMessage = "Nothing to preview",
  syncScroll = true,
  analysisData,
  messageId,
  allowFullScreenEditor,
  previewMarkdownClassName,
  onPreviewChange,
  editorOverlay,
  previewContainerRef,
  actionsSource,
  actionsVariant,
  actionsPosition,
  actionsBehavior,
  actionsSurfaceId,
  actionsExclude,
}: MatrxSplitProps) {
  const previewChange = onPreviewChange ?? onChange;
  const isMobile = useIsMobile();
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");

  // Single source of truth for the preview body — swaps to RichDocument when
  // a caller opts into actions, else the bare MarkdownStream. Used by both
  // the mobile single-pane and the desktop two-pane layouts below.
  const renderPreviewBody = () => {
    if (actionsSource) {
      return (
        <RichDocument
          content={previewValue}
          source={actionsSource}
          actionsVariant={
            actionsVariant ?? (actionsSurfaceId ? "remote" : "hover-menu")
          }
          actionsSurfaceId={actionsSurfaceId}
          actions={
            actionsExclude ? { exclude: actionsExclude } : undefined
          }
          isStreamActive={false}
          hideCopyButton={hideCopyButton}
          analysisData={analysisData}
          messageId={messageId}
          allowFullScreenEditor={allowFullScreenEditor}
          contentClassName={previewMarkdownClassName}
          onContentChange={previewChange}
        />
      );
    }
    return (
      <MarkdownStream
        content={previewValue}
        isStreamActive={false}
        hideCopyButton={hideCopyButton}
        analysisData={analysisData}
        messageId={messageId}
        allowFullScreenEditor={allowFullScreenEditor}
        className={previewMarkdownClassName}
        onContentChange={previewChange}
      />
    );
  };

  const internalTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const isSyncing = useRef(false);

  const mergedPreviewRef = useCallback(
    (node: HTMLDivElement | null) => {
      previewRef.current = node;
      setRef(previewContainerRef, node);
    },
    [previewContainerRef],
  );

  // ── Local textarea state ──────────────────────────────────────────────
  // The textarea is driven from `localValue`, not from the `value` prop.
  // This decouples keystroke paint from the preview pane: the textarea
  // re-renders instantly from local state, while the preview pane consumes
  // a debounced copy (`previewValue`) so a 400KB document's re-render doesn't
  // fire on every keystroke. `useDeferredValue` was tried here first — it
  // was a net loss, because with a sufficiently expensive preview subtree,
  // React never finds idle time and just stacks up deferred attempts, each
  // costing hundreds of ms. A simple time-based debounce is the right tool.
  //
  // `onChange(newValue)` is still fired on every keystroke so the parent's
  // Redux sync is unchanged — this is purely a preview-render optimization.
  const [localValue, setLocalValue] = useState(value);
  const [previewValue, setPreviewValue] = useState(value);
  const lastEmittedRef = useRef(value);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Accept external value changes (realtime updates, undo, note switch,
  // programmatic edits). Self-echoes — where the parent's debounced sync
  // comes back carrying what we just typed — are ignored to avoid
  // unnecessary re-renders.
  useEffect(() => {
    if (value === lastEmittedRef.current) return;
    lastEmittedRef.current = value;
    setLocalValue(value);
    // External update: flush to preview immediately so the preview is in
    // sync with the authoritative value. No debounce — external changes are
    // infrequent and the user isn't typing when they arrive.
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    setPreviewValue(value);
  }, [value]);

  // Cleanup pending preview debounce on unmount.
  useEffect(() => {
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, []);

  const handleLocalChange = useCallback(
    (next: string) => {
      setLocalValue(next);
      lastEmittedRef.current = next;
      onChange(next);

      // Debounced preview update. 400ms matches typical "stopped typing"
      // thresholds — short enough to feel live, long enough that even on
      // very large documents the preview doesn't get stuck re-rendering
      // during an active typing burst.
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      previewTimerRef.current = setTimeout(() => {
        previewTimerRef.current = null;
        setPreviewValue(next);
      }, 400);
    },
    [onChange],
  );

  const mergedTextareaRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      internalTextareaRef.current = node;
      setRef(textareaRef, node);
    },
    [textareaRef],
  );

  const handleEditorScroll = useCallback(() => {
    if (!syncScroll || isSyncing.current) return;
    const editor = internalTextareaRef.current;
    const preview = previewRef.current;
    if (!editor || !preview) return;

    const maxScroll = editor.scrollHeight - editor.clientHeight;
    if (maxScroll <= 0) return;

    const pct = editor.scrollTop / maxScroll;
    const previewMax = preview.scrollHeight - preview.clientHeight;

    isSyncing.current = true;
    preview.scrollTop = pct * previewMax;
    requestAnimationFrame(() => {
      isSyncing.current = false;
    });
  }, [syncScroll]);

  const handlePreviewScroll = useCallback(() => {
    if (!syncScroll || isSyncing.current) return;
    const editor = internalTextareaRef.current;
    const preview = previewRef.current;
    if (!editor || !preview) return;

    const maxScroll = preview.scrollHeight - preview.clientHeight;
    if (maxScroll <= 0) return;

    const pct = preview.scrollTop / maxScroll;
    const editorMax = editor.scrollHeight - editor.clientHeight;

    isSyncing.current = true;
    editor.scrollTop = pct * editorMax;
    requestAnimationFrame(() => {
      isSyncing.current = false;
    });
  }, [syncScroll]);

  if (isMobile) {
    return (
      <div
        className={cn("flex flex-col h-full w-full overflow-hidden", className)}
      >
        {/* Mode toggle bar */}
        <div className="flex-shrink-0 flex items-center border-b border-border bg-card">
          <button
            type="button"
            onClick={() => setMobileView("edit")}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors",
              mobileView === "edit"
                ? "text-primary border-b-2 border-primary bg-primary/5"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <PenLine className="h-4 w-4" />
            Edit
          </button>
          <div className="w-px h-6 bg-border" />
          <button
            type="button"
            onClick={() => setMobileView("preview")}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors",
              mobileView === "preview"
                ? "text-primary border-b-2 border-primary bg-primary/5"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Eye className="h-4 w-4" />
            Preview
          </button>
        </div>

        {/* Content area — single scroll region, no nesting */}
        <div className="flex-1 min-h-0 relative">
          {mobileView === "edit" ? (
            <>
              <textarea
                ref={mergedTextareaRef}
                value={localValue}
                onChange={(e) => handleLocalChange(e.target.value)}
                placeholder={placeholder}
                aria-label="Markdown editor"
                className={cn(
                  "absolute inset-0 h-full w-full resize-none border-none bg-transparent p-4 leading-[1.7] font-[inherit] text-foreground outline-none placeholder:text-muted-foreground overflow-y-auto scrollbar-thin-auto",
                  textareaClassName,
                )}
                style={{ fontSize: "16px" }}
              />
              {editorOverlay}
            </>
          ) : (
            <div
              ref={mergedPreviewRef}
              className={cn(
                "absolute inset-0 overflow-y-auto py-2 px-4 pb-safe scrollbar-thin-auto",
                previewClassName,
              )}
            >
              {previewValue.trim() ? (
                renderPreviewBody()
              ) : (
                <p className="py-2 text-sm italic text-muted-foreground">
                  {emptyPreviewMessage}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className={cn("h-full w-full", className)}
    >
      <ResizablePanel defaultSize={defaultLayout[0]} minSize={20}>
        <div className="relative h-full w-full">
          <textarea
            ref={mergedTextareaRef}
            value={localValue}
            onChange={(e) => handleLocalChange(e.target.value)}
            onScroll={handleEditorScroll}
            placeholder={placeholder}
            aria-label="Markdown editor"
            className={cn(
              "h-full w-full resize-none border-none bg-transparent p-4 text-sm leading-[1.7] font-[inherit] text-foreground outline-none placeholder:text-muted-foreground overflow-y-auto scrollbar-thin-auto",
              textareaClassName,
            )}
          />
          {editorOverlay}
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      <ResizablePanel defaultSize={defaultLayout[1]} minSize={20}>
        <div
          ref={mergedPreviewRef}
          onScroll={handlePreviewScroll}
          className={cn(
            "h-full overflow-y-auto py-2 px-5 scrollbar-thin-auto",
            previewClassName,
          )}
        >
          {previewValue.trim() ? (
            renderPreviewBody()
          ) : (
            <p className="py-2 text-sm italic text-muted-foreground">
              {emptyPreviewMessage}
            </p>
          )}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
