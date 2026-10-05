"use client";

/**
 * CitationMarkerInline — renders one inline `<matrxcite n="…" />` marker as a
 * small numbered superscript chip inside the paragraph flow (never breaking
 * the line box — same spacing invariants as MatrxVariableInline).
 *
 * Click/tap opens a popover with the cited excerpt, source title/locator and
 * an "Open source" action (canonical `useOpenCitationSource` → Source
 * Inspector at the exact page, or new tab for web sources). Source data
 * arrives via `MessageCitationsContext`; a marker whose number has no source
 * (context missing / stale) degrades to a plain non-interactive superscript
 * with a tooltip and warns once.
 */

import { ExternalLink, FileText, Globe, Quote } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { CitationPopoverBody } from "@/components/official/citation-chip/CitationChip";
import {
  citationSourceDisplayKind,
  type MessageCitationSource,
} from "@ai-matrx/chat/agents/redux/execution-system/messages/message-citations";
import { useMessageCitationSources } from "@ai-matrx/chat/agents/components/messages-display/citations/MessageCitationsContext";
import {
  citationSourceIsOpenable,
  citationSourceLabel,
  citationSourceLocator,
} from "@ai-matrx/chat/agents/components/messages-display/citations/citation-source";
import { useOpenCitationSource } from "./useOpenCitationSource";
import { Button } from "@ai-matrx/design-system/controls";

interface CitationMarkerInlineProps {
  "data-n"?: string | number;
}

const warnedOrphanMarkers = new Set<string>();


export function CitationMarkerInline(props: CitationMarkerInlineProps) {
  const sources = useMessageCitationSources();
  const openSource = useOpenCitationSource();

  const n = Number(props["data-n"]);
  if (!Number.isFinite(n) || n < 1) return null;

  const source = sources.find((s) => s.number === n) ?? null;

  if (!source) {
    const key = `orphan-${n}`;
    if (!warnedOrphanMarkers.has(key)) {
      warnedOrphanMarkers.add(key);
      console.warn(
        `[CitationMarkerInline] Marker n=${n} has no matching source in MessageCitationsContext — the marker and the index came from different walks.`,
      );
    }
    return (
      <sup
        className="mx-px inline align-super text-[0.7em] font-medium text-muted-foreground"
        title="Source details unavailable"
      >
        {n}
      </sup>
    );
  }

  const Icon =
    citationSourceDisplayKind(source) === "web" ? Globe : FileText;
  const label = citationSourceLabel(source);
  const locator = citationSourceLocator(source);
  const openable = citationSourceIsOpenable(source);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <sup className="mx-px inline align-super">
          <Button variant="outline" title={label}>
            {source.number}
          </Button>
        </sup>
      </PopoverTrigger>
      <PopoverContent sizing="content" align="start" side="top" sideOffset={6} className="p-3">
        <CitationPopoverBody
          icon={Icon}
          label={label}
          locator={locator}
          excerpt={source.citedText}
          clampExcerpt
          onOpen={openable ? () => openSource(source) : undefined}
          openLabel={source.fileId ? "Open source" : "Open web source"}
        />
      </PopoverContent>
    </Popover>
  );
}

export { citationSourceLabel, citationSourceLocator };

export default CitationMarkerInline;
