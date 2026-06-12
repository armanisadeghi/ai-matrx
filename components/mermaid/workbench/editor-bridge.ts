"use client";

/**
 * Editor bridge — lets out-of-tree collaborators (the AI edit hook, context
 * menu actions) read the live editor source and apply replacements as
 * undoable external edits, without threading callbacks through Redux.
 */

export interface MermaidEditorBridge {
  getSource: () => string;
  /** Apply a full replacement source (undoable APPLY_EXTERNAL_SOURCE). */
  applySource: (source: string, meta?: { label?: string }) => void;
}

const bridges = new Map<string, MermaidEditorBridge>();

export function registerMermaidEditor(key: string, bridge: MermaidEditorBridge): () => void {
  bridges.set(key, bridge);
  return () => {
    if (bridges.get(key) === bridge) bridges.delete(key);
  };
}

export function getMermaidEditor(key: string): MermaidEditorBridge | null {
  return bridges.get(key) ?? null;
}
