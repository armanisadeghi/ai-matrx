// features/esign/editor/history.ts — the draft plus 50 steps of undo / redo.

import { useCallback, useReducer } from "react";
import type { EnvelopeDraftV1 } from "../contract/draft";

const LIMIT = 50;

interface State {
  draft: EnvelopeDraftV1;
  past: EnvelopeDraftV1[];
  future: EnvelopeDraftV1[];
  /** Edits that share a coalesce key within COALESCE_MS are one undo step (typing, nudging). */
  lastKey: string | null;
  lastAt: number;
}

type Action =
  | { type: "edit"; fn: (d: EnvelopeDraftV1) => EnvelopeDraftV1; key: string | null; now: number }
  | { type: "replace"; draft: EnvelopeDraftV1 }
  | { type: "undo" }
  | { type: "redo" };

const COALESCE_MS = 900;

function reduce(state: State, action: Action): State {
  switch (action.type) {
    case "edit": {
      const next = action.fn(state.draft);
      if (next === state.draft) return state;
      const coalesce = action.key !== null && action.key === state.lastKey && action.now - state.lastAt < COALESCE_MS;
      const past = coalesce ? state.past : [...state.past, state.draft].slice(-LIMIT);
      return { draft: next, past, future: [], lastKey: action.key, lastAt: action.now };
    }
    case "replace":
      return { ...state, draft: action.draft, lastKey: null };
    case "undo": {
      if (state.past.length === 0) return state;
      const prev = state.past[state.past.length - 1];
      return { draft: prev, past: state.past.slice(0, -1), future: [state.draft, ...state.future].slice(0, LIMIT), lastKey: null, lastAt: 0 };
    }
    case "redo": {
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      return { draft: next, past: [...state.past, state.draft].slice(-LIMIT), future: rest, lastKey: null, lastAt: 0 };
    }
  }
}

export function useDraftHistory(initial: EnvelopeDraftV1) {
  const [state, dispatch] = useReducer(reduce, { draft: initial, past: [], future: [], lastKey: null, lastAt: 0 });
  const edit = useCallback(
    (fn: (d: EnvelopeDraftV1) => EnvelopeDraftV1, key: string | null = null) =>
      dispatch({ type: "edit", fn, key, now: Date.now() }),
    [],
  );
  const replace = useCallback((draft: EnvelopeDraftV1) => dispatch({ type: "replace", draft }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  return { draft: state.draft, edit, replace, undo, redo, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}
