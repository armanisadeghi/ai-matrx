"use client";

import { PanelLeftTapButton } from "@/components/icons/tap-buttons";
import { usePanelControls } from "@/features/resizable-panels/PanelControlProvider";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Header controls for the /user-settings route family. Lives inside the
 * shell glass header via <PageHeader/>. Toggles the collapsible sidebar
 * column through the shared <PanelControlProvider/> (same pattern as
 * AgentConnectionsHeaderControls) and carries the route's identity — the
 * sidebar tree is the real nav, so this is just a toggle + a small title,
 * no title/description block.
 *
 * On mobile the resizable sidebar panel isn't mounted at all (see
 * `MobilePanelShell` in `SettingsRouteShell`) — the sections list moves into
 * a bottom drawer with its own header tap target, so the desktop-only panel
 * toggle is hidden there to keep the phone header to one thing.
 */
export function SettingsHeaderControls() {
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
        Settings
      </h1>
    </div>
  );
}

export default SettingsHeaderControls;
