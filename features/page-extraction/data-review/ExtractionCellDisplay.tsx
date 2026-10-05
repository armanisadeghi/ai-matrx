"use client";

/**
 * Read-only extraction cell — every text value renders through the one core
 * (<RichContent level="inline">), clamped; no regex decides what is markdown.
 */

import { RichContent } from "@/components/rich-content/RichContent";
import { Maximize2 } from "lucide-react";
import { parseStructuredCellValue, structuredCellSummary } from "./structuredCellValue";

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

  return (
    <div className="relative min-w-0 pr-5">
      <div className="line-clamp-2 break-words text-xs leading-relaxed">
        <RichContent source={value} level="inline" imagePolicy="other" />
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
