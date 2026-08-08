"use client";

/**
 * MessageSourcesRow — the per-message "Sources" footer under an assistant
 * turn. Numbered chips (title/domain + page) for every deduped citation
 * source; each chip opens a popover with the cited excerpt and an "Open
 * source" action via the canonical `useOpenCitationSource` (Source Inspector
 * at the exact PDF page for our files, new tab for web). Renders nothing
 * when the message has no citation sources.
 *
 * Chips render through the ONE shared presentational primitive
 * (`CitationChip`, components/official/citation-chip/) — this file only maps
 * the chat-native `MessageCitationSource` (built by
 * features/agents/redux/execution-system/messages/message-citations.ts) to
 * its props and wires the canonical opener.
 */

import { FileText, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import CitationChip from "@/components/official/citation-chip/CitationChip";
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
          const label = citationSourceLabel(source);
          const openable = citationSourceIsOpenable(source);
          return (
            <CitationChip
              key={source.number}
              number={source.number}
              icon={
                citationSourceDisplayKind(source) === "web" ? Globe : FileText
              }
              label={label}
              locator={citationSourceLocator(source)}
              excerpt={source.citedText}
              clampExcerpt
              chipSuffix={source.page != null ? `p.${source.page}` : null}
              chipTitle={openable ? label : `${label} — source not linkable`}
              chipClassName="max-w-[18rem] gap-1.5"
              onOpen={openable ? () => openSource(source) : undefined}
              openLabel={source.fileId ? "Open source" : "Open web source"}
            />
          );
        })}
      </div>
    </div>
  );
}

export default MessageSourcesRow;
