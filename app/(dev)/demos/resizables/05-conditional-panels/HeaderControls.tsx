"use client";

import {
  ChevronLeftTapButton,
  PanelRightTapButton,
} from "@/components/icons/tap-buttons";
import { useMountState } from "./MountStateProvider";
import { DemoTitle } from "../_lib/DemoTitle";

export function ConditionalHeaderControls() {
  const { showRight, toggleRight } = useMountState();
  return (
    <div className="flex items-center justify-between w-full min-w-0 gap-0 p-0 space-x-0 space-y-0">
      <ChevronLeftTapButton
        href="/demos/resizables"
        variant="transparent"
        ariaLabel="Back"
      />
      <DemoTitle
        title="Demo 05 — Conditional panels"
        subtitle={`right panel: ${showRight ? "mounted" : "unmounted"} · per-combo memory`}
      />
      <PanelRightTapButton
        onClick={toggleRight}
        variant={showRight ? "glass" : "transparent"}
        ariaLabel={showRight ? "Unmount right panel" : "Mount right panel"}
        tooltip={showRight ? "Unmount right panel" : "Mount right panel"}
      />
    </div>
  );
}
