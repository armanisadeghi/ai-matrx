/**
 * Adapter contract + registry. One adapter per structurally-editable diagram
 * type. Types without an adapter still get render + code + AI editing — the
 * workbench's structural modes simply show a graceful "use Code or AI" state.
 */

import type { MermaidDiagramType } from "../diagram-type";
import { detectDiagramType } from "../diagram-type";
import type { MermaidOp } from "./ops";
import type { MermaidDoc, ParseOutcome } from "./types";

export interface AdapterVocabulary {
  /** What a "node" is called for humans ("Step", "Topic", "Slice", …). */
  node: string;
  /** Label for the primary add action ("Add step", "Add topic", …). */
  addNode: string;
  /** What a connection is called, when the type has them. */
  edge?: string;
}

export interface MermaidAdapter<D extends MermaidDoc = MermaidDoc> {
  diagramType: MermaidDiagramType;
  parse(source: string): ParseOutcome;
  /** Deterministic serialization; untouched entities re-emit `raw` verbatim. */
  serialize(doc: D): string;
  /** Pure; throws MermaidOpError on invalid targets. */
  applyOp(doc: D, op: MermaidOp): D;
  vocabulary: AdapterVocabulary;
}

const registry = new Map<MermaidDiagramType, MermaidAdapter>();

export function registerAdapter<D extends MermaidDoc>(adapter: MermaidAdapter<D>): void {
  // One controlled widening here beats casts at every registration site; the
  // registry is only consumed through the (doc-typed) MermaidAdapter surface.
  registry.set(adapter.diagramType, adapter as unknown as MermaidAdapter);
}

export function getAdapterForType(type: MermaidDiagramType): MermaidAdapter | null {
  return registry.get(type) ?? null;
}

export function getAdapter(source: string): MermaidAdapter | null {
  return getAdapterForType(detectDiagramType(source));
}
