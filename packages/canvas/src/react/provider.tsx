"use client";

/**
 * CanvasProvider — binds a store, starts persistence, wires the hotkey, and
 * hands every descendant the ONE controller. A host adds it once at its root.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  createCanvasController,
  createCanvasStore,
  createLocalStorageCanvasPersistence,
  type CanvasController,
  type CanvasErrorSink,
  type CanvasItem,
  type CanvasPersistencePort,
  type CanvasState,
  type CanvasStoreBinding,
} from "../index";
import {
  getCanvasKind,
  getCanvasKindsVersion,
  listCanvasKinds,
  subscribeCanvasKinds,
  type AnyCanvasKind,
  type CanvasMenuItem,
} from "./registry";

/**
 * Host capabilities that apply to EVERY kind — this is how saving, sharing and
 * history are "handled globally": the host answers them once, here, and every
 * item that qualifies gets the entries in its "…" menu.
 */
export interface CanvasHostPorts {
  /** Extra "…" menu entries for an item (share, save to cloud, version history…). */
  readonly itemActions?: (item: CanvasItem, kind: AnyCanvasKind | undefined) => readonly CanvasMenuItem[];
  /** Pops an item out into a floating window. Absent ⇒ no "Pop out" entry. */
  readonly popOut?: (item: CanvasItem) => void;
}

interface CanvasContextValue {
  readonly controller: CanvasController;
  readonly ports: CanvasHostPorts;
}

const CanvasContext = createContext<CanvasContextValue | null>(null);

export interface CanvasProviderProps extends CanvasHostPorts {
  readonly children: ReactNode;
  /** A Redux-bound store (bindCanvasToReduxStore). Omit for a standalone store. */
  readonly store?: CanvasStoreBinding;
  /** `null` turns memory off. Default: localStorage. */
  readonly persistence?: CanvasPersistencePort | null;
  readonly onError?: CanvasErrorSink;
  /** ⌘\ / Ctrl+\ toggles the canvas; Escape leaves full screen. Default true. */
  readonly hotkeys?: boolean;
}

export function CanvasProvider({
  children,
  store,
  persistence,
  onError,
  hotkeys = true,
  itemActions,
  popOut,
}: CanvasProviderProps) {
  const [controller] = useState(() =>
    createCanvasController({
      store: store ?? createCanvasStore(),
      persistence: persistence === undefined ? createLocalStorageCanvasPersistence() : persistence,
      isRestorable: (kind) => getCanvasKind(kind)?.restore !== false,
      onError,
    }),
  );

  useEffect(() => controller.start(), [controller]);

  useEffect(() => {
    if (!hotkeys) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "\\" && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        controller.toggle();
      } else if (event.key === "Escape" && controller.getState().isFullscreen) {
        controller.setFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [controller, hotkeys]);

  const ports: CanvasHostPorts = {
    ...(itemActions ? { itemActions } : {}),
    ...(popOut ? { popOut } : {}),
  };

  return <CanvasContext.Provider value={{ controller, ports }}>{children}</CanvasContext.Provider>;
}

function useCanvasContext(): CanvasContextValue {
  const value = useContext(CanvasContext);
  if (!value) throw new Error("[@ai-matrx/canvas] useCanvas* must be used inside <CanvasProvider>.");
  return value;
}

/** The controller: open, close, toggle, split… */
export function useCanvas(): CanvasController {
  return useCanvasContext().controller;
}

/** Same as useCanvas, but null outside a provider (for components that may render anywhere). */
export function useOptionalCanvas(): CanvasController | null {
  return useContext(CanvasContext)?.controller ?? null;
}

export function useCanvasHostPorts(): CanvasHostPorts {
  return useCanvasContext().ports;
}

/** Subscribes to a slice of canvas state. The selector must return stable values. */
export function useCanvasState<T>(selector: (state: CanvasState) => T): T {
  const { store } = useCanvasContext().controller;
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
}

const NO_SUBSCRIPTION = () => () => undefined;

/**
 * Like useCanvasState, but safe outside a provider: returns `fallback` there.
 * For components that may render in a tree with no canvas (a bare test, an
 * embed). `fallback` must be referentially stable (a primitive or null).
 */
export function useOptionalCanvasState<T>(selector: (state: CanvasState) => T, fallback: T): T {
  const store = useContext(CanvasContext)?.controller.store;
  const read = () => (store ? selector(store.getState()) : fallback);
  return useSyncExternalStore(store ? store.subscribe : NO_SUBSCRIPTION, read, read);
}

/** Re-renders when kinds register, so late-registered kinds appear. */
export function useCanvasKinds(): readonly AnyCanvasKind[] {
  useSyncExternalStore(subscribeCanvasKinds, getCanvasKindsVersion, getCanvasKindsVersion);
  return listCanvasKinds();
}

export function useCanvasKind(id: string): AnyCanvasKind | undefined {
  useSyncExternalStore(subscribeCanvasKinds, getCanvasKindsVersion, getCanvasKindsVersion);
  return getCanvasKind(id);
}
