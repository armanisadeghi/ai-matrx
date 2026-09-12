/**
 * components/dialogs/value-prompts/valuePromptsOpener.ts
 *
 * Pure-TS imperative API for the global "fill in these values" dialog — the
 * runtime face of `prompt_user` value mappings. Zero React, zero dialog
 * markup; statically importable from thunks, hooks and async handlers.
 *
 * THE MACHINERY IS NOT OURS. The host registry, the request queue, the
 * pre-hydration queueing and the never-a-silent-default promise come from
 * `@ai-matrx/kit/opener` — the same engine behind `confirm()`. This file used
 * to hand-roll them in module-level state, which silently splits host
 * registration from its callers across loader graphs. Never re-implement it
 * here.
 */

import { createOpener } from "@ai-matrx/kit/opener";

export interface ValuePromptField {
  /** Target name on the agent (variable or context-policy key). */
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

/** `null` = user cancelled (only possible when no field is required). */
export type ValuePromptsAnswers = Record<string, string> | null;

export const valuePromptsOpener = createOpener<
  ValuePromptsRequest,
  ValuePromptsAnswers
>("matrx-frontend.value-prompts-opener-state", {
  hostHint: "<ValuePromptsDialogHost /> (mounted once in app/Providers.tsx)",
});

/**
 * Imperative multi-value prompt. Resolves with `{ name: answer }` on submit,
 * or `null` when the user cancels (cancel is offered only when no field is
 * required).
 */
export function promptForValues(
  req: ValuePromptsRequest,
): Promise<ValuePromptsAnswers> {
  return valuePromptsOpener.open(req);
}
