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
import { openSourceLabel, plainLocator } from "../plainWords";
import { sourceRefFromCitation } from "../sourceRef";
import { useCitationPlace } from "../useCitationPlace";
import { recordCitationTarget } from "../recordCitation";
import { useDocumentPassage } from "../useDocumentPassage";
import { headingLabel } from "../documentPassage";
import { useOpenCitation } from "@/features/rag/components/source-inspector/useOpenCitation";

const isDocumentKind = (k: string | undefined) => k === "document" || k === "udt_document";

const KIND_ICON = {
  url: LinkIcon,
  web: LinkIcon,
} as const;

function citationLabel(c: SourceCitation, index: number): string {
  if (c.title) return c.title;
  const where = plainLocator(c.locator);
  if (where) return where;
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

/**
 * One chip. A citation that can open a real source names its place through
 * the ONE place function the viewer uses (`useCitationPlace`) — the agent's
 * own locator is never shown for it (verify-5: "Page 2992" for a web
 * section). A citation with no openable source keeps its plain-words locator.
 */
function TrustCitationChip({
  citation: c,
  index,
  onOpenSource,
}: {
  citation: SourceCitation;
  index: number;
  onOpenSource?: (citation: SourceCitation) => void;
}) {
  const ref = sourceRefFromCitation(c);
  const { place, open } = useCitationPlace(ref, c);
  // A conversation / table / pick list / saved result / document: the part id
  // names the place and the door opens AT it.
  const record = recordCitationTarget(c);
  const openCitation = useOpenCitation();
  // A markdown document names its place by the section the quote sits in.
  const docPlace = useDocumentPassage(
    isDocumentKind(record?.kind) ? record!.recordId : null,
    c.excerpt,
    record?.kind === "udt_document" ? "udt_document" : "document",
  );
  const recordLabel =
    isDocumentKind(record?.kind)
      ? docPlace.passage
        ? headingLabel(docPlace.passage.headings)
        : null
      : (record?.label ?? null);
  const openRecord = record
    ? () => {
        if (record.kind === "conversation" || isDocumentKind(record.kind)) {
          openCitation({
            sourceKind: record.kind,
            sourceId: record.recordId,
            href: record.href,
            chunkId: record.part,
            snippet: c.excerpt ?? null,
            fileName: c.title ?? null,
            placeLabel: recordLabel,
          });
        } else if (typeof window !== "undefined") {
          window.open(record.href, "_blank", "noopener,noreferrer");
        }
      }
    : undefined;
  const locator = record
    ? recordLabel
    : ref
      ? (place?.label ?? null)
      : (place?.label ?? plainLocator(c.locator));
  const onOpen = onOpenSource
    ? () => onOpenSource(c)
    : openRecord
      ? openRecord
      : open
      ? open
      : citationIsOpenable(c)
        ? () => {
            openCitationSource(c);
          }
        : undefined;
  return (
    <CitationChip
      icon={
        (KIND_ICON as Record<string, typeof FileText>)[c.sourceKind] ??
        FileText
      }
      label={citationLabel(c, index)}
      locator={locator}
      excerpt={c.excerpt}
      onOpen={onOpen}
      openLabel={place?.kind === "time" ? "Play from here" : openSourceLabel(c.url)}
    />
  );
}

export function SourceCitations({
  trust,
  className,
  onOpenSource,
  label = "Sources",
}: SourceCitationsProps) {
  const citations = trust?.citations ?? [];
  if (citations.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && (
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
      )}
      <div className="flex flex-wrap gap-1">
        {citations.map((c, i) => (
          <TrustCitationChip
            key={`${c.sourceId}-${i}`}
            citation={c}
            index={i}
            onOpenSource={onOpenSource}
          />
        ))}
      </div>
    </div>
  );
}
