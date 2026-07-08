/**
 * components/dialogs/sandbox-gate/sandboxGateOpener.ts
 *
 * Pure-TS imperative API for the sandbox pre-send gate dialog. Zero React, zero
 * dialog markup — statically importable from anywhere (Redux thunks especially).
 * Mirrors `confirmDialogOpener.ts`, but resolves a THREE-value choice instead of
 * a boolean, because the gate offers three distinct actions:
 *
 *   • "attach"  — the user attached / re-selected a live sandbox in the embedded
 *                 panel and wants to retry the send with it.
 *   • "detach"  — send WITHOUT a sandbox (the binding is cleared downstream).
 *   • "cancel"  — go back; the send is aborted and the composer text is kept.
 *
 * The host (`SandboxGateHostImpl`) registers a controller on mount. Calls made
 * before the host hydrates queue and resolve once it's alive. One dialog at a
 * time — concurrent calls queue and present sequentially.
 */

export type SandboxGateChoice = "attach" | "detach" | "cancel";

export interface SandboxGateOptions {
  conversationId: string;
}

type Resolver = (choice: SandboxGateChoice) => void;

interface PendingRequest {
  opts: SandboxGateOptions;
  resolve: Resolver;
}

interface HostController {
  show: (opts: SandboxGateOptions, resolve: Resolver) => void;
}

let host: HostController | null = null;
const queue: PendingRequest[] = [];

/** @internal Called by `SandboxGateHostImpl` on mount. */
export function _registerHost(controller: HostController): void {
  host = controller;
  while (queue.length > 0) {
    const next = queue.shift()!;
    controller.show(next.opts, next.resolve);
  }
}

/** @internal Called by `SandboxGateHostImpl` on unmount. */
export function _unregisterHost(controller: HostController): void {
  if (host === controller) host = null;
}

/**
 * Open the sandbox gate. Resolves with the user's choice. Dismissing the dialog
 * (Esc / backdrop / X) resolves `"cancel"` so a stray dismiss never sends.
 */
export function openSandboxGate(
  opts: SandboxGateOptions,
): Promise<SandboxGateChoice> {
  return new Promise<SandboxGateChoice>((resolve) => {
    if (host) {
      host.show(opts, resolve);
    } else {
      queue.push({ opts, resolve });
    }
  });
}
