// components/markdown-studio/EditorPanel.tsx
// Polished editor pane for the Markdown Studio. Textarea with a gutter
// showing live line/char counts, a hover-revealed insert-template hint,
// and a footer that surfaces the live block atlas so the user can see
// what the V2 splitter is detecting as they type.

"use client";

import React, { useMemo } from "react";
import { Eye, Hash, RotateCcw, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { BlockStatsCard } from "./BlockStatsCard";
import { runV2Parser } from "@/components/admin/markdown-tester/utils/run-v2-parser";
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import type { ApplicationScope } from "@/features/agents/types/scope.types";

interface EditorPanelProps {
  content: string;
  onChange: (value: string) => void;
  onScroll?: () => void;
  onClear: () => void;
  textareaRef: React.Ref<HTMLTextAreaElement>;
  /**
   * Phones show one pane at a time: when given, the header carries a
   * "Preview" button — no tab strip row above the panes (UI audit B).
   */
  onShowPreview?: () => void;
  /**
   * A DEFERRED copy of the buffer for the counts and the block atlas — on a
   * multi-megabyte document they re-split the whole text, and that must
   * never sit between a keystroke and its paint.
   */
  statsContent?: string;
  /** The studio's surface scope — what the right-click AI actions see. */
  getScope?: () => ApplicationScope;
}

export function EditorPanel({
  content,
  onChange,
  onScroll,
  onClear,
  textareaRef,
  onShowPreview,
  statsContent,
  getScope,
}: EditorPanelProps) {
  const counted = statsContent ?? content;
  const localRef = React.useRef<HTMLTextAreaElement | null>(null);
  const setTextarea = (el: HTMLTextAreaElement | null) => {
    localRef.current = el;
    if (typeof textareaRef === "function") textareaRef(el);
    else if (textareaRef) (textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
  };
  const stats = useMemo(() => {
    const lines = counted.split("\n").length;
    const chars = counted.length;
    const words = counted.trim() ? counted.trim().split(/\s+/).length : 0;
    return { lines, chars, words };
  }, [counted]);

  const detectedBlocks = useMemo(() => {
    if (!counted.trim()) return [];
    return runV2Parser(counted);
  }, [counted]);

  return (
    <div className="@container flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card/30">
      {/* Header — ONE row at every width: nothing wraps, the counts step
          down (lines only) when the pane is narrow (a phone), measured on the
          pane itself, never the screen. */}
      <div className="flex min-w-0 items-center justify-between gap-2 whitespace-nowrap border-b border-border px-3 py-2">
        <div className="flex shrink-0 items-center gap-2">
          <Type className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium tracking-wide">Source</span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <Badge
            variant="outline"
            className="h-5 px-1.5 text-[10px] font-mono"
          >
            <Hash className="h-2.5 w-2.5 mr-0.5" />
            {stats.lines} {stats.lines === 1 ? "line" : "lines"}
          </Badge>
          <Badge
            variant="outline"
            className="hidden h-5 px-1.5 text-[10px] font-mono @sm:inline-flex"
          >
            {stats.words} {stats.words === 1 ? "word" : "words"}
          </Badge>
          <Badge
            variant="outline"
            className="hidden h-5 px-1.5 text-[10px] font-mono @sm:inline-flex"
          >
            {stats.chars} chars
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={onClear}
            aria-label="Clear editor"
            title="Clear editor"
            disabled={!content}
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
          {onShowPreview && (
            <button
              type="button"
              onClick={onShowPreview}
              className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground lg:hidden"
              title="Show the preview"
            >
              <Eye className="h-3.5 w-3.5" />
              Preview
            </button>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {/* Right-click: content blocks and AI actions that replace, insert
            before or insert after — THE shared editable menu (the one the
            admin tester used), never a fork. */}
        <EditableContextMenu
          sourceFeature="documents"
          surfaceName="matrx-user/markdown-studio"
          contentSource={{ type: "raw" }}
          getApplicationScope={getScope}
          getTextarea={() => localRef.current}
          onContentInserted={() => setTimeout(() => localRef.current?.focus(), 100)}
          onTextReplace={(text) => onChange(text)}
          onTextInsertBefore={(text) => onChange(`${text}${localRef.current?.value ?? content}`)}
          onTextInsertAfter={(text) => onChange(`${localRef.current?.value ?? content}${text}`)}
        >
        <textarea
          ref={setTextarea}
          value={content}
          onChange={(e) => onChange(e.target.value)}
          onScroll={onScroll}
          spellCheck={false}
          placeholder="Type or paste markdown here.

Try a template from the top bar to see every block type the parser can detect. Right-click for content blocks and AI actions.

⌘K samples · ⌘S save · ⌘Enter run the comparison"
          className={cn(
            "h-full w-full resize-none bg-transparent px-4 py-3",
            "font-mono text-[13px] leading-[1.55] tracking-tight",
            "text-foreground placeholder:text-muted-foreground/60",
            "focus:outline-none",
          )}
          style={{ fontSize: "16px" }}
        />
        </EditableContextMenu>
      </div>

      {/* Footer — block atlas */}
      <div className="border-t border-border bg-background/40 p-2">
        <BlockStatsCard blocks={detectedBlocks} />
      </div>
    </div>
  );
}
