"use client";

// features/start/tools/useStartAgentTools.ts — executes the Start page's agent tools (start-tools.ts) in
// the browser. Every change goes through the same pure verbs as Edit mode (agentEdits.ts → widgets/doc.ts)
// into a PENDING doc the page shows at once; one agent turn's changes coalesce into ONE saved version,
// written as the agent acting for the person, with a note naming what changed. The turn's end is the
// conversation leaving "executing" (the chat runtime's own `selectIsExecuting`); a long safety window
// (AGENT_TURN_MAX_IDLE_MS) covers a turn whose state this window cannot see. Leaving the page, or the
// person pressing Edit, flushes at once — an agent change is never dropped.
import { useEffect, useRef, useState } from "react";
import { useSurfaceClientTools, type SurfaceToolCall } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { selectIsExecuting } from "@ai-matrx/chat/agents/redux/execution-system/selectors/aggregate.selectors";
import { useAppSelector } from "@/lib/redux/hooks";
import { summarizeStartEdit } from "../widgets/editNote";
import type { StartDoc } from "../widgets/types";
import { applyAgentEdit, catalogForAgent, readForAgent } from "./agentEdits";

/** Safety window: a turn whose end this window never sees is saved after this much quiet. */
export const AGENT_TURN_MAX_IDLE_MS = 60_000;

export interface StartAgentHost {
  /** The saved doc (null while loading or unreadable). */
  doc: StartDoc | null;
  /** The person is in Edit mode (the agent waits for them). */
  personEditing: boolean;
  save: (doc: StartDoc, note: string, opts: { byAgent: true }) => Promise<{ ok: true } | { ok: false; error: string }>;
}

export function useStartAgentTools(surfaceName: string, host: StartAgentHost) {
  const [pending, setPending] = useState<{ base: StartDoc; doc: StartDoc; count: number; conversationId: string | null } | null>(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const hostRef = useRef(host);
  hostRef.current = host;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushing = useRef<Promise<void> | null>(null);

  /** Save the pending turn as ONE version now. Safe to call twice; the second waits for the first. */
  const flush = (): Promise<void> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (flushing.current) return flushing.current;
    const p = pendingRef.current;
    if (!p) return Promise.resolve();
    const run = (async () => {
      const result = await hostRef.current.save(p.doc, `Agent: ${summarizeStartEdit(p.base, p.doc)}`, { byAgent: true });
      // A refused save keeps the pending doc on screen (and saves on the next flush).
      if (result.ok && pendingRef.current === p) {
        pendingRef.current = null;
        setPending(null);
      }
    })();
    flushing.current = run.finally(() => {
      flushing.current = null;
    });
    return flushing.current;
  };

  // THE TURN'S END: the conversation that made the pending changes stops executing.
  const executing = useAppSelector((state) =>
    pending?.conversationId ? selectIsExecuting(pending.conversationId)(state as never) : false,
  );
  const wasExecuting = useRef(false);
  useEffect(() => {
    if (executing) wasExecuting.current = true;
    else if (wasExecuting.current && pendingRef.current) {
      wasExecuting.current = false;
      void flush();
    }
  });
  // Leaving the page flushes; nothing an agent did is dropped.
  useEffect(() => () => void flush(), []);

  const edit = (tool: string) => (input: unknown, call?: SurfaceToolCall) => {
    const h = hostRef.current;
    if (h.personEditing) return { ok: false, error: "The person is editing their Start page right now; ask them to press Done, then try again." };
    const base = pendingRef.current?.doc ?? h.doc;
    if (!base) return { ok: false, error: "The Start page has not loaded yet; try again in a moment." };
    const answer = applyAgentEdit(base, tool, input);
    if (!answer.ok) return answer;
    const next = {
      base: pendingRef.current?.base ?? base,
      doc: answer.doc,
      count: (pendingRef.current?.count ?? 0) + 1,
      conversationId: call?.conversationId ?? pendingRef.current?.conversationId ?? null,
    };
    pendingRef.current = next;
    setPending(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), AGENT_TURN_MAX_IDLE_MS);
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

  return { agentDoc: pending?.doc ?? null, flush };
}
