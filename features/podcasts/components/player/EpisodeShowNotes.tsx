"use client";

// features/podcasts/components/player/EpisodeShowNotes.tsx
//
// Collapsible inline render of an episode's published show notes (pc_articles,
// kind 'show_notes'). Unlike the blog (its own public page), show notes live on
// the episode page itself.

import { useState } from "react";
import { ListChecks, ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import { cn } from "@/lib/utils";
import type { PcArticle } from "@/features/podcasts/types";

export function EpisodeShowNotes({
  article,
  className,
}: {
  article: PcArticle;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left">
          <ListChecks className="h-4 w-4 shrink-0 text-primary" />
          <span className="flex-1 text-sm font-medium text-foreground">Show notes</span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="prose prose-sm prose-neutral max-w-none border-t border-border px-3 py-3 dark:prose-invert">
            <BasicMarkdownContent content={article.content_markdown} showCopyButton={false} />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
