// components/markdown-studio/PreviewPanel.tsx
// Polished preview pane. Renders content through MarkdownStream (the
// same renderer used everywhere) inside a friendly framed surface.
// A small mode toggle lets the user flip between the rendered view
// and the raw block listing for debugging.

"use client";

import React, { forwardRef, useMemo, useState } from "react";
import { Boxes, Eye, FileText } from "lucide-react";
import MarkdownStream from "@/components/MarkdownStream";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { runV2Parser } from "@/components/admin/markdown-tester/utils/run-v2-parser";
import { getBlockTypeStyle } from "./block-type-colors";

type PreviewMode = "rendered" | "blocks";

interface PreviewPanelProps {
  content: string;
}

export const PreviewPanel = forwardRef<HTMLDivElement, PreviewPanelProps>(
  function PreviewPanel({ content }, ref) {
    const [mode, setMode] = useState<PreviewMode>("rendered");

    const blocks = useMemo(() => {
      if (mode !== "blocks") return [];
      return content.trim() ? runV2Parser(content) : [];
    }, [content, mode]);

    return (
      <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card/30">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="flex items-center gap-2">
            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium tracking-wide">Preview</span>
          </div>
          <div className="flex items-center gap-1 rounded-md border border-border bg-background/40 p-0.5">
            <button
              onClick={() => setMode("rendered")}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                mode === "rendered"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <FileText className="h-3 w-3" />
              Rendered
            </button>
            <button
              onClick={() => setMode("blocks")}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                mode === "blocks"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Boxes className="h-3 w-3" />
              Blocks
            </button>
          </div>
        </div>

        {mode === "rendered" ? (
          <div ref={ref} className="flex-1 overflow-auto p-4">
            {content.trim() ? (
              <MarkdownStream
                content={content}
                isStreamActive={false}
                hideCopyButton={true}
                allowFullScreenEditor={false}
              />
            ) : (
              <PreviewEmptyState />
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-3 space-y-2">
            {blocks.length === 0 ? (
              <PreviewEmptyState />
            ) : (
              blocks.map((block, idx) => {
                const style = getBlockTypeStyle(block.type);
                return (
                  <div
                    key={idx}
                    className={cn(
                      "rounded-md border bg-background/40 px-3 py-2",
                      style.border,
                    )}
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className="h-4 px-1.5 text-[10px] font-mono"
                      >
                        #{idx}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          "h-4 px-1.5 text-[10px] font-medium",
                          style.bg,
                          style.text,
                          style.border,
                        )}
                      >
                        {block.type}
                      </Badge>
                      <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                        {(block.content ?? "").length} B
                      </span>
                    </div>
                    <pre className="whitespace-pre-wrap break-words text-[11px] font-mono leading-snug text-muted-foreground">
                      {(block.content ?? "").slice(0, 400)}
                      {(block.content ?? "").length > 400 ? "…" : ""}
                    </pre>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    );
  },
);

function PreviewEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <div className="rounded-full bg-muted/40 p-3">
        <Eye className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">Live preview waiting</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Start typing on the left, or load a template — the rendered output
          will appear here in real time.
        </p>
      </div>
    </div>
  );
}
