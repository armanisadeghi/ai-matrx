// features/agents/agent-sets/components/SetBuilderCanvas.tsx
//
// The "front door" for the Agent Set builder canvas. The heavy React Flow core
// lives in SetBuilderCanvasImpl; this wrapper is the ONLY thing anyone imports.
// It code-splits the impl behind next/dynamic({ ssr: false }) so the flow runtime
// never enters the route/server chunk, and re-exports the props type from the
// shell so consumers stay typed without pulling the impl into their graph.

"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { SetAccent } from "../constants";
import type { AgentSetConfig, AgentSetMember } from "../types";

/** Props for the set builder canvas. Defined in the shell so consumers stay typed
 *  without pulling the heavy `…Impl` (React Flow) module into their graph. */
export interface SetBuilderCanvasProps {
  orchestratorId: string;
  accent: SetAccent;
  members: AgentSetMember[];
  config: AgentSetConfig;
  onEditMember: (agentId: string) => void;
}

const SetBuilderCanvas = dynamic(() => import("./SetBuilderCanvasImpl"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-textured">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  ),
});

export default SetBuilderCanvas;
