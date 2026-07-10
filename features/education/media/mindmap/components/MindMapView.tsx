"use client";

// features/education/media/mindmap/components/MindMapView.tsx
//
// Renders a stored mind-map artifact (a content-IR diagram_spec envelope) via
// the platform's InteractiveDiagramBlock (ReactFlow — content-IR owned; we only
// consume it). Nodes are CLICKABLE (DoD item 3): a click opens a side panel that
// resolves the node to its source card where one was matched (linkCards.ts) and
// always offers "Ask my tutor about this" (the reusable AskTutorButton primitive
// from features/education/tutor) seeded with the node/card content.
//
// The node-click callback is an OPT-IN prop on the shared InteractiveDiagramBlock
// (other consumers are unaffected). InteractiveDiagramBlock pulls in ReactFlow —
// a heavy client dep — so it's code-split with next/dynamic({ ssr:false }) and
// only loads on this surface.
//
// React Compiler is on: no manual memo.

import dynamic from "next/dynamic";
import { useState } from "react";
import { Loader2, AlertCircle, BookOpen, Network } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AskTutorButton } from "@/features/education/tutor/components/AskTutorButton";
import { parseDiagramJSON } from "@/components/mardown-display/blocks/diagram/parseDiagramJSON";
import type {
  DiagramData,
  DiagramNode,
} from "@/components/mardown-display/blocks/diagram/parseDiagramJSON";

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

/** Read the source-card fields stamped onto a node by linkCards.ts, if any. */
function nodeCard(node: DiagramNode): { id: string; front: string; back: string } | null {
  const m = node.metadata;
  if (!m) return null;
  const id = m.cardId;
  const front = m.cardFront;
  const back = m.cardBack;
  if (typeof id === "string" && typeof front === "string" && typeof back === "string") {
    return { id, front, back };
  }
  return null;
}

/** Build the tutor seed for a clicked node — the linked card verbatim when we
 *  have it, else the node's own concept text. */
function seedForNode(node: DiagramNode): { title: string; material: string } {
  const card = nodeCard(node);
  if (card) {
    return {
      title: card.front,
      material: `Flashcard\nFront: ${card.front}\nBack: ${card.back}`,
    };
  }
  const parts = [node.label, node.description, node.details].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  return {
    title: node.label,
    material: `Concept from the mind map: ${parts.join(" — ")}`,
  };
}

/** The side panel shown when a node is clicked — source card (if linked) + tutor. */
function NodePanel({
  node,
  onClose,
}: {
  node: DiagramNode;
  onClose: () => void;
}) {
  const card = nodeCard(node);
  const seed = seedForNode(node);
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="space-y-0 border-b border-border px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Network className="h-4 w-4 text-primary" aria-hidden />
            {node.label}
          </SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {node.description && (
            <p className="text-sm text-muted-foreground">{node.description}</p>
          )}
          {node.details && (
            <p className="text-sm text-foreground">{node.details}</p>
          )}

          {card ? (
            <div className="space-y-2 rounded-xl border border-border bg-card p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <BookOpen className="h-3.5 w-3.5" aria-hidden />
                From this card
              </div>
              <div className="text-sm font-medium text-foreground">{card.front}</div>
              <div className="text-sm text-muted-foreground">{card.back}</div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              This idea groups several cards — ask the tutor to unpack it.
            </div>
          )}

          <AskTutorButton
            seed={seed}
            label="Ask my tutor about this"
            variant="default"
            size="default"
            className="w-full justify-center text-sm"
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function MindMapView({ envelope }: { envelope: unknown }) {
  const [selected, setSelected] = useState<DiagramNode | null>(null);
  const diagram = toDiagram(envelope);
  if (!diagram) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" />
        This mind map couldn&apos;t be rendered — try regenerating it.
      </div>
    );
  }
  return (
    <>
      <InteractiveDiagramBlock diagram={diagram} onNodeClick={setSelected} />
      {selected && <NodePanel node={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
