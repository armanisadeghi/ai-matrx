"use client";

/**
 * AgentAppRunWithHistory — layout shell for /agent-apps/[id]/run.
 *
 * Couples the HistorySidebar with the AgentAppRenderer. The sidebar
 * targets the same surfaceKey the renderer's hook uses, so clicking a
 * past run flips focus and the active shell rehydrates the
 * conversation. The chat shell already contains its own internal
 * history sidebar via AgentRunner; we still show this one because it's
 * scoped to the app, not the agent across all surfaces.
 *
 * Mobile collapses the sidebar by default. This is the run-page-only
 * variant — embeds (`?embed=widget`) skip this entirely.
 */

import { useState } from "react";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgentAppRenderer } from "@/features/agent-apps/components/AgentAppRenderer";
import { HistorySidebar } from "./HistorySidebar";
import type { AgentApp } from "@/features/agent-apps/types";

interface AgentAppRunWithHistoryProps {
  app: AgentApp;
  slug: string;
}

export function AgentAppRunWithHistory({
  app,
  slug,
}: AgentAppRunWithHistoryProps) {
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const surfaceKey = `agent-app:${app.id}`;

  return (
    <div className="h-full flex flex-row">
      <div className="hidden lg:block">
        <HistorySidebar
          agentId={app.agent_id}
          versionFilter={null}
          surfaceKey={surfaceKey}
          hidden={!sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      </div>
      <div className="flex-1 min-w-0 relative">
        {!sidebarOpen && (
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:flex absolute top-2 left-2 z-10 h-7 w-7"
            onClick={() => setSidebarOpen(true)}
            title="Show history"
          >
            <History className="w-3.5 h-3.5" />
          </Button>
        )}
        <AgentAppRenderer app={app} slug={slug} />
      </div>
    </div>
  );
}
