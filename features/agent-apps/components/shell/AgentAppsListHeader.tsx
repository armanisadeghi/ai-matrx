"use client";

import { AppWindow, Plus } from "lucide-react";
import { TapTargetButtonSolid } from "@/components/icons/TapTargetButton";

/** Injected route header for /agent-apps — the list/gallery entry point. */
export function AgentAppsListHeader() {
  return (
    <div className="flex items-center w-full gap-2 px-1">
      <AppWindow className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className="text-sm font-semibold text-foreground">Agent Apps</span>
      <div className="ml-auto">
        <TapTargetButtonSolid
          href="/agent-apps/new"
          icon={<Plus className="h-4 w-4" />}
          label="New app"
        />
      </div>
    </div>
  );
}
