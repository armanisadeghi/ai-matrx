// features/education/trust/components/SourceCitations.tsx
//
// The citation chips ARE the marketing. Render <SourceCitations trust={item.trust} />
// under any AI-generated item; each cited source becomes a tappable chip that
// opens the exact passage it was grounded in. Nothing renders when there are no
// citations — a grounded item with an empty citation list simply shows nothing.
//
// Chips render through the ONE shared presentational primitive
// (`CitationChip`, components/official/citation-chip/). This file stays the
// TrustEnvelope-aware consumer: it maps `SourceCitation` to chip props and
// wires `openCitationSource`. The primitive itself knows nothing of
// TrustEnvelope — that boundary keeps chat/education decoupled while sharing
// the chip.
//
// Resolving a citation to a live, navigable source view (open the PDF at the
// page) is a consumer concern — pass `onOpenSource` to wire it; without it,
// the excerpt popover is the resolve.

"use client";

import { FileText, Link as LinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import CitationChip from "@/components/official/citation-chip/CitationChip";
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
        {citations.map((c, i) => (
          <CitationChip
            key={`${c.sourceId}-${i}`}
            icon={
              (KIND_ICON as Record<string, typeof FileText>)[c.sourceKind] ??
              FileText
            }
            label={citationLabel(c, i)}
            locator={c.locator}
            excerpt={c.excerpt}
            onOpen={
              onOpenSource || citationIsOpenable(c) ? () => open(c) : undefined
            }
            openLabel={c.url ? "Open web source" : "Open full source"}
          />
        ))}
      </div>
    </div>
  );
}
