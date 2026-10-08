"use client";

import { useWarmOnMount } from "@ai-matrx/agents/react";
import type { WarmItem, WarmReason } from "@ai-matrx/agents/matrx";

/**
 * A page's warm-up as ONE line, usable from a server component:
 * `<WarmOnRoute items={[{ key: "agent", id: agentId }]} reason="route" />`.
 * Renders nothing. See `providers/WarmupHost.tsx`.
 */
export function WarmOnRoute({
  items,
  reason,
}: {
  items: readonly WarmItem[];
  reason: WarmReason;
}) {
  useWarmOnMount(items, reason);
  return null;
}
