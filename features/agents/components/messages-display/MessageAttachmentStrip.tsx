"use client";

import { cn } from "@/lib/utils";
import { FileResourceChip } from "@/features/files/components/preview/FileResourceChip";
import { ContextItemDrawer } from "@/features/agents/components/context-items/ContextItemDrawer";
import { useContextItemDrawer } from "@/features/agents/components/context-items/useContextItemDrawer";
import { normalizeMessagePart } from "@/features/agents/components/context-items/normalize";
import { BlockHoverPreview } from "@/features/agents/components/previews/BlockHoverPreview";
import { ResourceAttachmentTile } from "./user/ResourceAttachmentTile";
import type { MessagePart } from "@/types/python-generated/stream-events";
import type { ContextDrawerItem } from "@/features/agents/components/context-items/types";

interface MessageAttachmentStripProps {
  conversationId: string;
  parts: MessagePart[];
  className?: string;
}

function AttachmentItem({
  item,
  onOpen,
}: {
  item: ContextDrawerItem;
  onOpen: () => void;
}) {
  const tile = item.refs.fileId ? (
    <FileResourceChip fileId={item.refs.fileId} size="xs" onOpen={onOpen} />
  ) : (
    <ResourceAttachmentTile
      typeLabel={item.typeLabel}
      title={item.title}
      icon={item.icon}
      themeKey={item.themeKey}
      onClick={onOpen}
    />
  );

  return (
    <BlockHoverPreview item={item} side="top" align="start">
      {tile}
    </BlockHoverPreview>
  );
}

/** One attachment renderer for user turns and assistant turns. */
export function MessageAttachmentStrip({
  conversationId,
  parts,
  className,
}: MessageAttachmentStripProps) {
  const drawer = useContextItemDrawer();
  const items = parts.flatMap((part, index) =>
    normalizeMessagePart(part, index, conversationId),
  );

  if (items.length === 0) return null;

  return (
    <>
      <div className={cn("flex flex-wrap gap-1.5", className)}>
        {items.map((item, index) => (
          <AttachmentItem
            key={item.id}
            item={item}
            onOpen={() => drawer.openAt(items, index)}
          />
        ))}
      </div>
      <ContextItemDrawer controller={drawer} />
    </>
  );
}
