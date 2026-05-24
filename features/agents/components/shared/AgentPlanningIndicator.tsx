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
}

export function AgentPlanningIndicator({
  compact = false,
}: AgentPlanningIndicatorProps) {
  return (
    <ShimmerText
      text="Planning..."
      className={compact ? "text-[11px]" : "text-sm"}
    />
  );
}
