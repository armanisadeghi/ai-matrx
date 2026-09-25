"use client";

/**
 * Read-only extraction cell — renders markdown via BasicMarkdownContent when
 * the value looks like prose; plain pre-wrap otherwise.
 */

import dynamic from "next/dynamic";
import { Maximize2 } from "lucide-react";
import { parseStructuredCellValue, structuredCellSummary } from "./structuredCellValue";

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

function looksLikeMarkdown(text: string): boolean {
  return /(\*\*|__|#{1,6}\s|^[-*+]\s|^\d+\.\s|\[.+\]\(.+\)|`)/m.test(text);
}

export function ExtractionCellDisplay({
  value,
  onView,
}: {
  value: string;
  onView?: () => void;
}) {

  if (!value) {
    return <span className="text-muted-foreground/40">—</span>;
  }

  const structured = parseStructuredCellValue(value);
  if (structured) {
    return (
      <div className="relative min-w-0 pr-5">
        <div className="line-clamp-2 break-words text-xs leading-relaxed">
          <span aria-hidden="true">{Array.isArray(structured) ? "[ ]" : "{ }"} </span>
          {structuredCellSummary(structured)}
        </div>
        {onView ? (
          <button
            type="button"
            className="absolute right-0 top-0 inline-flex size-4 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              onView();
            }}
            title="Open JSON value"
            aria-label="Open JSON value"
          >
            <Maximize2 className="size-3" aria-hidden />
          </button>
        ) : null}
      </div>
    );
  }

  const useMarkdown = looksLikeMarkdown(value);

  if (!useMarkdown) {
    return (
      <div className="relative min-w-0 pr-5">
        <div className="line-clamp-2 whitespace-pre-wrap break-words text-xs leading-relaxed">
          {value}
        </div>
        {onView ? (
          <button
            type="button"
            className="absolute right-0 top-0 inline-flex size-4 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              onView();
            }}
            title="Open full value"
            aria-label="Open full value"
          >
            <Maximize2 className="size-3" aria-hidden />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative min-w-0 pr-5">
      <div
        className="extraction-cell-markdown max-h-10 overflow-hidden text-xs leading-relaxed [&_.math-content-wrapper]:my-0 [&_.math-content-wrapper]:text-xs [&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-xs [&_li]:my-0 [&_ol]:my-1 [&_p]:my-1 [&_ul]:my-1"
      >
        <BasicMarkdownContent imagePolicy="other" content={value} showCopyButton={false} />
      </div>
      {onView ? (
        <button
          type="button"
          className="absolute right-0 top-0 inline-flex size-4 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation();
            onView();
          }}
          title="Open full value"
          aria-label="Open full value"
        >
          <Maximize2 className="size-3" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
