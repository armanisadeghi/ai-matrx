"use client";

import React from "react";
import dynamic from "next/dynamic";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { cn } from "@/lib/utils";

const ReactMarkdown = dynamic(() => import("react-markdown"), { ssr: false });

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

const bodyComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-1.5 last:mb-0">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-foreground/85">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic">{children}</em>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-1.5 list-disc pl-4 last:mb-0">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-1.5 list-decimal pl-4 last:mb-0">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="mb-0.5">{children}</li>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="mb-1.5 border-l-2 border-border/70 pl-2 italic last:mb-0">
      {children}
    </blockquote>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[0.9em]">
      {children}
    </code>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="mb-1.5 overflow-x-auto rounded-md bg-muted/50 p-2 font-mono text-[0.9em] last:mb-0">
      {children}
    </pre>
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

  return (
    <div
      className={cn(
        "min-w-0 text-muted-foreground",
        variant === "inline" && "truncate [&_*]:inline",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={variant === "inline" ? inlineComponents : bodyComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
