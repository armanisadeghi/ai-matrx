"use client";

/**
 * AgentStatusIndicator
 *
 * Renders the server's user_message from status/interstitial events.
 * Shown during interstitial phases between tool calls.
 */

import { ShimmerText } from "@/components/loaders/ShimmerText";

interface AgentStatusIndicatorProps {
  message: string | null;
  compact?: boolean;
}

export function AgentStatusIndicator({
  message,
  compact = false,
}: AgentStatusIndicatorProps) {
  const displayMessage = message ?? "Processing...";

  return (
    <ShimmerText
      text={displayMessage}
      className={compact ? "text-[11px]" : "text-sm"}
    />
  );
}
