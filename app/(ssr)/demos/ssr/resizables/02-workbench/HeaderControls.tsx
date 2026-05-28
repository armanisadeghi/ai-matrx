"use client";

import {
  ChevronLeftTapButton,
  PanelLeftTapButton,
  PanelRightTapButton,
} from "@/components/icons/tap-buttons";
import { usePanelControls } from "../_lib/PanelControlProvider";
import { DemoTitle } from "../_lib/DemoTitle";

// All tap targets are 44pt — they own their own visual breathing room.
// Container is gap-0 / p-0 / space-0 — never add any spacing around them.
//
// `variant` indicates cluster state: transparent when that side has nothing
// open, glass when at least one panel in the cluster is open.
export function WorkbenchHeaderControls() {
  const { toggle, isCollapsed } = usePanelControls();
  const filesCollapsed = isCollapsed("files");
  const inspectorCollapsed = isCollapsed("inspector");

  const isLeftSideCollapsed = filesCollapsed;
  const isRightSideCollapsed = inspectorCollapsed;

  return (
    <div className="flex items-center justify-between w-full min-w-0 gap-0 p-0 space-x-0 space-y-0">
      <div className="flex items-center gap-0 p-0 space-x-0 space-y-0">
        <ChevronLeftTapButton
          href="/demos/ssr/resizables"
          variant="transparent"
          ariaLabel="Back"
        />
        <PanelLeftTapButton
          onClick={() => toggle("files")}
          variant={isLeftSideCollapsed ? "transparent" : "glass"}
          ariaLabel={filesCollapsed ? "Show files" : "Hide files"}
          tooltip={filesCollapsed ? "Show files" : "Hide files"}
        />
      </div>
      <DemoTitle
        title="Demo 02 — Workbench"
        subtitle="3 panels · 2 collapsibles · cookie SSR"
      />
      <PanelRightTapButton
        onClick={() => toggle("inspector")}
        variant={isRightSideCollapsed ? "transparent" : "glass"}
        ariaLabel={inspectorCollapsed ? "Show inspector" : "Hide inspector"}
        tooltip={inspectorCollapsed ? "Show inspector" : "Hide inspector"}
      />
    </div>
  );
}
