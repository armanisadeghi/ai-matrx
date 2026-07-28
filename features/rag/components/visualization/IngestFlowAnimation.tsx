"use client";

// Front-door dynamic gate for the ingest flow animation (Method B — see the
// code-splitting skill). React Flow (@xyflow/react) is heavy and browser-only;
// everything under IngestFlowAnimationImpl (nodes/, edges/) stays STATIC
// inside this one boundary. Never import the Impl directly.
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

import type { UseFileIngestState } from "@/features/rag/hooks/useFileIngest";

// Types live in the shell so consumers get them without pulling the Impl
// (and React Flow) into their static graph.
export interface IngestHandle extends UseFileIngestState {
  run: (opts?: { force?: boolean }) => Promise<void>;
  runOnce: (opts?: { force?: boolean }) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

export interface IngestFlowAnimationProps {
  fileName: string;
  ingest: IngestHandle;
  /** Called when the user dismisses a terminal-state run (success/error). */
  onClose: () => void;
  className?: string;
}

export const IngestFlowAnimation = dynamic(
  () => import("./IngestFlowAnimationImpl").then((m) => m.IngestFlowAnimation),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);
