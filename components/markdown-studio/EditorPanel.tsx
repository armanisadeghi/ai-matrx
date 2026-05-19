// components/markdown-studio/EditorPanel.tsx
// Polished editor pane for the Markdown Studio. Textarea with a gutter
// showing live line/char counts, a hover-revealed insert-template hint,
// and a footer that surfaces the live block atlas so the user can see
// what the V2 splitter is detecting as they type.

"use client";

import React, { useMemo } from "react";
import { Hash, RotateCcw, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { BlockStatsCard } from "./BlockStatsCard";
import { runV2Parser } from "@/components/admin/markdown-tester/utils/run-v2-parser";

interface EditorPanelProps {
  content: string;
  onChange: (value: string) => void;
  onScroll?: () => void;
  onClear: () => void;
  textareaRef: React.Ref<HTMLTextAreaElement>;
}

export function EditorPanel({
  content,
  onChange,
  onScroll,
  onClear,
  textareaRef,
}: EditorPanelProps) {
  const stats = useMemo(() => {
    const lines = content.split("\n").length;
    const chars = content.length;
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    return { lines, chars, words };
  }, [content]);

  const detectedBlocks = useMemo(() => {
    if (!content.trim()) return [];
    return runV2Parser(content);
  }, [content]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card/30">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Type className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium tracking-wide">Source</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge
            variant="outline"
            className="h-5 px-1.5 text-[10px] font-mono"
          >
            <Hash className="h-2.5 w-2.5 mr-0.5" />
            {stats.lines} {stats.lines === 1 ? "line" : "lines"}
          </Badge>
          <Badge
            variant="outline"
            className="h-5 px-1.5 text-[10px] font-mono"
          >
            {stats.words} {stats.words === 1 ? "word" : "words"}
          </Badge>
          <Badge
            variant="outline"
            className="h-5 px-1.5 text-[10px] font-mono"
          >
            {stats.chars} chars
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={onClear}
            title="Clear editor"
            disabled={!content}
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => onChange(e.target.value)}
          onScroll={onScroll}
          spellCheck={false}
          placeholder="Type or paste markdown here.

Try a template from the top bar to see every block type the parser can detect.

⌘K to load a sample · ⌘S to save · ⌘Enter to run analysis"
          className={cn(
            "h-full w-full resize-none bg-transparent px-4 py-3",
            "font-mono text-[13px] leading-[1.55] tracking-tight",
            "text-foreground placeholder:text-muted-foreground/60",
            "focus:outline-none",
          )}
          style={{ fontSize: "16px" }}
        />
      </div>

      {/* Footer — block atlas */}
      <div className="border-t border-border bg-background/40 p-2">
        <BlockStatsCard blocks={detectedBlocks} />
      </div>
    </div>
  );
}
