"use client";

/**
 * The web app's `WindowPort` (Preparation parity PP-01a): a preparation session is drawn in a
 * real `WindowPanel` — non-blocking, movable, resizable, minimizable, several at once. The render
 * function travels as a live closure (never overlay `Json`), so each window's session keeps its
 * functions, subscriptions and sealed artifacts.
 *
 * Inline-managed panels (`onClose`, no `overlayId`): window persistence never restores a window
 * whose live session is gone after a reload.
 *
 * Boot-safe: this file is in the root provider graph, so `WindowPanel` (a window-panel core file)
 * loads lazily in `AlchemyWindowFrames.tsx` the first time a window opens — never in the boot
 * bundle (features/window-panels lazy-bundle-guard).
 */

import { lazy, Suspense, useSyncExternalStore } from "react";
import type { WindowHandle, WindowOpenOptions, WindowPort } from "@ai-matrx/alchemy/ports";

export type OpenWindow = {
  handle: WindowHandle;
  title: string;
  size: WindowOpenOptions["size"];
  render: (window: WindowHandle) => unknown;
  onClose: (() => void) | undefined;
};

export interface AlchemyWindowController {
  port: WindowPort;
  windows(): readonly OpenWindow[];
  subscribe(listener: () => void): () => void;
}

/** The window-manager id a session's panel registers under (focus is addressed by it). */
export const alchemyPanelId = (instanceId: string) => `alchemy-prepare-${instanceId}`;

export function createAlchemyWindowController(options: {
  /** Bring a registered panel to the front (the window manager's `focusWindow`). */
  focusPanel: (panelId: string) => void;
}): AlchemyWindowController {
  let open: readonly OpenWindow[] = [];
  let sequence = 0;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());

  const close = (instanceId: string) => {
    const closing = open.find((w) => w.handle.instanceId === instanceId);
    if (!closing) return;
    open = open.filter((w) => w !== closing);
    emit();
    closing.onClose?.();
  };

  const port: WindowPort = {
    presentation: "window",
    multiInstance: true,
    open(render, opts) {
      const existing = opts.instanceId === undefined ? undefined : open.find((w) => w.handle.instanceId === opts.instanceId);
      if (existing) {
        open = open.map((w) => (w === existing ? { ...w, render, title: opts.title, size: opts.size, onClose: opts.onClose } : w));
        emit();
        options.focusPanel(alchemyPanelId(existing.handle.instanceId));
        return existing.handle;
      }
      const instanceId = opts.instanceId ?? `session-${Date.now().toString(36)}-${++sequence}`;
      const handle: WindowHandle = {
        instanceId,
        close: () => close(instanceId),
        focus: () => {
          if (open.some((w) => w.handle.instanceId === instanceId)) options.focusPanel(alchemyPanelId(instanceId));
        },
        isOpen: () => open.some((w) => w.handle.instanceId === instanceId),
      };
      open = [...open, { handle, title: opts.title, size: opts.size, render, onClose: opts.onClose }];
      emit();
      return handle;
    },
  };

  return {
    port,
    windows: () => open,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const NONE: readonly OpenWindow[] = [];
const AlchemyWindowFrames = lazy(() => import("./AlchemyWindowFrames"));

/** Draws every open preparation window. Mounted once inside `AlchemyHost`. */
export function AlchemyWindowHost({ controller }: { controller: AlchemyWindowController }) {
  const windows = useSyncExternalStore(controller.subscribe, controller.windows, () => NONE);
  if (windows.length === 0) return null;
  return (
    <Suspense fallback={null}>
      <AlchemyWindowFrames windows={windows} />
    </Suspense>
  );
}
