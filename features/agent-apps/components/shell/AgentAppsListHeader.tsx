"use client";

import { AppWindow, BrainCircuit, Plus } from "lucide-react";
import {
  TapTargetButtonSolid,
  TapTargetButtonTransparent,
} from "@/components/icons/TapTargetButton";

/** Injected route header for /agent-apps — the list/gallery entry point. */
export function AgentAppsListHeader() {
  return (
    <div className="flex items-center w-full gap-2 px-1">
      <AppWindow className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className="text-sm font-semibold text-foreground">Agent Apps</span>
      <div className="ml-auto flex items-center gap-1">
        {/* THE DOOR LAW — the agent that writes an app's code is a Mandate
            (`agent_apps.prompt_app_dev`) the builder may swap for their own,
            with no deploy. Deep-linked to the `agent_apps` domain: the bare
            list is 264 mandates across 45 domains. */}
        <TapTargetButtonTransparent
          href="/agents/mandates?feature=agent_apps"
          icon={<BrainCircuit className="h-4 w-4" />}
          ariaLabel="App builder agents"
          tooltip="App builder agents"
        />
        <TapTargetButtonSolid
          href="/agent-apps/new"
          icon={<Plus className="h-4 w-4" />}
          label="New app"
        />
      </div>
    </div>
  );
}
