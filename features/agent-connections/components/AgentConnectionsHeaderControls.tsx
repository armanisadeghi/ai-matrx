"use client";

import { PanelLeftTapButton } from "@/components/icons/tap-buttons";
import { usePanelControls } from "@/app/(dev)/demos/resizables/_lib/PanelControlProvider";

/**
 * Header controls for the /agent-connections route family. Lives inside the
 * shell glass header via <PageHeader/>. Toggles the collapsible sidebar
 * column through the shared <PanelControlProvider/> (same pattern as
 * TasksHeaderControls) and carries the route's identity — the sidebar list
 * is the real nav, so this is just a toggle + a small title, no title/
 * description block.
 */
export function AgentConnectionsHeaderControls() {
  const { toggle, isCollapsed } = usePanelControls();
  const sidebarCollapsed = isCollapsed("sidebar");

  return (
    <div className="flex items-center w-full min-w-0 gap-0 p-0">
      <PanelLeftTapButton
        onClick={() => toggle("sidebar")}
        variant={sidebarCollapsed ? "transparent" : "glass"}
        ariaLabel={sidebarCollapsed ? "Show sections" : "Hide sections"}
        tooltip={sidebarCollapsed ? "Show sections" : "Hide sections"}
      />
      <h1 className="ml-2 text-sm font-medium text-foreground truncate">
        Agent Connections
      </h1>
    </div>
  );
}

export default AgentConnectionsHeaderControls;
