/**
 * The canvas controller: the ONE imperative API every caller uses. It wraps a
 * store binding, validates what callers hand it (so the reducer stays pure and
 * trusting), and owns hydration + autosave.
 *
 * Nothing fails silently: a refused open (non-JSON data, unknown kind) is
 * reported through the error sink and returns false.
 */

import { canvasActions, type CanvasAction } from "./reducer";
import { canvasItemId, findNonJson } from "./ids";
import { toPersistableSnapshot, type CanvasPersistencePort } from "./persistence";
import type { CanvasStoreBinding } from "./store";
import type {
  CanvasItemId,
  CanvasJson,
  CanvasOpenInput,
  CanvasOrientation,
  CanvasPaneId,
  CanvasSplitId,
  CanvasState,
} from "./types";

export interface CanvasErrorReport {
  readonly code: "non-json-data" | "unknown-kind" | "persistence-load" | "persistence-save";
  readonly message: string;
  readonly detail?: unknown;
}

export type CanvasErrorSink = (report: CanvasErrorReport) => void;

export const consoleCanvasErrorSink: CanvasErrorSink = (report) => {
  console.error(`[@ai-matrx/canvas] ${report.code}: ${report.message}`, report.detail ?? "");
};

export interface CanvasControllerOptions {
  readonly store: CanvasStoreBinding;
  readonly persistence?: CanvasPersistencePort | null | undefined;
  /** Kinds that may not come back after a reload. Default: every kind restores. */
  readonly isRestorable?: ((kind: string) => boolean) | undefined;
  /** When given, opens of an unregistered kind are refused and reported. */
  readonly isKnownKind?: ((kind: string) => boolean) | undefined;
  readonly onError?: CanvasErrorSink | undefined;
  readonly saveDelayMs?: number | undefined;
}

export interface CanvasController {
  readonly store: CanvasStoreBinding;
  getState(): CanvasState;
  open(input: CanvasOpenInput): CanvasItemId | null;
  update(itemId: CanvasItemId, patch: { data?: CanvasJson | undefined; title?: string | null | undefined }): boolean;
  close(itemId: CanvasItemId): void;
  closeOthers(itemId: CanvasItemId): void;
  activate(itemId: CanvasItemId): void;
  focusPane(paneId: CanvasPaneId): void;
  moveItem(itemId: CanvasItemId, toPaneId: CanvasPaneId, index?: number): void;
  splitPane(paneId: CanvasPaneId, orientation: CanvasOrientation, moveItemId?: CanvasItemId): void;
  closePane(paneId: CanvasPaneId): void;
  resizeSplit(splitId: CanvasSplitId, sizes: readonly number[]): void;
  show(): void;
  hide(): void;
  toggle(): void;
  setFullscreen(fullscreen: boolean): void;
  setWidth(width: number): void;
  /** Is this exact thing on the canvas right now? */
  has(kind: string, key: string): boolean;
  /** Loads the persisted snapshot and starts autosave. Returns a disposer. */
  start(): () => void;
}

export function createCanvasController(options: CanvasControllerOptions): CanvasController {
  const { store, persistence = null } = options;
  const onError = options.onError ?? consoleCanvasErrorSink;
  const isRestorable = options.isRestorable ?? (() => true);
  const dispatch = (action: CanvasAction) => store.dispatch(action);

  const controller: CanvasController = {
    store,
    getState: () => store.getState(),
    open(input) {
      if (options.isKnownKind && !options.isKnownKind(input.kind)) {
        onError({ code: "unknown-kind", message: `No canvas kind "${input.kind}" is registered.`, detail: input });
        return null;
      }
      if (input.data !== undefined) {
        const bad = findNonJson(input.data);
        if (bad) {
          onError({
            code: "non-json-data",
            message: `Canvas data for "${input.kind}" must be plain JSON; ${bad} is not.`,
            detail: { kind: input.kind, key: input.key },
          });
          return null;
        }
      }
      dispatch(canvasActions.open(input));
      return canvasItemId(input.kind, input.key);
    },
    update(itemId, patch) {
      if (patch.data !== undefined) {
        const bad = findNonJson(patch.data);
        if (bad) {
          onError({ code: "non-json-data", message: `Canvas update for ${itemId} must be plain JSON; ${bad} is not.` });
          return false;
        }
      }
      if (!store.getState().items[itemId]) return false;
      dispatch(canvasActions.update(itemId, patch));
      return true;
    },
    close: (itemId) => dispatch(canvasActions.closeItem(itemId)),
    closeOthers: (itemId) => dispatch(canvasActions.closeOthers(itemId)),
    activate: (itemId) => dispatch(canvasActions.activate(itemId)),
    focusPane: (paneId) => dispatch(canvasActions.focusPane(paneId)),
    moveItem: (itemId, toPaneId, index) => dispatch(canvasActions.moveItem(itemId, toPaneId, index)),
    splitPane: (paneId, orientation, moveItemId) => dispatch(canvasActions.splitPane(paneId, orientation, moveItemId)),
    closePane: (paneId) => dispatch(canvasActions.closePane(paneId)),
    resizeSplit: (splitId, sizes) => dispatch(canvasActions.resizeSplit(splitId, sizes)),
    show: () => dispatch(canvasActions.setOpen(true)),
    hide: () => dispatch(canvasActions.setOpen(false)),
    toggle: () => dispatch(canvasActions.toggle()),
    setFullscreen: (fullscreen) => dispatch(canvasActions.setFullscreen(fullscreen)),
    setWidth: (width) => dispatch(canvasActions.setWidth(width)),
    has: (kind, key) => canvasItemId(kind, key) in store.getState().items,
    start() {
      let disposed = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let lastSaved: CanvasState | null = null;

      const save = () => {
        timer = null;
        const state = store.getState();
        if (!persistence || !state.hydrated || state === lastSaved) return;
        lastSaved = state;
        try {
          void Promise.resolve(persistence.save(toPersistableSnapshot(state, isRestorable))).catch((error: unknown) =>
            onError({ code: "persistence-save", message: "Saving the canvas layout failed.", detail: error }),
          );
        } catch (error) {
          onError({ code: "persistence-save", message: "Saving the canvas layout failed.", detail: error });
        }
      };

      const unsubscribe = store.subscribe(() => {
        if (!persistence || disposed) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(save, options.saveDelayMs ?? 250);
      });

      if (store.getState().hydrated) {
        // Already hydrated (e.g. a second provider over the same store).
      } else if (!persistence) {
        dispatch(canvasActions.hydrate(null));
      } else {
        Promise.resolve()
          .then(() => persistence.load())
          .then(
            (snapshot) => {
              if (!disposed) dispatch(canvasActions.hydrate(snapshot));
            },
            (error: unknown) => {
              onError({ code: "persistence-load", message: "The saved canvas layout could not be read.", detail: error });
              if (!disposed) dispatch(canvasActions.hydrate(null));
            },
          );
      }

      return () => {
        disposed = true;
        unsubscribe();
        if (timer) {
          clearTimeout(timer);
          save();
        }
      };
    },
  };
  return controller;
}
