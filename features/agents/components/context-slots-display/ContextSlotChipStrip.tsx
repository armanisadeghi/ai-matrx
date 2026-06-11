"use client";

/**
 * ContextSlotChipStrip
 *
 * Renders context slot chips for a conversation's live context entries.
 * One entry → single chip. Multiple → collapsed "Context Items (N)" popover.
 *
 * Use this anywhere you want to show "what context is currently attached to
 * the next request" (e.g. above the chat input) or "what context this turn
 * carried" once a per-message snapshot lands on message metadata.
 */

import { useMemo } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { selectInstanceContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.selectors";
import { selectAgentContextSlots } from "@/features/agents/redux/agent-definition/selectors";
import type { ContextSlot } from "@/features/agents/types/agent-api-types";
import { ContextSlotChip } from "./ContextSlotChip";
import { ContextSlotItemsPopover } from "./ContextSlotItemsPopover";
import { cn } from "@/lib/utils";

interface ContextSlotChipStripProps {
  conversationId: string;
  agentId: string | null;
  className?: string;
  /** Show the small "Context:" label inline. Defaults to false. */
  showLabel?: boolean;
}

export function ContextSlotChipStrip({
  conversationId,
  agentId,
  className,
  showLabel = false,
}: ContextSlotChipStripProps) {
  const selectEntries = useMemo(
    () => selectInstanceContextEntries(conversationId),
    [conversationId],
  );
  const entries = useAppSelector(selectEntries);

  const slots = useAppSelector((state: RootState): ContextSlot[] | undefined =>
    agentId ? selectAgentContextSlots(state, agentId) : undefined,
  );
  const slotByKey = useMemo(() => {
    const map = new Map<string, ContextSlot>();
    for (const s of slots ?? []) map.set(s.key, s);
    return map;
  }, [slots]);

  // Only render chips for entries that actually have a value.
  const visibleEntries = useMemo(
    () =>
      entries.filter((e) => {
        const v = e.value;
        if (v === undefined || v === null) return false;
        if (typeof v === "string" && v.trim() === "") return false;
        if (typeof v === "object" && Object.keys(v).length === 0) return false;
        return true;
      }),
    [entries],
  );

  if (visibleEntries.length === 0) return null;

  const labelEl = showLabel ? (
    <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
      Context
    </span>
  ) : null;

  if (visibleEntries.length === 1) {
    const entry = visibleEntries[0];
    return (
      <div className={cn("flex flex-wrap gap-1 items-center", className)}>
        {labelEl}
        <ContextSlotChip
          conversationId={conversationId}
          agentId={agentId}
          entry={entry}
          slot={slotByKey.get(entry.key)}
        />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap gap-1 items-center", className)}>
      {labelEl}
      <ContextSlotItemsPopover
        conversationId={conversationId}
        agentId={agentId}
        entries={visibleEntries}
        slotByKey={slotByKey}
      />
    </div>
  );
}
