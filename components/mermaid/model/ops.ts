/**
 * Edit operations per diagram type — the ONLY way structural modes (visual /
 * outline) mutate a document. Adapters implement applyOp as a pure function:
 * (doc, op) → new doc. Ops throw MermaidOpError on an invalid target; the
 * editor surfaces that as a friendly toast, never a crash.
 */

import type {
  FlowDirection,
  FlowEdgeStyle,
  FlowShape,
  MindmapShape,
  SequenceArrow,
} from "./types";

export class MermaidOpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MermaidOpError";
  }
}

export type FlowchartOp =
  | { type: "addNode"; label: string; shape?: FlowShape; connectFrom?: string }
  | { type: "renameNode"; id: string; label: string }
  | { type: "deleteNode"; id: string } // cascades edges
  | { type: "setNodeShape"; id: string; shape: FlowShape }
  | { type: "setNodePalette"; id: string; paletteKey: string | null }
  | { type: "connectNodes"; from: string; to: string; label?: string }
  | { type: "deleteEdge"; id: string }
  | { type: "setEdgeLabel"; id: string; label: string }
  | { type: "setEdgeStyle"; id: string; style: FlowEdgeStyle }
  | { type: "reverseEdge"; id: string }
  | { type: "setDirection"; direction: FlowDirection }
  | { type: "renameSubgraph"; id: string; title: string };

export type MindmapOp =
  | { type: "addChild"; parentId: string; label: string }
  | { type: "renameNode"; id: string; label: string }
  | { type: "deleteNode"; id: string } // deletes subtree; root forbidden
  | { type: "setShape"; id: string; shape: MindmapShape }
  | { type: "indent"; id: string } // becomes child of previous sibling
  | { type: "outdent"; id: string } // becomes sibling of parent
  | { type: "moveBefore"; id: string; siblingId: string };

export type SequenceOp =
  | { type: "addParticipant"; label: string; isActor?: boolean }
  | { type: "renameParticipant"; id: string; label: string }
  | { type: "deleteParticipant"; id: string } // blocked while referenced
  | { type: "addMessage"; from: string; to: string; text: string; arrow?: SequenceArrow }
  | { type: "editMessage"; id: string; from?: string; to?: string; text?: string; arrow?: SequenceArrow }
  | { type: "deleteMessage"; id: string }
  | { type: "moveMessage"; id: string; direction: "up" | "down" }
  | { type: "setAutonumber"; enabled: boolean };

export type PieOp =
  | { type: "setTitle"; title: string }
  | { type: "setShowData"; enabled: boolean }
  | { type: "addSlice"; label: string; value: number }
  | { type: "editSlice"; id: string; label?: string; value?: number }
  | { type: "deleteSlice"; id: string };

export type TimelineOp =
  | { type: "setTitle"; title: string }
  | { type: "addSection"; title: string }
  | { type: "renameSection"; id: string; title: string }
  | { type: "deleteSection"; id: string }
  | { type: "addRow"; sectionId: string; period: string; event?: string }
  | { type: "editRow"; id: string; period?: string }
  | { type: "addEvent"; rowId: string; text: string }
  | { type: "editEvent"; rowId: string; eventIndex: number; text: string }
  | { type: "deleteEvent"; rowId: string; eventIndex: number }
  | { type: "deleteRow"; id: string };

export type MermaidOp = FlowchartOp | MindmapOp | SequenceOp | PieOp | TimelineOp;
