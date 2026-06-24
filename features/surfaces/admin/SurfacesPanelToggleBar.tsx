"use client";

import {
  PanelLeftTapButton,
  RobotTapButton,
  ViewTapButton,
  TestTubeTapButton,
} from "@/components/icons/tap-buttons";
import { usePanelControls } from "@/app/(dev)/demos/resizables/_lib/PanelControlProvider";

/**
 * Slim panel-toggle strip for the surfaces admin shell.
 *
 * The common agent navigation (selector, mode tabs, save/options) now lives in
 * the shared `AgentHeader` injected into the page header slot — see
 * `SurfacesAdminShell`. This bar carries ONLY the surface-specific control that
 * header can't: collapse/expand the four side columns of the resizable layout.
 *
 * The five panels are: surfaces · agent · binding · surface-details ·
 * playground. The center (binding) is the non-collapsible filler — no toggle
 * for it, matching the mac-mail reference layout.
 */
export function SurfacesPanelToggleBar() {
  const { toggle, isCollapsed } = usePanelControls();

  const surfacesCollapsed = isCollapsed("surfaces-list");
  const agentCollapsed = isCollapsed("agent");
  const detailsCollapsed = isCollapsed("surface-details");
  const playgroundCollapsed = isCollapsed("playground");

  return (
    <div className="flex items-center gap-0 h-8 px-1 border-b border-border bg-card shrink-0">
      <span className="text-[0.6875rem] font-medium text-muted-foreground px-1.5 hidden sm:inline">
        Panels
      </span>
      <PanelLeftTapButton
        onClick={() => toggle("surfaces-list")}
        variant={surfacesCollapsed ? "transparent" : "glass"}
        ariaLabel={surfacesCollapsed ? "Show surfaces" : "Hide surfaces"}
        tooltip={surfacesCollapsed ? "Show surfaces" : "Hide surfaces"}
      />
      <RobotTapButton
        onClick={() => toggle("agent")}
        variant={agentCollapsed ? "transparent" : "glass"}
        ariaLabel={agentCollapsed ? "Show agent" : "Hide agent"}
        tooltip={agentCollapsed ? "Show agent" : "Hide agent"}
      />
      <div className="flex-1" />
      <ViewTapButton
        onClick={() => toggle("surface-details")}
        variant={detailsCollapsed ? "transparent" : "glass"}
        ariaLabel={
          detailsCollapsed ? "Show surface details" : "Hide surface details"
        }
        tooltip={
          detailsCollapsed ? "Show surface details" : "Hide surface details"
        }
      />
      <TestTubeTapButton
        onClick={() => toggle("playground")}
        variant={playgroundCollapsed ? "transparent" : "glass"}
        ariaLabel={playgroundCollapsed ? "Show playground" : "Hide playground"}
        tooltip={playgroundCollapsed ? "Show playground" : "Hide playground"}
      />
    </div>
  );
}
