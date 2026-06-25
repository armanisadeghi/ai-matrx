"use client";

import {
  PanelLeftTapButton,
  RobotTapButton,
  ViewTapButton,
  TestTubeTapButton,
} from "@/components/icons/tap-buttons";
import { usePanelControls } from "@/app/(dev)/demos/resizables/_lib/PanelControlProvider";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";

/**
 * Shell header for `/agents/[id]/surfaces` (and the admin twin).
 *
 * Combines the common `AgentHeader` with the four collapsible column toggles.
 * Toggles live in the header row — same mac-mail / tasks pattern — so the
 * panel group below can be full-height with only `pt-[var(--shell-header-h)]`
 * on each column. Putting toggles in the page body breaks that model.
 */
export function SurfacesAgentHeaderControls({
  agentId,
  agentName,
  backHref,
  basePath = "/agents",
}: {
  agentId: string;
  agentName: string;
  backHref: string;
  basePath?: string;
}) {
  const { toggle, isCollapsed } = usePanelControls();

  const surfacesCollapsed = isCollapsed("surfaces-list");
  const agentCollapsed = isCollapsed("agent");
  const detailsCollapsed = isCollapsed("surface-details");
  const playgroundCollapsed = isCollapsed("playground");

  return (
    <div className="flex items-center w-full min-w-0 gap-0 p-0">
      {/* Left column toggles — desktop only; mobile uses the stacked fallback. */}
      <div className="hidden lg:flex items-center shrink-0">
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

      <div className="flex-1 min-w-0">
        <AgentHeader
          agentId={agentId}
          agentName={agentName}
          backHref={backHref}
          basePath={basePath}
        />
      </div>

      <div className="hidden lg:flex items-center shrink-0">
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
