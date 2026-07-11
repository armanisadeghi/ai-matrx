"use client";

/**
 * Read-only extraction cell — renders markdown via BasicMarkdownContent when
 * the value looks like prose; plain pre-wrap otherwise.
 */

import { useState } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";

const BasicMarkdownContent = dynamic(
  () =>
    import("@/components/mardown-display/chat-markdown/BasicMarkdownContent").then(
      (m) => m.BasicMarkdownContent,
    ),
  {
    ssr: false,
    loading: () => (
      <span className="text-xs text-muted-foreground">Rendering…</span>
    ),
  },
);

const CLAMP_CHARS = 360;

function looksLikeMarkdown(text: string): boolean {
  return /(\*\*|__|#{1,6}\s|^[-*+]\s|^\d+\.\s|\[.+\]\(.+\)|`)/m.test(text);
}

export function ExtractionCellDisplay({ value }: { value: string }) {
  const [expanded, setExpanded] = useState(false);

  if (!value) {
    return <span className="text-muted-foreground/40">—</span>;
  }

  const long = value.length > CLAMP_CHARS;
  const useMarkdown = looksLikeMarkdown(value);

  if (!useMarkdown) {
    return (
      <div className="min-w-0">
        <div
          className={cn(
            "whitespace-pre-wrap break-words text-xs leading-relaxed",
            !expanded && long && "line-clamp-4",
          )}
        >
          {value}
        </div>
        {long && (
          <button
            type="button"
            className="mt-0.5 text-[10px] text-primary hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div
        className={cn(
          "extraction-cell-markdown text-xs leading-relaxed [&_.math-content-wrapper]:my-0 [&_.math-content-wrapper]:text-xs [&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-xs [&_li]:my-0 [&_ol]:my-1 [&_p]:my-1 [&_ul]:my-1",
          !expanded && long && "max-h-[6.5rem] overflow-hidden",
        )}
      >
        <BasicMarkdownContent content={value} showCopyButton={false} />
      </div>
      {long && (
        <button
          type="button"
          className="mt-0.5 text-[10px] text-primary hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
