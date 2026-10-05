/** The feature knob holding a person's preferred chat model (`agents.model_prefs.chat_default_model`). */
export const CHAT_DEFAULT_MODEL_KNOB = "agents.model_prefs.chat_default_model";

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";

/** The mandate doors whose "no model picked" answer is this preference. */
const BASIC_WORK_MANDATE_KEYS: ReadonlySet<string> = new Set([
  MANDATE_KEYS.chat__default_new_chat,
]);

export function isBasicWorkMandate(mandateKey: string | undefined): boolean {
  return Boolean(mandateKey && BASIC_WORK_MANDATE_KEYS.has(mandateKey));
}
