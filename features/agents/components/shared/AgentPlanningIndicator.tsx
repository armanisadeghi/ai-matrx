"use client";

/**
 * AgentPlanningIndicator
 *
 * Shown between submit and first server event — covers the window where
 * the client is waiting for the server to accept the request, route it,
 * and begin processing.
 */

import { ShimmerText } from "@/components/loaders/ShimmerText";

interface AgentPlanningIndicatorProps {
  compact?: boolean;
  /** Override the label. Defaults to "Planning..."; pass "Reasoning..." while
   *  the model is in its reasoning phase (server `reasoning` status event). */
  label?: string;
}

export function AgentPlanningIndicator({
  compact = false,
  label = "Planning...",
}: AgentPlanningIndicatorProps) {
  return (
    <ShimmerText
      text={label}
      className={compact ? "text-[11px]" : "text-sm"}
    />
  );
}
