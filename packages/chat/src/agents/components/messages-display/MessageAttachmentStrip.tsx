"use client";

import { cn } from "@ai-matrx/design-system";
import { FileResourceChip } from "@host/features/files/components/preview/FileResourceChip";
import { contextItemsListKey, useContextItemsTab } from "../context-items/contextItemsTab";
import { normalizeMessagePart } from "../context-items/normalize";
import { BlockHoverPreview } from "@host/features/agents/components/previews/BlockHoverPreview";
import { ResourceAttachmentTile } from "./user/ResourceAttachmentTile";
import type { MessagePart } from "@ai-matrx/agents/generated/stream-events";
import type { ContextDrawerItem } from "../context-items/types";

interface MessageAttachmentStripProps {
  conversationId: string;
  parts: MessagePart[];
  className?: string;
}

function AttachmentItem({
  item,
  pressed,
  onOpen,
}: {
  item: ContextDrawerItem;
  pressed: boolean;
  onOpen: () => void;
}) {
  const tile = item.refs.fileId ? (
    <FileResourceChip
      fileId={item.refs.fileId}
      fileHint={item.refs.fileHint}
      nameOverride={item.title}
      badge={item.caption}
      size="xs"
      onOpen={onOpen}
    />
  ) : (
    <ResourceAttachmentTile
      typeLabel={item.caption ?? item.typeLabel}
      title={item.title}
      icon={item.icon}
      themeKey={item.themeKey}
      pressed={pressed}
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
  const items = parts.flatMap((part, index) =>
    normalizeMessagePart(part, index, conversationId),
  );
  // The strip's attachments are ONE canvas tab; a chip shows its item there.
  const tab = useContextItemsTab(contextItemsListKey(conversationId, items));

  if (items.length === 0) return null;

  return (
    <>
      <div className={cn("flex flex-wrap gap-1.5", className)}>
        {items.map((item) => (
          <AttachmentItem
            key={item.id}
            item={item}
            pressed={tab.isShowing(item.id)}
            onOpen={() => tab.open(items, item.id)}
          />
        ))}
      </div>
    </>
  );
}
