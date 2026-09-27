"use client";

import CardFaceContent from "@/components/mardown-display/blocks/flashcards/CardFaceContent";
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
import { Loader2, AlertCircle, BookOpen, Network, Search, X } from "lucide-react";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { AskTutorButton } from "@/features/education/tutor/components/AskTutorButton";
import { VerifyAgainstSourceButton } from "@/features/education/trust/components/VerifyAgainstSourceButton";
import type { TrustEnvelope } from "@/features/education/trust/types";
import { parseDiagramJSON } from "@/components/mardown-display/blocks/diagram/parseDiagramJSON";
import type {
  DiagramData,
  DiagramNode,
} from "@/components/mardown-display/blocks/diagram/parseDiagramJSON";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

const InteractiveDiagramBlock = dynamic(
  () =>
    import("@/components/mardown-display/blocks/diagram/InteractiveDiagramBlock"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-72 items-center justify-center bg-textured">
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
function nodeCard(
  node: DiagramNode,
): { id: string; front: string; back: string } | null {
  const m = node.metadata;
  if (!m) return null;
  const id = m.cardId;
  const front = m.cardFront;
  const back = m.cardBack;
  if (
    typeof id === "string" &&
    typeof front === "string" &&
    typeof back === "string"
  ) {
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
  mapTrust,
  onClose,
}: {
  node: DiagramNode;
  /** The map's TrustEnvelope — a linked node card is verified against ITS cited
   *  sources (nodes carry no per-node citations of their own). */
  mapTrust: TrustEnvelope | null | undefined;
  onClose: () => void;
}) {
  const card = nodeCard(node);
  const seed = seedForNode(node);
  return (
    <MatrxDynamicPanelHost
      open
      onOpenChange={(o) => !o && onClose()}
      title={
        <span className="flex items-center gap-2 text-base">
          <Network className="h-4 w-4 text-primary" aria-hidden />
          {node.label}
        </span>
      }
      position="right"
      defaultSize={30}
      minSize={22}
      contentClassName="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4"
    >
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
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
              <div className="text-sm font-medium text-foreground">
                <CardFaceContent content={card.front} variant="inline" />
              </div>
              <div className="text-sm text-muted-foreground">
                <CardFaceContent content={card.back} variant="inline" />
              </div>
              <VerifyAgainstSourceButton
                trust={mapTrust}
                front={card.front}
                back={card.back}
              />
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
    </MatrxDynamicPanelHost>
  );
}

/** Search the map's actual nodes, including descriptions that may be hidden in the canvas. */
export function MindMapNodeSearch({ envelope, selectedNode, onSelectNode }: {
  envelope: unknown;
  selectedNode: DiagramNode | null;
  onSelectNode: (node: DiagramNode) => void;
}) {
  const [query, setQuery] = useState("");
  const diagram = toDiagram(envelope);
  const needle = query.trim().toLocaleLowerCase();
  const matches = needle
    ? (diagram?.nodes ?? []).filter((node) =>
        [node.label, node.description, node.details]
          .some((value) => typeof value === "string" && value.toLocaleLowerCase().includes(needle)),
      )
    : [];

  return (
    <div className="relative min-w-0 flex-1 lg:w-64 lg:flex-none">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search map concepts"
          placeholder="Search map concepts"
          className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear map search" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="h-3.5 w-3.5" /></button>}
      </label>
      {needle && (
        <div role="listbox" aria-label="Matching map concepts" className="absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
          <p className="px-2 py-1 text-xs text-muted-foreground" aria-live="polite">{matches.length ? `${matches.length} matching concepts` : "No matching concepts"}</p>
          {matches.map((node) => (
            <button key={node.id} type="button" role="option" aria-selected={selectedNode?.id === node.id} onClick={() => { onSelectNode(node); setQuery(""); }} className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent">
              <span className="block truncate font-medium">{node.label}</span>
              {node.description && <span className="block truncate text-xs text-muted-foreground">{node.description}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MindMapView({
  envelope,
  mapTrust,
  presentation = "card",
  selectedNode,
  onSelectNode,
}: {
  envelope: unknown;
  /** Map-level TrustEnvelope, threaded to the node panel's verify affordance. */
  mapTrust?: TrustEnvelope | null;
  /** Dedicated routes use the canonical edge-to-edge graph workspace. */
  presentation?: "card" | "workspace";
  selectedNode?: DiagramNode | null;
  onSelectNode?: (node: DiagramNode | null) => void;
}) {
  const [localSelected, setLocalSelected] = useState<DiagramNode | null>(null);
  const selected = onSelectNode ? selectedNode : localSelected;
  const selectNode = onSelectNode ?? setLocalSelected;
  const diagram = toDiagram(envelope);
  if (!diagram) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>
          This mind map couldn&apos;t be rendered — try regenerating it.
          <ErrorAlchemyMenu />
        </span>
      </div>
    );
  }
  return (
    <div
      className={
        presentation === "workspace" ? "h-full min-h-0 w-full" : undefined
      }
    >
      <InteractiveDiagramBlock
        diagram={diagram}
        presentation={presentation}
        onNodeClick={selectNode}
      />
      {selected && (
        <NodePanel
          node={selected}
          mapTrust={mapTrust}
          onClose={() => selectNode(null)}
        />
      )}
    </div>
  );
}
