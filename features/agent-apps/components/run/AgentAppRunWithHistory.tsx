"use client";

/**
 * AgentAppRunWithHistory — layout shell for /agent-apps/[id]/run.
 *
 * Run-page body for the management shell. Run history lives in the canonical
 * Agent Run History window and is opened from AgentAppHeader; this body owns
 * no duplicate or floating header controls.
 */

import { AgentAppRenderer } from "@/features/agent-apps/components/AgentAppRenderer";
import type { AgentApp } from "@/features/agent-apps/types";

interface AgentAppRunWithHistoryProps {
  app: AgentApp;
  slug: string;
}

export function AgentAppRunWithHistory({
  app,
  slug,
}: AgentAppRunWithHistoryProps) {
  return (
    <div className="h-full flex flex-row">
      <div
        className="flex-1 min-w-0 relative flex flex-col"
        style={{ paddingTop: "var(--shell-header-h)" }}
      >
        <div className="relative min-h-0 flex-1">
          <AgentAppRenderer app={app} slug={slug} />
        </div>
      </div>
    </div>
  );
}
