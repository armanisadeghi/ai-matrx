"use client";

// ─────────────────────────────────────────────────────────────────────────
// The `inline` level of <RichContent> — markdown + math, no blocks.
//
// Same core as every other level: the shared prose preparation
// (prose-prepare.ts), the delimiter guard, the ONE react-markdown edge
// (MarkdownCore, preset "chat" — the same plugins and math dialect a chat
// answer uses) and the shared inline-mark elements. The only difference is
// the block elements: every one renders as a <span>, so the output is valid
// phrasing content inside a <p>, <button>, <td> or heading.
//
// BUILD GRAPH: this module must stay light — it never imports the block
// splitter, the kind registry, the syntax highlighter or MarkdownStream. Its
// only loading boundary is MarkdownCore's (shared with every markdown
// surface). Import it through `<RichContent level="inline">`.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import MarkdownCore from "@/components/markdown-core/MarkdownCore";
import {
  guardMarkdownDelimiters,
  reportDelimiterViolations,
} from "@ai-matrx/kit/delimiter-guard";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { cn } from "@/lib/utils";
import { preprocessProse } from "./prose/prose-prepare";
import {
  INLINE_LEVEL_ELEMENTS,
  INLINE_LEVEL_WRAPPER_CLASS,
} from "./prose/inline-level-elements";

export { INLINE_LEVEL_ELEMENTS };

export interface RichContentInlineProps {
  source: string;
  className?: string;
}

export function RichContentInline({ source, className }: RichContentInlineProps) {
  const { text, violations } = guardMarkdownDelimiters(preprocessProse(source));

  // Loud recovery — same channel as every other level (never silent). The
  // React Compiler memoizes the guard result per source, so `violations`
  // keeps its identity until the source changes.
  useEffect(() => {
    if (violations.length === 0) return;
    reportDelimiterViolations(violations, {
      renderPath: "RichContentInline",
      capture: captureError,
    });
  }, [violations]);

  if (!source.trim()) return null;

  return (
    <span
      data-rich-content="inline"
      className={cn(INLINE_LEVEL_WRAPPER_CLASS, className)}
    >
      <MarkdownCore preset="chat" components={INLINE_LEVEL_ELEMENTS}>
        {text}
      </MarkdownCore>
    </span>
  );
}

export default RichContentInline;
