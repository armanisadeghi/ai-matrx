"use client";

/**
 * ContextSlotChip
 *
 * Tiny pill representing one context slot value attached to a request.
 * Click → opens ContextSlotDetailSheet showing the full value + slot metadata.
 *
 * Visually matches the resource attachment chips on user messages
 * (AgentUserMessage), but driven by the context dict, not content blocks.
 */

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type {
  ContextObjectType,
  ContextSlot,
} from "@/features/agents/types/agent-api-types";
import type { InstanceContextEntry } from "@/features/agents/types/instance.types";
import {
  CONTEXT_TYPE_ICON,
  FALLBACK_CONTEXT_ICON,
  CONTEXT_TYPE_CHIP_CLASS,
} from "./contextSlotIcons";
import { contextSlotValuePreview } from "./contextSlotPreview";
import { ContextSlotDetailSheet } from "./ContextSlotDetailSheet";

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
  const chipClass =
    CONTEXT_TYPE_CHIP_CLASS[type] ?? CONTEXT_TYPE_CHIP_CLASS.text;

  const label = slot?.label?.trim() || entry.label?.trim() || entry.key;
  const preview = useMemo(
    () => contextSlotValuePreview(entry.value, type),
    [entry.value, type],
  );
  const tooltip = preview ? `${entry.key} — ${preview}` : entry.key;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={tooltip}
        className={cn(
          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium leading-none cursor-pointer transition-colors hover:brightness-95 active:brightness-90 max-w-[200px]",
          chipClass,
          className,
        )}
      >
        <Icon className="w-2.5 h-2.5 flex-shrink-0" />
        <span className="truncate">{label}</span>
        {preview && (
          <span className="opacity-60 truncate">
            <span className="opacity-50">·</span> {preview}
          </span>
        )}
      </button>
      <ContextSlotDetailSheet
        open={open}
        onOpenChange={setOpen}
        conversationId={conversationId}
        agentId={agentId}
        contextKey={entry.key}
      />
    </>
  );
}
