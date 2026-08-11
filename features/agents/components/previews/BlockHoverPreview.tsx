"use client";

/** Hover preview over the canonical, already-validated attachment item. */

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { NotePreviewContent } from "./NoteHoverPreview";
import { TaskPreviewContent } from "./TaskHoverPreview";
import { WebpagePreviewContent } from "./WebpageHoverPreview";
import { DataRefPreviewContent } from "./DataRefHoverPreview";
import {
  webpageTitle,
  webpageUrl,
} from "@/features/resource-manager/webpage/webpage-snapshot";
import type { ContextDrawerItem } from "@/features/agents/components/context-items/types";

function PreviewBody({ item }: { item: ContextDrawerItem }) {
  const noteId = item.refs.noteIds?.[0];
  if (noteId) return <NotePreviewContent noteId={noteId} />;

  const taskId = item.refs.taskIds?.[0];
  if (taskId) return <TaskPreviewContent taskId={taskId} />;

  const webpage = item.refs.webpages?.[0];
  if (webpage) {
    return (
      <WebpagePreviewContent
        url={webpageUrl(webpage)}
        title={webpageTitle(webpage)}
        snippet={typeof webpage === "string" ? null : webpage.textContent}
      />
    );
  }

  const dataRef = item.refs.dataRefs?.[0];
  if (dataRef) return <DataRefPreviewContent dataRef={dataRef} />;

  return null;
}

function hasPreview(item: ContextDrawerItem): boolean {
  return !!(
    item.refs.noteIds?.length ||
    item.refs.taskIds?.length ||
    item.refs.webpages?.length ||
    item.refs.dataRefs?.length
  );
}

interface BlockHoverPreviewProps {
  item: ContextDrawerItem;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  openDelay?: number;
  closeDelay?: number;
  className?: string;
}

export function BlockHoverPreview({
  item,
  children,
  side = "top",
  align = "start",
  openDelay = 250,
  closeDelay = 140,
  className,
}: BlockHoverPreviewProps) {
  if (!hasPreview(item)) return <>{children}</>;

  return (
    <HoverCard openDelay={openDelay} closeDelay={closeDelay}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side={side}
        align={align}
        sideOffset={8}
        className={cn(
          "w-80 border border-border bg-card p-3 shadow-lg",
          className,
        )}
      >
        <PreviewBody item={item} />
      </HoverCardContent>
    </HoverCard>
  );
}
