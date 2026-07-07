"use client";

// features/education/media/mindmap/components/MindMapView.tsx
//
// Renders a stored mind-map artifact (a content-IR diagram_spec envelope) via
// the platform's InteractiveDiagramBlock (ReactFlow — content-IR owned; we only
// consume it). Nodes carry a one-line explanation in `details`, shown inline on
// the node (the "clickable → explanation" surface). Card-deep-linking / AskTutor
// is the P2 follow-on.
//
// InteractiveDiagramBlock pulls in ReactFlow — a heavy client dep — so it's
// code-split with next/dynamic({ ssr:false }) and only loads on this surface.

import dynamic from "next/dynamic";
import { Loader2, AlertCircle } from "lucide-react";
import { parseDiagramJSON } from "@/components/mardown-display/blocks/diagram/parseDiagramJSON";
import type { DiagramData } from "@/components/mardown-display/blocks/diagram/parseDiagramJSON";

const InteractiveDiagramBlock = dynamic(
  () => import("@/components/mardown-display/blocks/diagram/InteractiveDiagramBlock"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-72 items-center justify-center rounded-xl border border-border bg-card">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

function toDiagram(envelope: unknown): DiagramData | null {
  try {
    // parseDiagramJSON expects `{ diagram: { title, nodes, edges, ... } }`.
    // The envelope's __kind fields are ignored by the parser.
    return parseDiagramJSON(JSON.stringify({ diagram: envelope }));
  } catch {
    return null;
  }
}

export function MindMapView({ envelope }: { envelope: unknown }) {
  const diagram = toDiagram(envelope);
  if (!diagram) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" />
        This mind map couldn&apos;t be rendered — try regenerating it.
      </div>
    );
  }
  return <InteractiveDiagramBlock diagram={diagram} />;
}
