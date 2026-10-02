"use client";

/**
 * React reads of the windows port (CPM-009c, slice P18). Each hook subscribes
 * through the port, so the package never reads the host's overlay or window
 * manager state. A host without `isOpen` / `managedWindowKeys` reports nothing
 * open and no managed windows — true, because it hosts none.
 */

import { useSyncExternalStore } from "react";
import type { ChatWindowsPort } from "./contract";
import { useMaybeChatHost } from "./react";
import { chatWindowsPort, type ChatWindowId } from "./windows";

function noSubscription(): () => void {
  return () => {};
}

function subscribeTo(windows: ChatWindowsPort) {
  return (listener: () => void) =>
    windows.subscribe ? windows.subscribe(listener) : noSubscription();
}

/**
 * The windows port of the nearest chat host; outside a <ChatProvider>, the
 * configured host's, else the stand-in that opens nothing and says so.
 */
export function useChatWindows(): ChatWindowsPort {
  return useMaybeChatHost()?.windows ?? chatWindowsPort();
}

/** True while that window instance is open in the host. */
export function useIsChatWindowOpen(
  id: ChatWindowId,
  instanceId?: string,
): boolean {
  const windows = useChatWindows();
  return useSyncExternalStore(
    subscribeTo(windows),
    () => windows.isOpen?.(id, instanceId) ?? false,
    () => false,
  );
}

/** True while the host's window manager holds a window with this key. */
export function useHasChatManagedWindow(key: string): boolean {
  const windows = useChatWindows();
  return useSyncExternalStore(
    subscribeTo(windows),
    () => windows.managedWindowKeys?.().includes(key) ?? false,
    () => false,
  );
}

/** How many windows the host's window manager holds whose key starts with `prefix`. */
export function useChatManagedWindowCount(prefix: string): number {
  const windows = useChatWindows();
  return useSyncExternalStore(
    subscribeTo(windows),
    () =>
      windows.managedWindowKeys?.().filter((key) => key.startsWith(prefix))
        .length ?? 0,
    () => 0,
  );
}
