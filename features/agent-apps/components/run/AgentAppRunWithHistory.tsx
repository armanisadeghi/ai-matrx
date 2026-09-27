"use client";

/**
 * AgentAppRunWithHistory — layout shell for /agent-apps/[id]/run.
 *
 * Run-page body for the management shell. Run history lives in the canonical
 * Agent Run History window and is opened from AgentAppHeader; this body owns
 * no duplicate or floating header controls.
 *
 * The body carries the page's ONE right-click menu: the app is the record
 * (Attach To / Share act on it), content self-resolves from what the app
 * rendered, and the scope is the same live workspace scope the provider emits.
 */

import { usePathname } from "next/navigation";
import { useAppStore } from "@/lib/redux/hooks";
import { AgentAppRenderer } from "@/features/agent-apps/components/AgentAppRenderer";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { AGENT_APPS_SURFACE_NAME } from "@/features/surfaces/manifests/agent-apps.manifest";
import { buildAgentAppsWorkspaceScope } from "@/features/agent-apps/route/AgentAppSurfaceRuntime";
import type { AgentApp } from "@/features/agent-apps/types";

interface AgentAppRunWithHistoryProps {
  app: AgentApp;
  slug: string;
}

export function AgentAppRunWithHistory({
  app,
  slug,
}: AgentAppRunWithHistoryProps) {
  const store = useAppStore();
  const pathname = usePathname();
  return (
    <div className="h-full flex flex-row">
      <div
        className="flex-1 min-w-0 relative flex flex-col"
        style={{ paddingTop: "var(--shell-header-h)" }}
      >
        <NonEditableContextMenu
          sourceFeature="agent-app"
          surfaceName={AGENT_APPS_SURFACE_NAME}
          menuVersion={1}
          getApplicationScope={() =>
            buildAgentAppsWorkspaceScope(store.getState(), pathname)
          }
          contentSource={{ type: "raw" }}
          entity={{ type: "app", id: app.id, title: app.name, resourceType: "app" }}
        >
          <div className="relative min-h-0 flex-1 h-full">
            <AgentAppRenderer app={app} slug={slug} />
          </div>
        </NonEditableContextMenu>
      </div>
    </div>
  );
}
