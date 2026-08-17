"use client";

/**
 * ContextPolicyChipStrip
 *
 * Renders context policy chips for a conversation's live context entries.
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
import { selectAgentContextPolicies } from "@/features/agents/redux/agent-definition/selectors";
import type { ContextPolicy } from "@/features/agents/types/agent-api-types";
import type { InstanceContextEntry } from "@/features/agents/types/instance.types";
import { ContextPolicyChip } from "./ContextPolicyChip";
import { ContextPolicyItemsPopover } from "./ContextPolicyItemsPopover";
import { cn } from "@/lib/utils";

interface ContextPolicyChipStripProps {
  conversationId: string;
  agentId: string | null;
  className?: string;
  /** Show the small "Context:" label inline. Defaults to false. */
  showLabel?: boolean;
  /**
   * Explicit, frozen entries to render (a per-turn snapshot). When provided,
   * the strip renders EXACTLY these and never touches the live
   * conversation-level context. Pass this on historical message bubbles so
   * each turn shows the context it actually carried — not the current one.
   * Omit it only for "live / next request" surfaces (e.g. above the input).
   */
  entries?: InstanceContextEntry[];
}

export function ContextPolicyChipStrip({
  conversationId,
  agentId,
  className,
  showLabel = false,
  entries: entriesProp,
}: ContextPolicyChipStripProps) {
  const selectEntries = useMemo(
    () => selectInstanceContextEntries(conversationId),
    [conversationId],
  );
  const liveEntries = useAppSelector(selectEntries);
  // Snapshot wins when provided (even an empty array means "this turn carried
  // no context" — honest). Only fall back to live state when no snapshot
  // is passed at all (the live "next request" surfaces).
  const entries = entriesProp ?? liveEntries;

  const policies = useAppSelector((state: RootState): ContextPolicy[] | undefined =>
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
      Context
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
