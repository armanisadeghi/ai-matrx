"use client";

// features/start/tools/useStartAgentTools.ts — executes the Start page's agent tools (start-tools.ts) in
// the browser. Every change goes through the same pure verbs as Edit mode (agentEdits.ts → widgets/doc.ts)
// into a PENDING doc the page shows at once; one agent turn's changes coalesce into ONE saved version
// (flushed after the agent has been quiet for AGENT_COALESCE_MS), written as the agent acting for the
// person, with a note naming what changed.
import { useEffect, useRef, useState } from "react";
import { useSurfaceClientTools } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { summarizeStartEdit } from "../widgets/editNote";
import type { StartDoc } from "../widgets/types";
import { applyAgentEdit, catalogForAgent, readForAgent } from "./agentEdits";

/** Quiet time after the agent's last change before its turn is saved as one version. */
export const AGENT_COALESCE_MS = 4000;

export interface StartAgentHost {
  /** The saved doc (null while loading or unreadable). */
  doc: StartDoc | null;
  /** The person is in Edit mode (the agent waits for them). */
  personEditing: boolean;
  save: (doc: StartDoc, note: string, opts: { byAgent: true }) => Promise<{ ok: true } | { ok: false; error: string }>;
}

export function useStartAgentTools(surfaceName: string, host: StartAgentHost) {
  const [pending, setPending] = useState<{ base: StartDoc; doc: StartDoc; count: number } | null>(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const hostRef = useRef(host);
  hostRef.current = host;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = async () => {
    timer.current = null;
    const p = pendingRef.current;
    if (!p) return;
    const result = await hostRef.current.save(p.doc, `Agent: ${summarizeStartEdit(p.base, p.doc)}`, { byAgent: true });
    // Keep showing the pending doc until the saved one arrives; a refused save keeps it for a retry.
    if (result.ok) setPending(null);
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const edit = (tool: string) => (input: unknown) => {
    const h = hostRef.current;
    if (h.personEditing) return { ok: false, error: "The person is editing their Start page right now; ask them to press Done, then try again." };
    const base = pendingRef.current?.doc ?? h.doc;
    if (!base) return { ok: false, error: "The Start page has not loaded yet; try again in a moment." };
    const answer = applyAgentEdit(base, tool, input);
    if (!answer.ok) return answer;
    const next = { base: pendingRef.current?.base ?? base, doc: answer.doc, count: (pendingRef.current?.count ?? 0) + 1 };
    pendingRef.current = next;
    setPending(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), AGENT_COALESCE_MS);
    return { ...answer.result, saved: "with the rest of this turn, as one version the person can undo from History" };
  };

  useSurfaceClientTools(surfaceName, {
    start_read_page: () => {
      const doc = pendingRef.current?.doc ?? hostRef.current.doc;
      return doc ? { ok: true, ...readForAgent(doc, pendingRef.current?.count ?? 0) } : { ok: false, error: "The Start page has not loaded yet." };
    },
    start_list_widgets: () => ({ ok: true, widgets: catalogForAgent() }),
    start_add_widget: edit("start_add_widget"),
    start_remove_widget: edit("start_remove_widget"),
    start_move_widget: edit("start_move_widget"),
    start_resize_widget: edit("start_resize_widget"),
    start_configure_widget: edit("start_configure_widget"),
  });

  return { agentDoc: pending?.doc ?? null };
}
