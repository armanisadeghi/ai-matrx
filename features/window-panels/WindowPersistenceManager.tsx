"use client";

/**
 * Window persistence — the thin SHELL.
 *
 * This file is statically imported by `app/Providers.tsx` (and
 * `PublicProviders.tsx`), i.e. it sits in the static dep graph of EVERY
 * route entry. Therefore it holds ONLY the contract: the context object,
 * the `useWindowPersistence` hook, the value type, and the `next/dynamic`
 * (ssr: false) boundary to `WindowPersistenceCore.tsx` — which carries the
 * whole persistence graph (registry metadata, serialization, popout, local
 * session store) as its own client chunk.
 *
 * The provider element renders IMMEDIATELY with the inert default value, so
 * `children` mount at once and never remount; the core is a null-rendering
 * sibling inside the provider that publishes the live value up via
 * `onValue` when it mounts. Pre-core semantics are safe by construction:
 * no window can exist before the core hydrates them, so the inert
 * `getSessionId`/`saveWindow`/`closeWindow` can never drop a real call.
 *
 * Do NOT add value imports from the persistence/registry side here —
 * `import type` only. That is the entire point of this file.
 */

import dynamic from "next/dynamic";
import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { OverlayId } from "./registry/overlay-ids";
import type { PanelState } from "./registry/windowRegistryMetadata";

const WindowPersistenceCore = dynamic(
  () => import("./WindowPersistenceCore"),
  { ssr: false, loading: () => null },
);

export interface WindowPersistenceContextValue {
  getSessionId: (
    overlayId: OverlayId,
    instanceId?: string,
  ) => string | undefined;
  saveWindow: (
    overlayId: OverlayId,
    panelState: PanelState,
    data: Record<string, unknown>,
    onSaved?: (sessionId: string) => void,
    instanceId?: string,
  ) => void;
  closeWindow: (overlayId: OverlayId, instanceId?: string) => void;
  /** True after this identity/workspace has produced a hit or a confirmed miss. */
  hydrated: boolean;
}

const INERT_VALUE: WindowPersistenceContextValue = {
  getSessionId: () => undefined,
  saveWindow: () => undefined,
  closeWindow: () => undefined,
  hydrated: false,
};

const WindowPersistenceContext =
  createContext<WindowPersistenceContextValue>(INERT_VALUE);

export function useWindowPersistence(): WindowPersistenceContextValue {
  return useContext(WindowPersistenceContext);
}

interface WindowPersistenceManagerProps {
  children: ReactNode;
}

export function WindowPersistenceManager({
  children,
}: WindowPersistenceManagerProps) {
  const [live, setLive] = useState<WindowPersistenceContextValue | null>(null);

  return (
    <WindowPersistenceContext.Provider value={live ?? INERT_VALUE}>
      <WindowPersistenceCore onValue={setLive} />
      {children}
    </WindowPersistenceContext.Provider>
  );
}
