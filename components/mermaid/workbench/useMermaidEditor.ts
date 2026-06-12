"use client";

/**
 * Workbench editor state — local useReducer; the DSL string is canonical and
 * the parsed doc is derived through the fidelity gate on every source change.
 * Undo/redo are source-string snapshots (uniform across visual/outline/code
 * edits AND applied AI suggestions).
 */

import { useReducer } from "react";
import { toast } from "sonner";

import { detectDiagramType, type MermaidDiagramType } from "../diagram-type";
import "../adapters/register";
import { getAdapterForType, type MermaidAdapter } from "../model/adapter";
import { MermaidOpError, type MermaidOp } from "../model/ops";
import { parseWithFidelityGate } from "../model/round-trip";
import type { MermaidDoc, ParseOutcome } from "../model/types";

export type WorkbenchMode = "visual" | "outline" | "code";

export interface EditorSelection {
  kind: "node" | "edge";
  id: string;
}

export interface MermaidEditorState {
  source: string;
  diagramType: MermaidDiagramType;
  adapter: MermaidAdapter | null;
  outcome: ParseOutcome | null; // null = no adapter for this type
  baselineSource: string; // last persisted
  undoStack: string[];
  redoStack: string[];
  mode: WorkbenchMode;
  selection: EditorSelection | null;
}

export type MermaidEditorAction =
  | { type: "APPLY_OP"; op: MermaidOp }
  | { type: "SET_SOURCE"; source: string; coalesce?: boolean }
  | { type: "APPLY_EXTERNAL_SOURCE"; source: string }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "SET_MODE"; mode: WorkbenchMode }
  | { type: "SELECT"; selection: EditorSelection | null }
  | { type: "MARK_SAVED"; source: string };

const MAX_UNDO = 100;

function derive(source: string): Pick<MermaidEditorState, "diagramType" | "adapter" | "outcome"> {
  const diagramType = detectDiagramType(source);
  const adapter = getAdapterForType(diagramType);
  if (!adapter) return { diagramType, adapter: null, outcome: null };
  return { diagramType, adapter, outcome: parseWithFidelityGate(adapter, source).outcome };
}

function pushUndo(state: MermaidEditorState, coalesce = false): Pick<MermaidEditorState, "undoStack" | "redoStack"> {
  if (coalesce && state.undoStack.length > 0) {
    return { undoStack: state.undoStack, redoStack: [] };
  }
  return {
    undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), state.source],
    redoStack: [],
  };
}

function reducer(state: MermaidEditorState, action: MermaidEditorAction): MermaidEditorState {
  switch (action.type) {
    case "APPLY_OP": {
      if (!state.adapter || state.outcome?.status !== "ok") return state;
      let nextDoc: MermaidDoc;
      try {
        nextDoc = state.adapter.applyOp(state.outcome.doc, action.op);
      } catch (err) {
        if (err instanceof MermaidOpError) {
          toast.error(err.message);
          return state;
        }
        console.error("[MermaidEditor] op failed unexpectedly", action.op, err);
        toast.error("That change could not be applied");
        return state;
      }
      const source = state.adapter.serialize(nextDoc);
      return {
        ...state,
        ...pushUndo(state),
        source,
        ...derive(source),
      };
    }
    case "SET_SOURCE": {
      if (action.source === state.source) return state;
      return {
        ...state,
        ...pushUndo(state, action.coalesce),
        source: action.source,
        ...derive(action.source),
        selection: null,
      };
    }
    case "APPLY_EXTERNAL_SOURCE": {
      if (action.source === state.source) return state;
      return {
        ...state,
        ...pushUndo(state),
        source: action.source,
        ...derive(action.source),
        selection: null,
      };
    }
    case "UNDO": {
      const prev = state.undoStack[state.undoStack.length - 1];
      if (prev === undefined) return state;
      return {
        ...state,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, state.source],
        source: prev,
        ...derive(prev),
        selection: null,
      };
    }
    case "REDO": {
      const next = state.redoStack[state.redoStack.length - 1];
      if (next === undefined) return state;
      return {
        ...state,
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, state.source],
        source: next,
        ...derive(next),
        selection: null,
      };
    }
    case "SET_MODE":
      return state.mode === action.mode ? state : { ...state, mode: action.mode, selection: null };
    case "SELECT":
      return { ...state, selection: action.selection };
    case "MARK_SAVED":
      return { ...state, baselineSource: action.source };
    default:
      return state;
  }
}

export function useMermaidEditor(initialSource: string, initialMode?: WorkbenchMode) {
  const [state, dispatch] = useReducer(
    reducer,
    initialSource,
    (source): MermaidEditorState => {
      const derived = derive(source);
      // Non-technical users land in the friendliest mode that actually works
      // for this document; advanced syntax lands in code mode honestly.
      const structuralOk = derived.outcome?.status === "ok";
      return {
        source,
        ...derived,
        baselineSource: source,
        undoStack: [],
        redoStack: [],
        mode: initialMode ?? (structuralOk ? "visual" : "code"),
        selection: null,
      };
    },
  );
  return { state, dispatch };
}
