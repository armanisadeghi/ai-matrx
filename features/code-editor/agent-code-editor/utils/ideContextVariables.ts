/**
 * IDE Context Variables
 *
 * Converts a `CodeContextInput` (code + language + optional IDE state) into
 * a list of context entries for the agent-system `instanceContext` slice.
 * The server exposes these to the model via `ctx_get(key)` so the agent can
 * pull live editor state on demand without bloating the prompt.
 *
 * Keys follow the server team's `vsc_*` convention for VSCode-style slots
 * plus `agent_skills` for the manual capability slot.
 *
 * Fields with no content are omitted — same behavior as the server's
 * IdeState.to_variables() (keys with empty strings aren't emitted).
 */

import type { CodeContextInput } from "../types";
import {
  VSC_CONTEXT_KEYS,
  AGENT_CONTEXT_KEYS,
  CONTEXT_LABELS,
} from "../constants";
import type { IdeState } from "@/features/agents/types/agent-api-types";
import { fenceParts, findCodeRanges } from "@ai-matrx/content-ir/source";

/**
 * Shape the instanceContext.setContextEntries action accepts. Matches
 * `features/agents/redux/execution-system/instance-context/instance-context.slice.ts:94-120`.
 */
export interface IdeContextEntry {
  key: string;
  value: unknown;
  type: "text" | "json";
  label: string;
}

/** The whole value is exactly one closed fenced block (THE one code-range rule). */
function isWrappedInCodeBlock(code: string): boolean {
  const trimmed = code.trim();
  const ranges = findCodeRanges(trimmed);
  return (
    ranges.length === 1 &&
    ranges[0]!.kind === "fence" &&
    ranges[0]!.start === 0 &&
    ranges[0]!.end === trimmed.length &&
    fenceParts(trimmed)?.closed === true
  );
}

export function wrapInCodeBlock(code: string, language?: string): string {
  if (isWrappedInCodeBlock(code)) return code;
  const lang = language || "code";
  return `\`\`\`${lang}\n${code}\n\`\`\``;
}

/**
 * Build the context entries for a given editor state. Returns only the keys
 * that have real content — mirrors the server's `ide_state.to_variables()`
 * behavior of omitting empty fields.
 *
 * Pass the result directly to `setContextEntries({conversationId, entries})`.
 */
export function buildIdeContextEntries(
  input: CodeContextInput,
): IdeContextEntry[] {
  const entries: IdeContextEntry[] = [];
  const {
    code,
    language,
    filePath,
    selection,
    diagnostics,
    workspaceName,
    workspaceFolders,
    gitBranch,
    gitStatus,
    agentSkills,
  } = input;

  const push = (key: string, value: unknown, type: "text" | "json" = "text") => {
    entries.push({ key, value, type, label: CONTEXT_LABELS[key] ?? key });
  };

  // File content (fenced, ready for the model to read)
  if (code && code.length > 0) {
    push(
      VSC_CONTEXT_KEYS.ACTIVE_FILE_CONTENT,
      wrapInCodeBlock(code, language),
    );
  }
  if (language) push(VSC_CONTEXT_KEYS.ACTIVE_FILE_LANGUAGE, language);
  if (filePath) push(VSC_CONTEXT_KEYS.ACTIVE_FILE_PATH, filePath);

  if (selection && selection.length > 0) {
    push(VSC_CONTEXT_KEYS.SELECTED_TEXT, wrapInCodeBlock(selection, language));
  }
  if (diagnostics && diagnostics.length > 0) {
    push(VSC_CONTEXT_KEYS.DIAGNOSTICS, diagnostics);
  }

  if (workspaceName) push(VSC_CONTEXT_KEYS.WORKSPACE_NAME, workspaceName);
  if (workspaceFolders && workspaceFolders.length > 0) {
    push(VSC_CONTEXT_KEYS.WORKSPACE_FOLDERS, workspaceFolders);
  }
  if (gitBranch) push(VSC_CONTEXT_KEYS.GIT_BRANCH, gitBranch);
  if (gitStatus && gitStatus.length > 0) {
    push(VSC_CONTEXT_KEYS.GIT_STATUS, gitStatus);
  }

  if (agentSkills && agentSkills.length > 0) {
    push(AGENT_CONTEXT_KEYS.AGENT_SKILLS, agentSkills);
  }

  // Composite: `vsc_active_file` — one json lookup for agents that want it.
  if (code && code.length > 0) {
    push(
      VSC_CONTEXT_KEYS.ACTIVE_FILE,
      {
        path: filePath ?? null,
        language: language ?? null,
        content: code,
      },
      "json",
    );
  }

  return entries;
}

/**
 * Build a structured `IdeState` payload for the `editor-state` client
 * capability. Mirrors the same source data fed into the legacy
 * `instanceContext` `vsc_*` keys, but in the typed shape the new envelope
 * expects. Returns `null` when the editor has nothing meaningful to
 * declare — keeps the capability out of the request envelope entirely
 * instead of declaring it with empty payloads.
 */
export function buildIdeState(input: CodeContextInput): IdeState | null {
  const {
    code,
    language,
    filePath,
    selection,
    workspaceName,
    workspaceFolders,
    gitBranch,
    gitStatus,
  } = input;

  const ideState: IdeState = {};
  let hasAny = false;

  if (filePath && code !== undefined && language) {
    ideState.active_file = {
      path: filePath,
      content: code,
      language,
    };
    hasAny = true;
  }

  if (selection && selection.length > 0) {
    ideState.selected_text = selection;
    hasAny = true;
  }

  if (workspaceName || (workspaceFolders && workspaceFolders.length > 0)) {
    ideState.workspace = {
      name: workspaceName ?? "",
      folders: workspaceFolders
        ? workspaceFolders.split("\n").filter(Boolean)
        : [],
    };
    hasAny = true;
  }

  if (gitBranch || gitStatus) {
    ideState.git = {
      branch: gitBranch ?? "",
      status: gitStatus ?? "",
    };
    hasAny = true;
  }

  // Diagnostics in CodeContextInput is a free-form string — leave the
  // structured array empty until the editor surface starts shipping
  // structured diagnostics. The server tolerates an empty list.

  return hasAny ? ideState : null;
}
