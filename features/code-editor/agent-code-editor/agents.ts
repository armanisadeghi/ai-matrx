/**
 * Code-editor agent configs — MANDATE KEYS, never agent ids.
 *
 * The code editor names WHICH JOB it is running (a `mandate_key`); the DATABASE
 * decides which agent runs it (`agent.mandate` → system default, or the user's
 * own binding). Every launch resolves the key at run time through the ONE
 * launch funnel — `launchAgentExecution({ mandateKey })` /
 * `useAgentLauncher().launchMandate` — which applies BOTH halves of the binding
 * (agent AND `config_overrides`). Resolving a key yourself and passing the agent
 * id into a launch silently drops the settings half; never do that. Recipe:
 * `features/agents/mandates/FEATURE.md` §"Migrating a hardcoded call site".
 *
 * All three mandates share provision `code_editor.session`, which offers
 * `current_code` + `dynamic_context`; `codeVariableKey` names which of those
 * the editor seeds on the first turn (the binding's consumption map decides what
 * the bound agent actually consumes).
 *
 * **A raw agent UUID in this file is a defect.** Need a fourth editing job?
 * Declare a mandate in aidream `services/mandates/client_mandates.py`, then add
 * its key here.
 */
import type { CodeEditorAgentConfig } from "./types";

export const GENERIC_CODE_EDITOR_AGENT: CodeEditorAgentConfig = {
  mandateKey: "code_editor.code_edit",
  name: "Code Editor",
  codeVariableKey: "current_code",
};

export const PROMPT_APP_UI_EDITOR_AGENT: CodeEditorAgentConfig = {
  mandateKey: "code_editor.prompt_app_ui_edit",
  name: "Prompt App Code Editor",
  codeVariableKey: "current_code",
};

export const DYNAMIC_CONTEXT_CODE_EDITOR_AGENT: CodeEditorAgentConfig = {
  mandateKey: "code_editor.dynamic_context_edit",
  name: "Code Editor (Dynamic Context)",
  codeVariableKey: "dynamic_context",
};

/** Every code-editor mandate, generic first. */
export const CODE_EDITOR_AGENTS: CodeEditorAgentConfig[] = [
  GENERIC_CODE_EDITOR_AGENT,
  PROMPT_APP_UI_EDITOR_AGENT,
  DYNAMIC_CONTEXT_CODE_EDITOR_AGENT,
];

/** Default picker roster: prompt-app first when invoked from a prompt-app. */
export const PROMPT_APP_AGENT_PICKER: CodeEditorAgentConfig[] = [
  PROMPT_APP_UI_EDITOR_AGENT,
  GENERIC_CODE_EDITOR_AGENT,
];

/** Default picker roster: generic first when invoked from a generic editor. */
export const GENERIC_AGENT_PICKER: CodeEditorAgentConfig[] = [
  GENERIC_CODE_EDITOR_AGENT,
  PROMPT_APP_UI_EDITOR_AGENT,
];

/** The legacy `promptKey` strings older call sites still pass. */
export type CodeEditorPromptKey =
  | "prompt-app-ui-editor"
  | "generic-code-editor"
  | "code-editor-dynamic-context";

/**
 * Lookup by legacy `promptKey` (e.g. "prompt-app-ui-editor") OR by mandate key.
 * Unknown values fall back to the generic editor (the same posture the old
 * lookup had) — the mandate itself is still resolved loudly at launch.
 */
export function agentForPromptKey(
  keyOrMandateKey: string | undefined,
): CodeEditorAgentConfig {
  switch (keyOrMandateKey) {
    case "prompt-app-ui-editor":
    case PROMPT_APP_UI_EDITOR_AGENT.mandateKey:
      return PROMPT_APP_UI_EDITOR_AGENT;
    case "code-editor-dynamic-context":
    case DYNAMIC_CONTEXT_CODE_EDITOR_AGENT.mandateKey:
      return DYNAMIC_CONTEXT_CODE_EDITOR_AGENT;
    case "generic-code-editor":
    case GENERIC_CODE_EDITOR_AGENT.mandateKey:
    default:
      return GENERIC_CODE_EDITOR_AGENT;
  }
}
