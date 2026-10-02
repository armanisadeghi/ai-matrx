/**
 * THE canvas kind registry. A kind is one sort of thing the canvas can show —
 * an artifact, a document, a chat, a notification feed. Any feature adds a
 * kind with ONE call and never touches canvas code:
 *
 *   registerCanvasKind(defineCanvasKind<{ noteId: string }>({
 *     id: "note",
 *     label: "Note",
 *     icon: NoteIcon,
 *     load: () => import("./NoteCanvasView"),
 *     title: (data) => data.noteId,
 *   }));
 *
 * The registry lives on globalThis under a Symbol.for key so duplicated
 * bundles (ESM + CJS, two chunks) share ONE registry.
 */

import type { ComponentType, ReactNode } from "react";
import type { CanvasController, CanvasItem, CanvasJson, CanvasPaneId } from "../index";

export interface CanvasKindProps<TData extends CanvasJson = CanvasJson> {
  readonly item: CanvasItem;
  readonly data: TData;
  readonly paneId: CanvasPaneId;
  readonly isFocused: boolean;
  readonly canvas: CanvasController;
}

export interface CanvasMenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly onSelect: () => void;
  readonly destructive?: boolean;
}

export interface CanvasKind<TData extends CanvasJson = CanvasJson> {
  readonly id: string;
  /** Singular noun shown in menus and the empty-pane launcher. */
  readonly label: string;
  readonly icon: ComponentType<{ className?: string }>;
  /** Eager component. Provide this OR `load`. */
  readonly component?: ComponentType<CanvasKindProps<TData>>;
  /** Lazy component — the kind's code loads only when a tab of it renders. */
  readonly load?: () => Promise<{ default: ComponentType<CanvasKindProps<TData>> }>;
  /** Tab title from the item's data. Falls back to the item's title, then `label`. */
  readonly title?: (data: TData, item: CanvasItem) => string;
  /** Comes back after a reload. Default true; false for live sessions that cannot resume. */
  readonly restore?: boolean;
  /** Stays mounted while its tab is in the background (live chat, a running tool). */
  readonly keepAlive?: boolean;
  /** When set, the kind is offered in an empty pane's launcher. */
  readonly launcher?: { readonly key: string; readonly data: TData; readonly title?: string };
  /** The kind's own button, rendered left of the pane's "…" menu. */
  readonly HeaderAction?: ComponentType<CanvasKindProps<TData>>;
  /** Kind-specific entries for the pane's "…" menu. */
  readonly menuItems?: (props: CanvasKindProps<TData>) => readonly CanvasMenuItem[];
}

/** Erased form stored in the registry. */
export type AnyCanvasKind = CanvasKind<CanvasJson>;

/**
 * Typed authoring helper. The data type is a promise the kind's opener keeps;
 * the registry stores the erased form (the cast is the one registration seam).
 */
export function defineCanvasKind<TData extends CanvasJson>(kind: CanvasKind<TData>): AnyCanvasKind {
  if (!kind.component && !kind.load) {
    throw new Error(`[@ai-matrx/canvas] kind "${kind.id}" needs a component or a load().`);
  }
  return kind as unknown as AnyCanvasKind;
}

interface RegistryState {
  kinds: Map<string, AnyCanvasKind>;
  listeners: Set<() => void>;
  version: number;
}

const REGISTRY = Symbol.for("ai-matrx.canvas.kinds");

function registry(): RegistryState {
  const g = globalThis as unknown as { [REGISTRY]?: RegistryState };
  g[REGISTRY] ??= { kinds: new Map(), listeners: new Set(), version: 0 };
  return g[REGISTRY];
}

function notify(state: RegistryState) {
  state.version += 1;
  for (const listener of [...state.listeners]) listener();
}

/** Registers (or replaces) a kind. Returns an unregister function. */
export function registerCanvasKind(kind: AnyCanvasKind): () => void {
  const state = registry();
  state.kinds.set(kind.id, kind);
  notify(state);
  return () => {
    if (state.kinds.get(kind.id) === kind) {
      state.kinds.delete(kind.id);
      notify(state);
    }
  };
}

export function registerCanvasKinds(kinds: readonly AnyCanvasKind[]): () => void {
  const undo = kinds.map(registerCanvasKind);
  return () => undo.forEach((fn) => fn());
}

export function getCanvasKind(id: string): AnyCanvasKind | undefined {
  return registry().kinds.get(id);
}

export function listCanvasKinds(): AnyCanvasKind[] {
  return [...registry().kinds.values()];
}

export function subscribeCanvasKinds(listener: () => void): () => void {
  const state = registry();
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

export function getCanvasKindsVersion(): number {
  return registry().version;
}
