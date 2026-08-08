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
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CitationPopoverBody } from "@/components/official/citation-chip/CitationChip";
import {
  citationSourceDisplayKind,
  type MessageCitationSource,
} from "@/features/agents/redux/execution-system/messages/message-citations";
import { useMessageCitationSources } from "./MessageCitationsContext";
import { citationSourceIsOpenable } from "./citation-open-request";
import { useOpenCitationSource } from "./useOpenCitationSource";

interface CitationMarkerInlineProps {
  "data-n"?: string | number;
}

const warnedOrphanMarkers = new Set<string>();

export function citationSourceLabel(source: MessageCitationSource): string {
  if (source.title) return source.title;
  if (source.url) {
    try {
      return new URL(source.url).hostname.replace(/^www\./, "");
    } catch {
      return source.url;
    }
  }
  return `Source ${source.number}`;
}

export function citationSourceLocator(
  source: MessageCitationSource,
): string | null {
  const parts: string[] = [];
  if (source.page != null) {
    parts.push(
      source.endPage != null && source.endPage !== source.page
        ? `Pages ${source.page}–${source.endPage}`
        : `Page ${source.page}`,
    );
  }
  if (source.url) {
    try {
      parts.push(new URL(source.url).hostname.replace(/^www\./, ""));
    } catch {
      // Non-URL string — skip the locator segment rather than render junk.
    }
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

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
          <button
            type="button"
            title={label}
            className={cn(
              "inline-flex h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-full border border-border",
              "bg-muted/60 px-1 text-[0.68rem] font-medium leading-none text-muted-foreground",
              "transition-colors hover:bg-accent hover:text-foreground",
            )}
          >
            {source.number}
          </button>
        </sup>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" sideOffset={6} className="w-80 p-3">
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

export default CitationMarkerInline;
