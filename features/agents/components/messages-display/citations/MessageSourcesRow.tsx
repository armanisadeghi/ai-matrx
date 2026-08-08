"use client";

/**
 * MessageSourcesRow — the per-message "Sources" footer under an assistant
 * turn. Numbered chips (title/domain + page) for every deduped citation
 * source; each chip opens a popover with the cited excerpt and an "Open
 * source" action via the canonical `useOpenCitationSource` (Source Inspector
 * at the exact PDF page for our files, new tab for web). Renders nothing
 * when the message has no citation sources.
 *
 * Visual language adapted from the education trust `SourceCitations` chips —
 * deliberately NOT importing TrustEnvelope; the input is the chat-native
 * `MessageCitationSource` list built by
 * `features/agents/redux/execution-system/messages/message-citations.ts`.
 */

import { ExternalLink, FileText, Globe, Quote } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  citationSourceDisplayKind,
  type MessageCitationSource,
} from "@/features/agents/redux/execution-system/messages/message-citations";
import {
  citationSourceLabel,
  citationSourceLocator,
} from "@/components/mardown-display/chat-markdown/citations/CitationMarkerInline";
import { citationSourceIsOpenable } from "@/components/mardown-display/chat-markdown/citations/citation-open-request";
import { useOpenCitationSource } from "@/components/mardown-display/chat-markdown/citations/useOpenCitationSource";

export interface MessageSourcesRowProps {
  sources: MessageCitationSource[];
  className?: string;
}

export function MessageSourcesRow({
  sources,
  className,
}: MessageSourcesRowProps) {
  const openSource = useOpenCitationSource();

  if (sources.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-xs font-medium text-muted-foreground">Sources</span>
      <div className="flex flex-wrap gap-1">
        {sources.map((source) => {
          const Icon =
            citationSourceDisplayKind(source) === "web" ? Globe : FileText;
          const label = citationSourceLabel(source);
          const locator = citationSourceLocator(source);
          const openable = citationSourceIsOpenable(source);
          return (
            <Popover key={source.number}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  title={openable ? label : `${label} — source not linkable`}
                  className="inline-flex max-w-[18rem] items-center gap-1.5 rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-xs text-foreground transition-colors hover:bg-accent"
                >
                  <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-muted px-1 text-[0.65rem] font-medium leading-none text-muted-foreground">
                    {source.number}
                  </span>
                  <Icon
                    className="h-3 w-3 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <span className="truncate">{label}</span>
                  {source.page != null && (
                    <span className="shrink-0 text-muted-foreground">
                      p.{source.page}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 p-3">
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
                        <p className="text-xs text-muted-foreground">
                          {locator}
                        </p>
                      )}
                    </div>
                  </div>
                  {source.citedText && (
                    <blockquote className="flex gap-2 rounded-md bg-muted/60 p-2 text-xs italic text-muted-foreground">
                      <Quote className="h-3 w-3 shrink-0" aria-hidden />
                      <span className="not-italic line-clamp-6">
                        {source.citedText}
                      </span>
                    </blockquote>
                  )}
                  {openable && (
                    <button
                      type="button"
                      onClick={() => openSource(source)}
                      className="inline-flex items-center gap-1 self-start text-xs font-medium text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" aria-hidden />
                      {source.fileId ? "Open source" : "Open web source"}
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

export default MessageSourcesRow;
