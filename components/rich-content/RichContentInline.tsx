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
import type { MarkdownComponents as Components } from "@/components/markdown-core/markdown-core-types";
import MarkdownCore from "@/components/markdown-core/MarkdownCore";
import {
  guardMarkdownDelimiters,
  reportDelimiterViolations,
} from "@ai-matrx/kit/delimiter-guard";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { cn } from "@/lib/utils";
import { THICK_HR_SENTINEL, preprocessProse } from "./prose/prose-prepare";
import { PROSE_INLINE_ELEMENTS } from "./prose/prose-inline-elements";
import { INLINE_SYNTAX_ELEMENTS } from "@/components/markdown-core/syntax/elements/core-syntax-elements";

/** Paragraph-level spans; a second one in a row starts on its own line. */
const P = "rc-inline-p";

/**
 * Block elements as phrasing content. Paragraph-like spans carry
 * `data-rc-block` so the wrapper can put consecutive ones on their own lines
 * while a single paragraph flows inline (titles, clamped rows, `truncate`).
 */
export const INLINE_LEVEL_ELEMENTS = {
  ...PROSE_INLINE_ELEMENTS,
  // The extended syntax's block constructs (callouts, tabs, figures…) as spans.
  ...INLINE_SYNTAX_ELEMENTS,
  p: ({ children }) => {
    const only = Array.isArray(children) ? null : children;
    if (only === " ") return <span data-rc-block className="block h-[0.4em]" />;
    if (only === THICK_HR_SENTINEL)
      return (
        <span
          data-rc-block
          role="separator"
          className="my-1.5 block h-[3px] rounded-full bg-blue-500 dark:bg-blue-400"
        />
      );
    return (
      <span data-rc-block className={P}>
        {children}
      </span>
    );
  },
  h1: ({ children }) => (
    <span data-rc-block className="font-semibold">
      {children}
    </span>
  ),
  h2: ({ children }) => (
    <span data-rc-block className="font-semibold">
      {children}
    </span>
  ),
  h3: ({ children }) => (
    <span data-rc-block className="font-semibold">
      {children}
    </span>
  ),
  h4: ({ children }) => (
    <span data-rc-block className="font-semibold">
      {children}
    </span>
  ),
  h5: ({ children }) => (
    <span data-rc-block className="font-semibold">
      {children}
    </span>
  ),
  h6: ({ children }) => (
    <span data-rc-block className="font-semibold">
      {children}
    </span>
  ),
  ul: ({ children }) => (
    <span data-rc-block className="block list-inside list-disc">
      {children}
    </span>
  ),
  ol: ({ children }) => (
    <span data-rc-block className="block list-inside list-decimal">
      {children}
    </span>
  ),
  li: ({ children }) => <span className="list-item">{children}</span>,
  blockquote: ({ children }) => (
    <span
      data-rc-block
      className="block border-l-2 border-border pl-2 italic text-muted-foreground"
    >
      {children}
    </span>
  ),
  pre: ({ children }) => (
    <span
      data-rc-block
      className="block overflow-x-auto whitespace-pre-wrap rounded bg-muted/60 px-1.5 py-1 font-mono text-[0.9em]"
    >
      {children}
    </span>
  ),
  hr: () => (
    <span
      data-rc-block
      role="separator"
      className="my-1 block border-t border-border"
    />
  ),
  div: ({ children, className }) => (
    <span className={cn("block", className)}>{children}</span>
  ),
  table: ({ children }) => (
    <span
      data-rc-block
      role="table"
      className="my-1 table border-collapse text-[0.9em]"
    >
      {children}
    </span>
  ),
  thead: ({ children }) => (
    <span role="rowgroup" className="table-header-group font-semibold">
      {children}
    </span>
  ),
  tbody: ({ children }) => (
    <span role="rowgroup" className="table-row-group">
      {children}
    </span>
  ),
  tr: ({ children }) => (
    <span role="row" className="table-row">
      {children}
    </span>
  ),
  th: ({ children }) => (
    <span
      role="columnheader"
      className="table-cell border border-border px-1.5 py-0.5 text-left"
    >
      {children}
    </span>
  ),
  td: ({ children }) => (
    <span role="cell" className="table-cell border border-border px-1.5 py-0.5">
      {children}
    </span>
  ),
} as Components;

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
      className={cn(
        "rich-content-inline min-w-0 break-words",
        // A second paragraph-level span starts its own line; a lone one flows.
        "[&>[data-rc-block]+[data-rc-block]]:mt-1 [&>[data-rc-block]+[data-rc-block]]:block",
        className,
      )}
    >
      <MarkdownCore preset="chat" components={INLINE_LEVEL_ELEMENTS}>
        {text}
      </MarkdownCore>
    </span>
  );
}

export default RichContentInline;
