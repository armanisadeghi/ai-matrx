"use client";

/**
 * Read-only extraction cell — every text value renders through the one core
 * (<RichContent level="inline">), clamped; no regex decides what is markdown.
 */

import { RichContent } from "@ai-matrx/rich-content/levels/RichContent";
import { Maximize2 } from "lucide-react";
import { parseStructuredCellValue, structuredCellSummary } from "./structuredCellValue";
import { kindOneLine } from "@/features/content-ir/surfaces/kind-one-line";
import { rootKindSlug } from "@/features/content-ir/surfaces/json-kind-signal";

/** A cell holding a kind (or a list of kinds) reads as its one-line form (P6), never "{ } __kind, …". */
function kindCellLine(structured: object): string | null {
  if (Array.isArray(structured)) {
    if (structured.length === 0 || !structured.every((item) => rootKindSlug(item))) return null;
    return structured.map((item) => kindOneLine(item)).join(" · ");
  }
  return rootKindSlug(structured) ? kindOneLine(structured) : null;
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
  const kindLine = structured ? kindCellLine(structured) : null;
  if (structured && !kindLine) {
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
        <RichContent source={kindLine ?? value} level="inline" imagePolicy="other" />
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
