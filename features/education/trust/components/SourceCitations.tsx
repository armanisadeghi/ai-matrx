// features/education/trust/components/SourceCitations.tsx
//
// The citation chips ARE the marketing. Render <SourceCitations trust={item.trust} />
// under any AI-generated item; each cited source becomes a tappable chip that
// opens the exact passage it was grounded in. Nothing renders when there are no
// citations — a grounded item with an empty citation list simply shows nothing.
//
// This is deliberately presentational + self-contained: it reads the envelope's
// `citations[]` and shows title / locator / excerpt. Resolving a citation to a
// live, navigable source view (open the PDF at the page) is a consumer concern —
// pass `onOpenSource` to wire it; without it, the excerpt popover is the resolve.

"use client";

import { Quote, FileText, Link as LinkIcon, ExternalLink } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { SourceCitation, TrustEnvelope } from "../types";
import { citationIsOpenable, openCitationSource } from "../open-source";

const KIND_ICON = {
  url: LinkIcon,
  web: LinkIcon,
} as const;

function citationLabel(c: SourceCitation, index: number): string {
  if (c.title) return c.title;
  if (c.locator) return c.locator;
  return `Source ${index + 1}`;
}

export interface SourceCitationsProps {
  trust: TrustEnvelope | null | undefined;
  className?: string;
  /**
   * Override how a citation's source opens. By default a citation with a durable
   * `fileId`/`url` opens the REAL source (canonical file-preview window / new
   * tab) via `openCitationSource` — pass this only to customize.
   */
  onOpenSource?: (citation: SourceCitation) => void;
  /** Small heading above the chips (default: "Sources"). Pass null to hide. */
  label?: string | null;
}

export function SourceCitations({
  trust,
  className,
  onOpenSource,
  label = "Sources",
}: SourceCitationsProps) {
  const citations = trust?.citations ?? [];
  if (citations.length === 0) return null;

  const open = (c: SourceCitation) => {
    if (onOpenSource) onOpenSource(c);
    else openCitationSource(c);
  };

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && (
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
      )}
      <div className="flex flex-wrap gap-1">
        {citations.map((c, i) => {
          const Icon =
            (KIND_ICON as Record<string, typeof FileText>)[c.sourceKind] ??
            FileText;
          return (
            <Popover key={`${c.sourceId}-${i}`}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex max-w-[16rem] items-center gap-1 rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-xs text-foreground transition-colors hover:bg-accent"
                >
                  <Icon className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{citationLabel(c, i)}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 p-3">
                <div className="flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {citationLabel(c, i)}
                      </p>
                      {c.locator && (
                        <p className="text-xs text-muted-foreground">
                          {c.locator}
                        </p>
                      )}
                    </div>
                  </div>
                  {c.excerpt && (
                    <blockquote className="flex gap-2 rounded-md bg-muted/60 p-2 text-xs italic text-muted-foreground">
                      <Quote className="h-3 w-3 shrink-0" aria-hidden />
                      <span className="not-italic">{c.excerpt}</span>
                    </blockquote>
                  )}
                  {(onOpenSource || citationIsOpenable(c)) && (
                    <button
                      type="button"
                      onClick={() => open(c)}
                      className="inline-flex items-center gap-1 self-start text-xs font-medium text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" aria-hidden />
                      {c.url ? "Open web source" : "Open full source"}
                    </button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          );
        })}
      </div>
    </div>
  );
}
