/**
 * components/dialogs/clipboard-fallback/manualCopyOpener.ts
 *
 * Pure-TS imperative API for the global manual-copy dialog — the last
 * resort when `navigator.clipboard` refuses to write (restricted iframe,
 * embedded browser, permission policy, non-HTTPS). Mirrors
 * `confirmDialogOpener.ts` exactly: zero React, statically importable
 * from anywhere, calls made before the host hydrates queue up and show
 * as soon as the host is alive.
 *
 * The contract with callers: a copy that lands here has NOT happened.
 * Never toast "Copied" and never flip a copied state — the dialog puts
 * the text in front of the user, selected, and the copy is theirs.
 *
 * See `ClipboardFallbackHost.tsx` for the slim shell that mounts the
 * host, and `markdown-copy-utils.ts` → `copyToClipboard` for the ONE
 * copy primitive that routes its terminal failure here.
 */

export interface ManualCopyOptions {
  /** The text the user needs on their clipboard. */
  text: string;
  title?: string;
  description?: string;
}

interface HostController {
  show: (opts: ManualCopyOptions) => void;
}

let host: HostController | null = null;
const queue: ManualCopyOptions[] = [];

/** @internal Called by `ClipboardFallbackHostImpl` on mount. */
export function _registerManualCopyHost(controller: HostController): void {
  host = controller;
  while (queue.length > 0) controller.show(queue.shift()!);
}

/** @internal Called by `ClipboardFallbackHostImpl` on unmount. */
export function _unregisterManualCopyHost(controller: HostController): void {
  if (host === controller) host = null;
}

/**
 * Put text in front of the user for a manual Cmd/Ctrl+C. Fire-and-forget:
 * there is nothing to await, because whether the user copies is theirs.
 */
export function showManualCopy(opts: ManualCopyOptions): void {
  if (!opts.text) return;
  if (host) host.show(opts);
  else queue.push(opts);
}
