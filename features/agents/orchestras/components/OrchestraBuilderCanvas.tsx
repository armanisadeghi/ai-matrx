// features/agents/orchestras/components/OrchestraBuilderCanvas.tsx
//
// The "front door" for the Orchestra builder canvas. The heavy React Flow core
// lives in OrchestraBuilderCanvasImpl; this wrapper is the ONLY thing anyone imports.
// It code-splits the impl behind next/dynamic({ ssr: false }) so the flow runtime
// never enters the route/server chunk, and re-exports the props type from the
// shell so consumers stay typed without pulling the impl into their graph.

"use client";

import dynamic from "next/dynamic";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import type { OrchestraAccent } from "../constants";
import type { OrchestraConfig, OrchestraMember } from "../types";

/** Props for the Orchestra builder canvas. Defined in the shell so consumers stay typed
 *  without pulling the heavy `…Impl` (React Flow) module into their graph. */
export interface OrchestraBuilderCanvasProps {
  orchestratorId: string;
  accent: OrchestraAccent;
  members: OrchestraMember[];
  config: OrchestraConfig;
  onEditMember: (agentId: string) => void;
  /** Open the orchestrator inspector (snapshot + details + system prompt). */
  onOpenOrchestrator: () => void;
}

const OrchestraBuilderCanvas = dynamic(
  () => import("./OrchestraBuilderCanvasImpl"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-textured text-sm text-muted-foreground">
        <SuspenseLoader
          size="md"
          centered={false}
          message="Loading orchestra canvas…"
        />
      </div>
    ),
  },
);

export default OrchestraBuilderCanvas;
