"use client";

// Front-door dynamic gate for the RAG flow visualization (Method B — see the
// code-splitting skill). React Flow (@xyflow/react) is heavy and browser-only;
// everything under RagFlowVisualizationImpl (nodes/, edges/) stays STATIC
// inside this one boundary. Never import the Impl directly.
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

// Props type lives in the shell so consumers get types without pulling the
// Impl (and React Flow) into their static graph.
export interface RagFlowVisualizationProps {
  className?: string;
  /** When true, controls are visible; default true */
  showControls?: boolean;
  /** Initial play state; default true */
  autoPlay?: boolean;
}

export const RagFlowVisualization = dynamic(
  () => import("./RagFlowVisualizationImpl").then((m) => m.RagFlowVisualization),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);
