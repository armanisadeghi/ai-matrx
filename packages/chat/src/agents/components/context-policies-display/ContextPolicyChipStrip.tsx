"use client";

/**
 * ContextPolicyChipStrip
 *
 * The context a SENT message carried, from that message's own snapshot only
 * (`model_context.items` / `metadata.context_snapshot`). Used for turns with
 * no server receipt; a turn with one shows `MessageContextReceipt` instead.
 * Never reads live conversation context — a sent bubble showing today's
 * values was the "context indicator is lying" defect.
 * One entry → single chip. Multiple → collapsed "Context Items (N)" popover.
 */

import { useMemo } from "react";
import { useAppSelector } from "../../../store/hooks";
import type { ChatRootState } from "../../../store/root-state";
import { selectAgentContextPolicies } from "../../redux/agent-definition/selectors";
import type { ContextPolicy } from "../../types/agent-api-types";
import type { InstanceContextEntry } from "../../types/instance.types";
import { ContextPolicyChip } from "./ContextPolicyChip";
import { ContextPolicyItemsPopover } from "./ContextPolicyItemsPopover";
import { cn } from "@ai-matrx/design-system";

interface ContextPolicyChipStripProps {
  conversationId: string;
  agentId: string | null;
  className?: string;
  /** Show the small "Context:" label inline. Defaults to false. */
  showLabel?: boolean;
  /** The frozen per-turn snapshot — rendered exactly, never live values. */
  entries: InstanceContextEntry[];
}

export function ContextPolicyChipStrip({
  conversationId,
  agentId,
  className,
  showLabel = false,
  entries,
}: ContextPolicyChipStripProps) {
  const policies = useAppSelector((state: ChatRootState): ContextPolicy[] | undefined =>
    agentId ? selectAgentContextPolicies(state, agentId) : undefined,
  );
  const policyByKey = useMemo(() => {
    const map = new Map<string, ContextPolicy>();
    for (const s of policies ?? []) map.set(s.key, s);
    return map;
  }, [policies]);

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
      Context policies
    </span>
  ) : null;

  if (visibleEntries.length === 1) {
    const entry = visibleEntries[0];
    return (
      <div className={cn("flex flex-wrap gap-1.5 items-center", className)}>
        {labelEl}
        <ContextPolicyChip
          conversationId={conversationId}
          agentId={agentId}
          entry={entry}
          policy={policyByKey.get(entry.key)}
        />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap gap-1.5 items-center", className)}>
      {labelEl}
      <ContextPolicyItemsPopover
        conversationId={conversationId}
        agentId={agentId}
        entries={visibleEntries}
        policyByKey={policyByKey}
      />
    </div>
  );
}
