/**
 * Shared types for the Smart Code Editor.
 */

import type { ParseResult } from "./utils/parseCodeEdits";

// Re-export the canonical multi-file shape used across the code-editor
// feature. This keeps us on the SAME data model the existing CodeSidebar +
// CodeEditorTabBar + useCodeEditorWindowState already speak — no adapter
// layer, no duplicated icons / language mappings / tab logic.
export type { CodeFile } from "@/features/code-editor/multi-file-core/types";

/**
 * Minimal config the editor needs for each editing job in the picker.
 *
 * `mandateKey` names the JOB (`agent.mandate`); the database decides which
 * agent runs it — the editor never carries an agent id. `codeVariableKey` is
 * the offered value (provision `code_editor.session`) that receives the
 * editor's current code on the first turn ("current_code" | "dynamic_context").
 */
export interface CodeEditorAgentConfig {
  mandateKey: string;
  name: string;
  codeVariableKey: string;
}

/**
 * The high-level state of an AI edit cycle. Drives the review UI.
 */
export type CodeEditorState =
  | "input" // waiting for user prompt
  | "processing" // request in flight / streaming
  | "review" // stream ended, user inspects diff
  | "applying" // user clicked Apply, writing back
  | "complete" // applied successfully, about to dismiss
  | "error"; // validation or apply failed

/**
 * Input shape for `useIdeContextSync` and the composite `vsc_active_file`.
 * Only `code` + `language` are required; the sync hook emits an entry for
 * every other field that has real content and skips the rest (matching the
 * server's IdeState.to_variables() behavior).
 */
export interface CodeContextInput {
  code: string;
  language: string;
  filePath?: string;
  selection?: string;
  diagnostics?: string;
  workspaceName?: string;
  /** Newline-joined list per server docs. */
  workspaceFolders?: string;
  gitBranch?: string;
  gitStatus?: string;
  /** Manual for now — populates the `agent_skills` slot. */
  agentSkills?: string;
}

/**
 * Return shape from `useSmartCodeEditor`. Components subscribe to this to
 * render state transitions and apply/reject actions.
 */
export interface UseSmartCodeEditorReturn {
  state: CodeEditorState;
  parsedEdits: ParseResult | null;
  modifiedCode: string;
  errorMessage: string;
  rawAIResponse: string;
  isExecuting: boolean;
  isCopied: boolean;
  diffStats: { additions: number; deletions: number; changes: number } | null;
  requestId: string | null;
  handleApplyChanges: () => Promise<void>;
  handleCopyResponse: () => Promise<void>;
  handleRejectEdits: () => void;
}
