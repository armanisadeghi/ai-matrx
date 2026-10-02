"use client";

/**
 * @ai-matrx/canvas/react — the canvas column, panes, tabs, toggle, provider,
 * hooks and the kind registry. Import `@ai-matrx/canvas/styles.css` once.
 */

export {
  CanvasProvider,
  useCanvas,
  useOptionalCanvas,
  useCanvasState,
  useOptionalCanvasState,
  useCanvasIsPresented,
  useCanvasKinds,
  useCanvasKind,
  useCanvasHostPorts,
  type CanvasProviderProps,
  type CanvasHostPorts,
} from "./react/provider";
export {
  defineCanvasKind,
  registerCanvasKind,
  registerCanvasKinds,
  getCanvasKind,
  listCanvasKinds,
  type CanvasKind,
  type CanvasKindProps,
  type CanvasMenuItem,
  type AnyCanvasKind,
} from "./react/registry";
export { CanvasColumn, CanvasFrame, CanvasToggle, useCanvasColumnWidth, type CanvasColumnProps } from "./react/CanvasColumn";
export { CanvasPaneView, itemTitle } from "./react/CanvasPane";
