"use client";

import { PanelLeftTapButton } from "@/components/icons/tap-buttons";
import { usePanelControls } from "@/features/resizable-panels/PanelControlProvider";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Header controls for the /agent-connections route family. Lives inside the
 * shell glass header via <PageHeader/>. Toggles the collapsible sidebar
 * column through the shared <PanelControlProvider/> (same pattern as
 * TasksHeaderControls) and carries the route's identity — the sidebar list
 * is the real nav, so this is just a toggle + a small title, no title/
 * description block.
 *
 * On mobile the resizable sidebar panel isn't mounted at all — `MobilePanelShell`
 * (`AgentConnectionsRouteShell.tsx`) renders the section list as its own bottom
 * drawer with its own header tap target — so the desktop-only toggle is hidden
 * to avoid a dead control that no-ops against an unmounted panel.
 */
export function AgentConnectionsHeaderControls() {
  const { toggle, isCollapsed } = usePanelControls();
  const sidebarCollapsed = isCollapsed("sidebar");
  const isMobile = useIsMobile();

  return (
    <div className="flex items-center w-full min-w-0 gap-0 p-0">
      {!isMobile && (
        <PanelLeftTapButton
          onClick={() => toggle("sidebar")}
          variant={sidebarCollapsed ? "transparent" : "glass"}
          ariaLabel={sidebarCollapsed ? "Show sections" : "Hide sections"}
          tooltip={sidebarCollapsed ? "Show sections" : "Hide sections"}
        />
      )}
      <h1 className={`text-sm font-medium text-foreground truncate ${isMobile ? "" : "ml-2"}`}>
        Agent Connections
      </h1>
    </div>
  );
}

export default AgentConnectionsHeaderControls;
