/**
 * The store seam. The canvas never owns a second copy of its state: it reads
 * and writes through a CanvasStoreBinding.
 *
 *  - A host WITH Redux mounts `canvasReducer` in its root reducer and binds it:
 *      bindCanvasToReduxStore(store, (root) => root.canvasHost)
 *  - A host WITHOUT Redux (a Vite tool, an Electron window) calls
 *      createCanvasStore()
 *    which runs the very same reducer in a tiny standalone store.
 */

import { canvasReducer, createInitialCanvasState, type CanvasAction } from "./reducer";
import type { CanvasState } from "./types";

export interface CanvasStoreBinding {
  getState(): CanvasState;
  dispatch(action: CanvasAction): void;
  subscribe(listener: () => void): () => void;
}

export function createCanvasStore(initial?: CanvasState): CanvasStoreBinding {
  let state = initial ?? createInitialCanvasState();
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    dispatch(action) {
      const next = canvasReducer(state, action);
      if (next === state) return;
      state = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The minimum of a Redux store the canvas needs. */
export interface ReduxStoreLike<TRoot> {
  getState(): TRoot;
  dispatch(action: CanvasAction): unknown;
  subscribe(listener: () => void): () => void;
}

export function bindCanvasToReduxStore<TRoot>(
  store: ReduxStoreLike<TRoot>,
  select: (root: TRoot) => CanvasState,
): CanvasStoreBinding {
  return {
    getState: () => select(store.getState()),
    dispatch: (action) => {
      store.dispatch(action);
    },
    subscribe: (listener) => store.subscribe(listener),
  };
}
