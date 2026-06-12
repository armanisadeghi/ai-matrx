/**
 * components/dialogs/value-prompts/valuePromptsOpener.ts
 *
 * Pure-TS imperative API for the global "fill in these values" dialog —
 * the runtime face of `prompt_user` value mappings. Zero React, zero dialog
 * markup; statically importable from thunks, hooks, and async handlers.
 *
 * Same host/queue contract as `confirm` (see confirm/confirmDialogOpener.ts):
 * the host registers on mount; calls made before hydration queue and resolve
 * once the host is alive. One dialog at a time; concurrent calls queue.
 */

export interface ValuePromptField {
  /** Target name on the agent (variable or context-slot key). */
  name: string;
  /** Prompt text shown above the input. */
  prompt: string;
  /** Optional pre-filled value (string forms render in the input). */
  defaultValue?: unknown;
  /** Required fields block submission while empty; the dialog cannot be cancelled when any field is required. */
  required?: boolean;
}

export interface ValuePromptsRequest {
  /** Dialog title — typically the shortcut/agent label. */
  title: string;
  fields: ValuePromptField[];
}

/** null = user cancelled (only possible when no field is required). */
type Resolver = (answers: Record<string, string> | null) => void;

interface PendingRequest {
  req: ValuePromptsRequest;
  resolve: Resolver;
}

interface HostController {
  show: (req: ValuePromptsRequest, resolve: Resolver) => void;
}

let host: HostController | null = null;
const queue: PendingRequest[] = [];

/** @internal Called by `ValuePromptsDialogHostImpl` on mount. */
export function _registerHost(controller: HostController): void {
  host = controller;
  while (queue.length > 0) {
    const next = queue.shift()!;
    controller.show(next.req, next.resolve);
  }
}

/** @internal Called by `ValuePromptsDialogHostImpl` on unmount. */
export function _unregisterHost(controller: HostController): void {
  if (host === controller) host = null;
}

/**
 * Imperative multi-value prompt. Resolves with `{ name: answer }` on submit,
 * or `null` when the user cancels (cancel is offered only when no field is
 * required).
 */
export function promptForValues(
  req: ValuePromptsRequest,
): Promise<Record<string, string> | null> {
  return new Promise<Record<string, string> | null>((resolve) => {
    if (host) {
      host.show(req, resolve);
    } else {
      queue.push({ req, resolve });
    }
  });
}
