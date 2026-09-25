"use client";

// THE depth-bounded recursion point. Anything rendered INSIDE other content —
// an XML section's body, a ```markdown fence's document, a markdown-valued
// kind field, prose between tags in an XML card — renders through here.
//
// It renders the source at the `standard` level one depth deeper. Past the
// cap (knob: `depthCap` on <RichContent>, default
// DEFAULT_RICH_CONTENT_DEPTH_CAP) it shows the source as plain text with a
// visible "Render" affordance that renders that one section on demand — so
// runaway or adversarial nesting degrades to readable text instead of
// recursing without bound, and nothing is ever hidden.

import { useState } from "react";
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { RichContentDepthProvider, useRichContentDepth } from "../depth";
import { StandardBlocks } from "./StandardBlocks";

export interface NestedRichContentProps {
  source: string;
  isStreaming?: boolean;
  className?: string;
}

export function NestedRichContent({
  source,
  isStreaming,
  className,
}: NestedRichContentProps) {
  const { depth, cap, ancestors } = useRichContentDepth();
  const [opened, setOpened] = useState(false);
  const next = depth + 1;

  // RECURSION ON IDENTICAL CONTENT IS REFUSED BY CONSTRUCTION. A nested
  // render whose text is the same as a section it sits inside can only ever
  // produce itself again (a lone `<inf` fragment split into an "XML block"
  // whose body is `<inf`, …) — it is text, rendered once, never re-entered.
  // No depth budget or "Render it" reset can loop past this.
  const key = source.trim();
  if (key && ancestors.some((ancestor) => ancestor.trim() === key)) {
    return (
      <div
        data-rich-content-self-nested
        className={cn("whitespace-pre-wrap break-words", className)}
      >
        {source}
      </div>
    );
  }

  if (next > cap && !opened) {
    return (
      <div data-rich-content-capped className={className}>
        <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
          <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>Nested {next} levels deep, shown as text.</span>
          <button
            type="button"
            onClick={() => setOpened(true)}
            className="rounded px-1.5 py-0.5 font-medium text-primary hover:bg-muted"
          >
            Render it
          </button>
        </div>
        <div className="whitespace-pre-wrap break-words text-sm text-foreground">
          {source}
        </div>
      </div>
    );
  }

  // Opened past the cap: this one section restarts its own depth budget.
  return (
    <RichContentDepthProvider
      depth={opened ? 0 : next}
      cap={cap}
      source={source}
    >
      <StandardBlocks
        source={source}
        isStreaming={isStreaming}
        className={className}
      />
    </RichContentDepthProvider>
  );
}

export default NestedRichContent;
