"use client";

import React from "react";
import MarkdownCore from "@/components/markdown-core/MarkdownCore";
import { cn } from "@/lib/utils";
import { NestedRichContent } from "@/components/rich-content/standard/NestedRichContent";

type ThinkingTraceMarkdownVariant = "inline" | "body";

interface ThinkingTraceMarkdownProps {
  content: string;
  variant?: ThinkingTraceMarkdownVariant;
  className?: string;
}

const inlineComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <span className="inline">{children}</span>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-foreground/85">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic">{children}</em>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <span className="inline">{children}</span>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <span className="inline">{children}</span>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <span className="inline [&:not(:last-child)]:mr-1">{children}</span>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <span className="inline">{children}</span>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded bg-muted/60 px-0.5 font-mono text-[0.9em]">
      {children}
    </code>
  ),
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a
      href={href}
      className="text-primary underline underline-offset-2"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
};

/**
 * Compact markdown renderer for thinking / reasoning traces.
 * `inline` keeps the collapsed one-line tail readable; `body` is for expand.
 */
export function ThinkingTraceMarkdown({
  content,
  variant = "body",
  className,
}: ThinkingTraceMarkdownProps) {
  if (!content.trim()) return null;

  if (variant === "body") {
    // The expanded trace is content inside the answer: the same core at the
    // standard level, one depth deeper — its tables, math, fenced code and
    // nested sections render as themselves (depth-bounded, streaming-safe).
    return (
      <div className={cn("min-w-0 text-muted-foreground", className)}>
        <NestedRichContent source={content} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "min-w-0 text-muted-foreground truncate [&_*]:inline",
        className,
      )}
    >
      <MarkdownCore preset="gfm-breaks" components={inlineComponents}>
        {content}
      </MarkdownCore>
    </div>
  );
}
