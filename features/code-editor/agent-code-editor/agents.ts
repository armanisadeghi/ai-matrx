/**
 * Code-editor agent constants — HARDCODED AGENT IDS, and a KNOWN GAP.
 *
 * 🚨 This module is NOT a source of truth for anything. It is three raw
 * `agent.definition` UUIDs frozen into the codebase, read at run time by
 * `agentForPromptKey` from six call sites (`CodeBlock`, `MultiFileCodeEditor`,
 * `AICodeEditorModalV2`, both `ContextAwareCodeEditor*`, `useAICodeEditor`).
 * The database no longer controls which agent edits code here: an admin
 * repointing the code editor changes nothing until someone edits this file.
 *
 * **The canonical answer is an AGENT MANDATE.** Code names a `slot_key`; the DB
 * decides which agent runs it. Declare `code_editor.generic`,
 * `code_editor.prompt_app_ui`, and `code_editor.dynamic_context` in aidream
 * `services/mandates/client_mandates.py` (seeded on the ids below), then
 * resolve them here via `useMandate` / `launchAgentExecution({mandateKey})` /
 * `useAgentLauncher().launchMandate`, and DELETE these constants. Recipe:
 * `features/agents/mandates/FEATURE.md`; law + worklist:
 * /Users/armanisadeghi/code/common-docs/systems/mandates/FEATURE.md and
 * ROLLOUT.md (row F6).
 *
 * **A NEW read of these constants is a defect.** Nothing here is an exception:
 * exactly one exists platform-wide (aidream's conversation labeler) and it is
 * not this. Do not add a fourth agent to this file — declare a mandate instead.
 *
 * `codeVariableKey` mirrors the agent's own `variable_definitions` entry that
 * receives the editor's current code on the first turn. The AGENT owns that
 * declaration; this string is a code-side mapping that drifts silently if the
 * agent is edited in the builder.
 */
import type { CodeEditorAgentConfig } from "./types";

export const PROMPT_APP_UI_EDITOR_AGENT: CodeEditorAgentConfig = {
  id: "c1c1f092-ba0d-4d6c-b352-b22fe6c48272",
  name: "Prompt App Code Editor",
  codeVariableKey: "current_code",
};

export const GENERIC_CODE_EDITOR_AGENT: CodeEditorAgentConfig = {
  id: "87efa869-9c11-43cf-b3a8-5b7c775ee415",
  name: "Code Editor",
  codeVariableKey: "current_code",
};

export const DYNAMIC_CONTEXT_CODE_EDITOR_AGENT: CodeEditorAgentConfig = {
  id: "970856c5-3b9d-4034-ac9d-8d8a11fb3dba",
  name: "Code Editor (Dynamic Context)",
  codeVariableKey: "dynamic_context",
};

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

/**
 * Lookup by legacy `promptKey` (e.g. "prompt-app-ui-editor") OR by raw UUID.
 * Old call sites passed a key string; some passed the agent UUID directly via
 * `getBuiltinId(...)`. Both shapes are handled here so the migration is a
 * one-line swap regardless of source.
 *
 * Falls back to the generic agent for unknown values.
 */
export function agentForPromptKey(
  keyOrId: string | undefined,
): CodeEditorAgentConfig {
  switch (keyOrId) {
    case "prompt-app-ui-editor":
    case PROMPT_APP_UI_EDITOR_AGENT.id:
      return PROMPT_APP_UI_EDITOR_AGENT;
    case "code-editor-dynamic-context":
    case DYNAMIC_CONTEXT_CODE_EDITOR_AGENT.id:
      return DYNAMIC_CONTEXT_CODE_EDITOR_AGENT;
    case "generic-code-editor":
    case GENERIC_CODE_EDITOR_AGENT.id:
    default:
      return GENERIC_CODE_EDITOR_AGENT;
  }
}
