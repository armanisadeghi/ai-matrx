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
 * half. Recipe: `features/agents/mandates/FEATURE.md`.
 *
 * Adding a job = declare the mandate in aidream
 * `services/mandates/client_mandates.py`, then add its key here.
 */

export const SYSTEM_AGENT_MANDATES = {
  "prompt-app-auto-create": "agent_apps.auto_create",
  "prompt-app-auto-create-lightning": "agent_apps.auto_create_lightning",
  "prompt-app-metadata-generator": "agent_apps.metadata",
  "prompt-app-ui-editor": "code_editor.prompt_app_ui_edit",
  "generic-code-editor": "code_editor.code_edit",
  "code-editor-dynamic-context": "code_editor.dynamic_context_edit",
  "matrix-custom-chat": "chat.cx_default",
  "tool-ui-component-generator": "tool_viz.component_generator",
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
