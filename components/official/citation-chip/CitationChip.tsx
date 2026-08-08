"use client";

/**
 * CitationChip — THE shared presentational citation-chip primitive.
 *
 * One tappable source chip + its excerpt popover (number badge / icon /
 * title / locator / verbatim quote / open action). Every citation chip UI
 * renders through this:
 *   - chat Sources footer (features/agents/components/messages-display/
 *     citations/MessageSourcesRow.tsx — MessageCitationSource),
 *   - education trust chips (features/education/trust/components/
 *     SourceCitations.tsx — TrustEnvelope SourceCitation),
 *   - the popover body alone backs the inline superscript marker
 *     (components/mardown-display/chat-markdown/citations/
 *     CitationMarkerInline.tsx).
 *
 * BOUNDARY: deliberately pure-presentational and citation-shape-agnostic —
 * it knows NOTHING of MessageCitationSource, TrustEnvelope, or openers.
 * Consumers map their citation shape to these props and pass `onOpen`
 * pre-wired to their canonical opener (useOpenCitationSource /
 * openCitationSource). That keeps chat free of TrustEnvelope coupling and
 * education free of the chat execution-system — the ONE chip stays shared.
 *
 * Styling knobs (chipClassName / clampExcerpt / chipSuffix / number) exist
 * so each consumer keeps its established visual language; `cn` uses
 * tailwind-merge, so a consumer's max-w/gap override wins over the base.
 */

import type { LucideIcon } from "lucide-react";
import { ExternalLink, Quote } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface CitationPopoverBodyProps {
  /** Icon representing the source (FileText for documents, Globe for web…). */
  icon: LucideIcon;
  /** Source title / domain / fallback label. */
  label: string;
  /** Secondary locator line under the title (e.g. "Page 3 · example.com"). */
  locator?: string | null;
  /** Verbatim cited excerpt, rendered as a blockquote. */
  excerpt?: string | null;
  /** Clamp the excerpt to 6 lines (long chat quotes). Default false. */
  clampExcerpt?: boolean;
  /** Open-the-real-source action; the button renders only when provided. */
  onOpen?: () => void;
  /** Label for the open action (e.g. "Open source", "Open web source"). */
  openLabel?: string;
}

/**
 * The popover interior: icon + title + locator, excerpt blockquote, open
 * action. Exported so non-chip triggers (the inline superscript marker)
 * share the identical body.
 */
export function CitationPopoverBody({
  icon: Icon,
  label,
  locator,
  excerpt,
  clampExcerpt = false,
  onOpen,
  openLabel = "Open source",
}: CitationPopoverBodyProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <Icon
          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {label}
          </p>
          {locator && (
            <p className="text-xs text-muted-foreground">{locator}</p>
          )}
        </div>
      </div>
      {excerpt && (
        <blockquote className="flex gap-2 rounded-md bg-muted/60 p-2 text-xs italic text-muted-foreground">
          <Quote className="h-3 w-3 shrink-0" aria-hidden />
          <span className={cn("not-italic", clampExcerpt && "line-clamp-6")}>
            {excerpt}
          </span>
        </blockquote>
      )}
      {onOpen && (
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-1 self-start text-xs font-medium text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" aria-hidden />
          {openLabel}
        </button>
      )}
    </div>
  );
}

export interface CitationChipProps extends CitationPopoverBodyProps {
  /** 1-based display number badge on the chip. Omit for unnumbered chips. */
  number?: number;
  /** Trailing inline suffix on the chip (e.g. "p.7"). */
  chipSuffix?: string | null;
  /** Native `title` attribute for the chip button. */
  chipTitle?: string;
  /** Appended to the chip button's classes (tailwind-merge: overrides win). */
  chipClassName?: string;
}

export function CitationChip({
  number,
  chipSuffix,
  chipTitle,
  chipClassName,
  ...body
}: CitationChipProps) {
  const { icon: Icon, label } = body;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={chipTitle}
          className={cn(
            "inline-flex max-w-[16rem] items-center gap-1 rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-xs text-foreground transition-colors hover:bg-accent",
            chipClassName,
          )}
        >
          {number != null && (
            <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-muted px-1 text-[0.65rem] font-medium leading-none text-muted-foreground">
              {number}
            </span>
          )}
          <Icon className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{label}</span>
          {chipSuffix && (
            <span className="shrink-0 text-muted-foreground">{chipSuffix}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <CitationPopoverBody {...body} />
      </PopoverContent>
    </Popover>
  );
}

export default CitationChip;
