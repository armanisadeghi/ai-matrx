"use client";

import {
  ChevronLeftTapButton,
  PanelLeftTapButton,
  RobotTapButton,
  ViewTapButton,
  TestTubeTapButton,
} from "@/components/icons/tap-buttons";
import { usePanelControls } from "@/app/(dev)/demos/resizables/_lib/PanelControlProvider";

/**
 * Header controls for the surfaces admin shell. Lives inside `<PageHeader>`
 * and reads panel state through the cross-portal `PanelControlProvider`.
 *
 * The five panels are: surfaces · agent · binding · surface-details ·
 * playground. The center (binding) is the non-collapsible filler — no
 * toggle for it, matching the mac-mail reference layout.
 */
export function SurfacesAdminHeader({
  agentName,
  backHref,
}: {
  agentName: string;
  backHref: string;
}) {
  const { toggle, isCollapsed } = usePanelControls();

  const surfacesCollapsed = isCollapsed("surfaces-list");
  const agentCollapsed = isCollapsed("agent");
  const detailsCollapsed = isCollapsed("surface-details");
  const playgroundCollapsed = isCollapsed("playground");

  return (
    <div className="flex items-center justify-between w-full min-w-0 gap-0 p-0">
      <div className="flex items-center gap-0">
        <ChevronLeftTapButton
          href={backHref}
          variant="transparent"
          ariaLabel="Back"
        />
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
      </div>

      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-sm font-medium text-foreground truncate">
          {agentName}
        </h1>
        <span className="text-xs text-muted-foreground truncate hidden sm:inline">
          Surfaces
        </span>
      </div>

      <div className="flex items-center gap-0">
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
          ariaLabel={
            playgroundCollapsed ? "Show playground" : "Hide playground"
          }
          tooltip={playgroundCollapsed ? "Show playground" : "Hide playground"}
        />
      </div>
    </div>
  );
}
