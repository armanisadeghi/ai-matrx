/**
 * components/dialogs/sandbox-gate/sandboxGateOpener.ts
 *
 * Pure-TS imperative API for the sandbox pre-send gate dialog. Zero React,
 * zero dialog markup — statically importable from anywhere (Redux thunks
 * especially). Resolves a THREE-value choice rather than a boolean, because
 * the gate offers three distinct actions:
 *
 *   • "attach"  — the user attached / re-selected a live sandbox in the
 *                 embedded panel and wants to retry the send with it.
 *   • "detach"  — send WITHOUT a sandbox (the binding is cleared downstream).
 *   • "cancel"  — go back; the send is aborted and the composer text is kept.
 *
 * THE MACHINERY IS NOT OURS. The host registry, the request queue, the
 * pre-hydration queueing, the never-a-silent-default promise and the
 * globalThis slot all come from `@ai-matrx/kit/opener` — one implementation
 * for the whole platform. This file used to hand-roll every one of them in a
 * module-level `let host` + `const queue`, which is the dual-loader-graph
 * hazard the package documents: state that silently splits host registration
 * from its callers. Never re-implement it here.
 */

import { createOpener } from "@ai-matrx/kit/opener";

export type SandboxGateChoice = "attach" | "detach" | "cancel";

export interface SandboxGateOptions {
  conversationId: string;
}

export const sandboxGateOpener = createOpener<SandboxGateOptions, SandboxGateChoice>(
  "matrx-frontend.sandbox-gate-opener-state",
  {
    hostHint: "<SandboxGateHost /> (mounted once in app/Providers.tsx)",
    // One gate per conversation: a double-fired send must not stack a second
    // dialog on top of the first — both sends await the one answer.
    dedupeKey: (opts) => opts.conversationId,
  },
);

/**
 * Open the sandbox gate. Resolves with the user's choice. Dismissing the
 * dialog (Esc / backdrop / X) resolves `"cancel"` so a stray dismiss never
 * sends.
 */
export function openSandboxGate(
  opts: SandboxGateOptions,
): Promise<SandboxGateChoice> {
  return sandboxGateOpener.open(opts);
}
