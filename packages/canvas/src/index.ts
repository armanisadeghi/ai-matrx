/**
 * @ai-matrx/canvas — framework-free core.
 *
 * The state, reducer, identity rules, persistence and controller. No React,
 * no DOM at import time. The React layer lives at `@ai-matrx/canvas/react`.
 */

export * from "./core/types";
export { canvasItemId, parseCanvasItemId, findNonJson, isCanvasJson } from "./core/ids";
export { listPaneIds, normalizeSizes } from "./core/layout";
export {
  canvasReducer,
  canvasActions,
  createInitialCanvasState,
  isCanvasAction,
  sanitizeCanvasSnapshot,
  type CanvasAction,
} from "./core/reducer";
export {
  createCanvasStore,
  bindCanvasToReduxStore,
  type CanvasStoreBinding,
  type ReduxStoreLike,
} from "./core/store";
export {
  createLocalStorageCanvasPersistence,
  toPersistableSnapshot,
  CANVAS_STORAGE_KEY,
  type CanvasPersistencePort,
} from "./core/persistence";
export {
  createCanvasController,
  consoleCanvasErrorSink,
  type CanvasController,
  type CanvasControllerOptions,
  type CanvasErrorReport,
  type CanvasErrorSink,
} from "./core/controller";
export * from "./core/selectors";
