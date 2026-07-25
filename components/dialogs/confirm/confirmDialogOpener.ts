/**
 * components/dialogs/confirm/confirmDialogOpener.ts
 *
 * Pure-TS imperative API for the global confirm dialog. Zero React, zero
 * dialog markup — this module is statically importable from anywhere
 * (hooks, utils, Redux thunks, async handlers, sync code, server-passed
 * client data, anything).
 *
 * The host (`ConfirmDialogHostImpl`) registers a controller on mount and
 * unregisters on unmount. Calls made before the host has hydrated queue
 * up and resolve as soon as the host is alive — so a destructive action
 * triggered in the first ~50ms after page load still gets a real
 * confirmation, never a silent default-yes/no.
 *
 * One dialog at a time: concurrent calls queue and present sequentially.
 *
 * See `ConfirmDialogHost.tsx` for the slim shell that mounts the host
 * via `next/dynamic`. See `CLAUDE.md` "Browser dialogs are BANNED".
 */

import type { ReactNode } from "react";

export interface ConfirmOptions {
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  /** `null` hides the cancel button (acknowledge-only dialogs). */
  cancelLabel?: string | null;
  variant?: "default" | "destructive";
}

type Resolver = (confirmed: boolean) => void;

interface PendingRequest {
  opts: ConfirmOptions;
  resolve: Resolver;
}

interface HostController {
  show: (opts: ConfirmOptions, resolve: Resolver) => void;
}

let host: HostController | null = null;
const queue: PendingRequest[] = [];

/** @internal Called by `ConfirmDialogHostImpl` on mount. */
export function _registerHost(controller: HostController): void {
  host = controller;
  while (queue.length > 0) {
    const next = queue.shift()!;
    controller.show(next.opts, next.resolve);
  }
}

/** @internal Called by `ConfirmDialogHostImpl` on unmount. */
export function _unregisterHost(controller: HostController): void {
  if (host === controller) host = null;
}

/**
 * Imperative confirm. Returns a Promise that resolves `true` if the user
 * confirms, `false` if they cancel/dismiss. Replaces `window.confirm`.
 *
 * @example
 *   const ok = await confirm({
 *     title: "Delete sandbox",
 *     description: "This cannot be undone.",
 *     variant: "destructive",
 *     confirmLabel: "Delete",
 *   });
 *   if (!ok) return;
 */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (host) {
      host.show(opts, resolve);
    } else {
      queue.push({ opts, resolve });
    }
  });
}
