/**
 * MermaidDocModel — typed structured documents parsed from mermaid DSL.
 *
 * The DSL string is ALWAYS the single source of truth; docs are derived,
 * edited via operations, and serialized back. Every entity banks its original
 * source line in `raw`; untouched entities re-emit `raw` verbatim so an edit
 * to one node produces a minimal diff and never reformats the user's file.
 *
 * Anything an adapter recognizes but cannot structurally edit (classDef,
 * linkStyle, click, style, accTitle, init directives, comments) is banked as
 * a PassthroughSegment with a positional anchor and re-emitted on serialize.
 * Anything an adapter does NOT recognize forces `code-only` — guessing would
 * risk silent content destruction, which is structurally forbidden here.
 */

import type { MermaidDiagramType } from "../diagram-type";

export interface Diagnostic {
  line: number; // 1-based line in the source
  message: string;
  severity: "error" | "warning";
}

/**
 * One body line of the original source. Lines bound to an entity (`ref`) are
 * re-emitted from `text` verbatim unless that entity is dirty (regenerate) or
 * gone (skip). Unbound lines (comments, classDef, blanks, style, click, …)
 * always re-emit verbatim — that is what makes round-trip lossless by
 * construction.
 */
export interface SourceLine {
  text: string;
  ref?: { entity: string; id: string };
}

interface DocBase {
  diagramType: MermaidDiagramType;
  /** YAML frontmatter block (--- … ---), verbatim lines, empty when absent. */
  frontmatter: string[];
  /** Ordered body lines (everything after frontmatter). */
  sourceLines: SourceLine[];
  warnings: Diagnostic[];
}

// ─── Flowchart ───────────────────────────────────────────────────────────────

export type FlowDirection = "TB" | "TD" | "LR" | "RL" | "BT";

export type FlowShape =
  | "rect"
  | "rounded"
  | "stadium"
  | "diamond"
  | "circle"
  | "hexagon"
  | "subroutine"
  | "cylinder";

export type FlowEdgeStyle = "arrow" | "open" | "dotted" | "thick";

export interface FlowNode {
  id: string;
  label: string;
  shape: FlowShape;
  /** Palette key from the adapter-owned classDef palette (visual color). */
  paletteKey?: string;
  /** Non-palette :::classes on the declaration, re-emitted on regeneration. */
  extraClasses?: string[];
  /** Original declaration line; absent for nodes declared inline in edges. */
  raw?: string;
  dirty?: boolean;
  /** Created by an edit op (no source line) — serializer appends a decl. */
  added?: boolean;
}

export interface FlowEdge {
  id: string; // synthetic e{n}, stable within one parse
  from: string;
  to: string;
  label?: string;
  style: FlowEdgeStyle;
  /** True when this edge's source line also declares the from/to node inline
   *  (e.g. `A[Start] --> B{X}`) — regeneration must re-emit those decls. */
  inlineFrom?: boolean;
  inlineTo?: boolean;
  raw?: string;
  dirty?: boolean;
  added?: boolean;
}

export interface FlowSubgraph {
  id: string;
  title: string;
  nodeIds: string[];
  raw?: string;
}

export interface FlowchartDoc extends DocBase {
  kind: "flowchart";
  direction: FlowDirection;
  nodes: FlowNode[];
  edges: FlowEdge[];
  subgraphs: FlowSubgraph[];
  /** Lines declaring several edges at once (chains / & fanout):
   *  sourceLine ref {entity:"edgeGroup", id} → member edge ids. */
  edgeGroups: Record<string, string[]>;
}

// ─── Mindmap ────────────────────────────────────────────────────────────────

export type MindmapShape = "default" | "square" | "rounded" | "circle" | "cloud" | "bang" | "hexagon";

export interface MindmapNode {
  id: string; // synthetic path id (m0, m0.1, …), stable within one parse
  label: string;
  shape: MindmapShape;
  /** ::icon(...) decorator line(s) attached to this node, verbatim. */
  decorators: string[];
  children: MindmapNode[];
  raw?: string;
  dirty?: boolean;
}

export interface MindmapDoc extends DocBase {
  kind: "mindmap";
  root: MindmapNode;
  /** Structural ops (indent/outdent/move) regenerate the whole tree body —
   *  content-preserving, formatting-normalizing. Set by applyOp. */
  regenerateAll?: boolean;
}

// ─── Sequence ───────────────────────────────────────────────────────────────

export type SequenceArrow = "->>" | "-->>" | "->" | "-->" | "-x" | "--x" | "-)" | "--)";

export interface SequenceParticipant {
  id: string;
  alias?: string;
  isActor: boolean;
  raw?: string;
  dirty?: boolean;
}

export type SequenceItem =
  | {
      kind: "message";
      id: string; // synthetic s{n}
      from: string;
      to: string;
      text: string;
      arrow: SequenceArrow;
      raw?: string;
      dirty?: boolean;
    }
  | {
      /** Notes, loops, alt/opt/par blocks, activations — locked rows, verbatim. */
      kind: "passthrough";
      id: string;
      raw: string;
    };

export interface SequenceDoc extends DocBase {
  kind: "sequence";
  autonumber: boolean;
  participants: SequenceParticipant[];
  items: SequenceItem[];
}

// ─── Pie ────────────────────────────────────────────────────────────────────

export interface PieSlice {
  id: string; // synthetic p{n}
  label: string;
  value: number;
  raw?: string;
  dirty?: boolean;
}

export interface PieDoc extends DocBase {
  kind: "pie";
  title?: string;
  showData: boolean;
  slices: PieSlice[];
}

// ─── Timeline ───────────────────────────────────────────────────────────────

export interface TimelineRow {
  id: string; // synthetic t{n}
  period: string;
  events: string[];
  raw?: string;
  dirty?: boolean;
}

export interface TimelineSection {
  id: string;
  /** undefined = the implicit section before any `section` line. */
  title?: string;
  rows: TimelineRow[];
  raw?: string;
  dirty?: boolean;
}

export interface TimelineDoc extends DocBase {
  kind: "timeline";
  title?: string;
  sections: TimelineSection[];
}

// ─── Union + parse outcome ──────────────────────────────────────────────────

export type MermaidDoc = FlowchartDoc | MindmapDoc | SequenceDoc | PieDoc | TimelineDoc;

export type ParseOutcome =
  | { status: "ok"; doc: MermaidDoc }
  | { status: "code-only"; reason: string; diagnostics: Diagnostic[] }
  | { status: "invalid"; diagnostics: Diagnostic[] };
