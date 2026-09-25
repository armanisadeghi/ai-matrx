"use client";

// components/rich-editor/islands/IslandPreview.tsx
//
// An island shown the way readers see it — through the ONE shared renderer
// (MarkdownStream → kind registry), never a second renderer. A page break
// draws the print package's divider; comments and anchors, which render as
// nothing, show their source quietly so the person knows they are there.

import MarkdownStream from "@/components/MarkdownStream";
import { PAGE_BREAK_CLASS, PAGE_BREAK_LABEL, isPageBreakLine } from "@ai-matrx/print/directives";
import { cn } from "@/lib/utils";
import { islandMeta } from "./island-meta";

export interface IslandPreviewProps {
  raw: string;
  islandType: string;
  className?: string;
}

export function IslandPreview({ raw, islandType, className }: IslandPreviewProps) {
  if (isPageBreakLine(raw.trim())) {
    return (
      <div
        className={cn(PAGE_BREAK_CLASS, "my-1 flex items-center gap-3 text-xs text-muted-foreground", className)}
        role="separator"
        aria-label={PAGE_BREAK_LABEL}
      >
        <span className="h-px flex-1 border-t border-dashed border-border" />
        {PAGE_BREAK_LABEL}
        <span className="h-px flex-1 border-t border-dashed border-border" />
      </div>
    );
  }
  const meta = islandMeta(islandType, raw);
  if (!meta.renders || !raw.trim()) {
    return (
      <pre className={cn("whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground", className)}>
        {raw || "(empty)"}
      </pre>
    );
  }
  return (
    <div className={cn("rich-editor-island-render min-w-0", className)}>
      <MarkdownStream imagePolicy="inherit" content={raw} hideCopyButton allowFullScreenEditor={false} />
    </div>
  );
}
