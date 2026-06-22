"use client";

/**
 * ContextSlotChip
 *
 * One context slot value on a user message — tile layout matching
 * ResourceAttachmentTile. Click → ContextSlotDetailSheet.
 */

import { useMemo, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectInstanceContextEntry } from "@/features/agents/redux/execution-system/instance-context/instance-context.selectors";
import type {
  ContextObjectType,
  ContextSlot,
} from "@/features/agents/types/agent-api-types";
import type { InstanceContextEntry } from "@/features/agents/types/instance.types";
import { CONTEXT_TYPE_ICON, FALLBACK_CONTEXT_ICON } from "./contextSlotIcons";
import { CONTEXT_TYPE_TILE_LABEL } from "./contextSlotTile.theme";
import { contextSlotEntryPreview } from "./contextSlotPreview";
import { ContextSlotDetailSheet } from "./ContextSlotDetailSheet";
import { ContextSlotTile } from "./ContextSlotTile";

interface ContextSlotChipProps {
  conversationId: string;
  agentId: string | null;
  entry: InstanceContextEntry;
  /** Matching slot definition if the key is declared on the agent. */
  slot?: ContextSlot;
  className?: string;
}

export function ContextSlotChip({
  conversationId,
  agentId,
  entry,
  slot,
  className,
}: ContextSlotChipProps) {
  const [open, setOpen] = useState(false);

  const type: ContextObjectType = slot?.type ?? entry.type;
  const Icon = CONTEXT_TYPE_ICON[type] ?? FALLBACK_CONTEXT_ICON;
  const typeLabel = CONTEXT_TYPE_TILE_LABEL[type] ?? "Context";

  const label = slot?.label?.trim() || entry.label?.trim() || entry.key;
  const liveEntry = useAppSelector(
    selectInstanceContextEntry(conversationId, entry.key),
  );
  const preview = useMemo(
    () => contextSlotEntryPreview(entry, type, liveEntry?.value),
    [entry, type, liveEntry?.value],
  );
  const tooltip = preview ? `${label} — ${preview}` : label;

  return (
    <>
      <ContextSlotTile
        typeLabel={typeLabel}
        title={label}
        icon={Icon}
        themeKey={type}
        tooltip={tooltip}
        onClick={() => setOpen(true)}
        className={className}
      />
      <ContextSlotDetailSheet
        open={open}
        onOpenChange={setOpen}
        conversationId={conversationId}
        agentId={agentId}
        contextKey={entry.key}
        snapshotValue={entry.value}
      />
    </>
  );
}
