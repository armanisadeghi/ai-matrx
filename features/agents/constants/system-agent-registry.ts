import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";

/**
 * System agent registry — builtin KEY → MANDATE KEY.
 *
 * 🚨 No agent ids live here. Each legacy builtin key (the `builtinKey` the
 * `executeBuiltinWith*Extraction` thunks accept) names a JOB; the database
 * (`agent.mandate` → system default, or the caller's own binding) decides
 * which agent runs it. Launches pass the mandate key into
 * `launchAgentExecution({ mandateKey })` / `runHeadlessAgentJson({ mandateKey })`
 * so BOTH halves of the binding (agent AND `config_overrides`) apply —
 * resolving here and passing an agent id would silently drop the settings
 * half. Recipe: `features/mandates/FEATURE.md`.
 *
 * Adding a job = declare the mandate in aidream
 * `services/mandates/client_mandates.py`, then add its key here.
 */

export const SYSTEM_AGENT_MANDATES = {
  "prompt-app-auto-create": MANDATE_KEYS.agent_apps__auto_create,
  "prompt-app-auto-create-lightning": MANDATE_KEYS.agent_apps__auto_create_lightning,
  "prompt-app-metadata-generator": MANDATE_KEYS.agent_apps__metadata,
  "prompt-app-ui-editor": MANDATE_KEYS.code_editor__prompt_app_ui_edit,
  "generic-code-editor": MANDATE_KEYS.code_editor__code_edit,
  "code-editor-dynamic-context": MANDATE_KEYS.code_editor__dynamic_context_edit,
  "matrix-custom-chat": MANDATE_KEYS.chat__cx_default,
  "tool-ui-component-generator": MANDATE_KEYS.tool_viz__component_generator,
} as const satisfies Record<string, string>;

export type SystemAgentKey = keyof typeof SYSTEM_AGENT_MANDATES;

export function isSystemAgentKey(key: string): key is SystemAgentKey {
  return Object.prototype.hasOwnProperty.call(SYSTEM_AGENT_MANDATES, key);
}

/** The mandate key for a builtin key. Throws loudly on an unknown key. */
export function mandateKeyForBuiltin(key: string): string {
  if (!isSystemAgentKey(key)) {
    throw new Error(
      `Unknown system agent key: "${key}". Valid keys: ${Object.keys(SYSTEM_AGENT_MANDATES).join(", ")}`,
    );
  }
  return SYSTEM_AGENT_MANDATES[key];
}
