/**
 * Surface manifest — Smart Code Editor (`matrx-user/smart-code-editor`).
 *
 * The floating Smart Code Editor window (overlay `smartCodeEditorWindow`,
 * multi-instance `SmartCodeEditorWindow` hosting `SmartCodeEditor`): a
 * 4-column agentic code editor. Single-file mode edits one buffer;
 * multi-file mode adds a Files column. Openers (including the desktop IDE
 * bridge) may pass rich IDE context: file path, selection, diagnostics,
 * workspace, and git state. Ephemeral — drafts do not survive reload.
 * Distinct from `matrx-user/code-editor` (the code workspace surface).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "editor_state",
    label: "Editor state",
    sortOrder: 100,
    description: "The code buffer(s) the user is editing in this window.",
  },
  {
    key: "ide_context",
    label: "IDE context",
    sortOrder: 200,
    description:
      "Context passed by the opener (e.g. the desktop IDE bridge): workspace, git, diagnostics.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Editor state ──────────────────────────────────────────────────────
  {
    name: "content",
    label: "Primary content",
    description:
      "The code in the active editor buffer. Empty when the editor is blank.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    sortOrder: 200,
    group: "editor_state",
  },
  {
    name: "language",
    label: "Language",
    description:
      'Language id of the active buffer (e.g. "typescript"). Defaults to "plaintext" when the opener passed none.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 310,
    group: "editor_state",
  },
  {
    name: "files",
    label: "Files",
    description:
      "In multi-file mode, the file set loaded into the Files column (path + content each). Absent in single-file mode. Can be large — bind explicitly when needed.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 12000,
    autoContext: false,
    sortOrder: 320,
    group: "editor_state",
  },
  {
    name: "active_file_path",
    label: "Active file path",
    description:
      "Path of the file open in the editor column (multi-file mode). Absent in single-file mode.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 330,
    group: "editor_state",
  },
  {
    name: "editor_title",
    label: "Editor title",
    description:
      "Custom window title passed by the opener. Empty when the default title is used.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    autoContext: false,
    sortOrder: 340,
    group: "editor_state",
  },

  // ── IDE context ───────────────────────────────────────────────────────
  {
    name: "file_path",
    label: "Source file path",
    description:
      "Path of the source file this buffer came from, as passed by the opener (e.g. the IDE bridge). Empty for ad-hoc code.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 400,
    group: "ide_context",
  },
  {
    name: "diagnostics",
    label: "Diagnostics",
    description:
      "Compiler/linter diagnostics for the buffer, as passed by the opener. Empty when none were provided.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 410,
    group: "ide_context",
  },
  {
    name: "workspace_name",
    label: "Workspace name",
    description:
      "Name of the originating IDE workspace. Empty when not provided.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 420,
    group: "ide_context",
  },
  {
    name: "workspace_folders",
    label: "Workspace folders",
    description:
      "Folder list of the originating IDE workspace. Empty when not provided.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 400,
    autoContext: false,
    sortOrder: 430,
    group: "ide_context",
  },
  {
    name: "git_branch",
    label: "Git branch",
    description:
      "Current git branch of the originating workspace. Empty when not provided.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 440,
    group: "ide_context",
  },
  {
    name: "git_status",
    label: "Git status",
    description:
      "Git status summary of the originating workspace. Empty when not provided.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 600,
    autoContext: false,
    sortOrder: 450,
    group: "ide_context",
  },
  {
    name: "agent_skills",
    label: "Agent skills",
    description:
      "Skill hints passed by the opener for the editor's agents. Empty when not provided.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 800,
    autoContext: false,
    sortOrder: 460,
    group: "ide_context",
  },
];

export const smartCodeEditorManifest: SurfaceManifest = {
  surfaceName: "matrx-user/smart-code-editor",
  readiness: "stub",
  readinessNote:
    "Values authored from a code audit of SmartCodeEditorWindow props; no runtime emitter yet — nothing emits this scope.",
  overlayId: "smartCodeEditorWindow",
  label: "Smart Code Editor",
  intro: `<surface_intro>
You are on the Smart Code Editor — a floating agentic code editor. content is the active buffer (language tells you what it is); in multi-file mode files/active_file_path describe the loaded file set. The ide_context values (file_path, diagnostics, workspace, git state) were passed by the opener — often a desktop IDE — and describe where this code came from. Agents here edit, explain, or fix the buffer; respect the diagnostics when provided.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

export function createSmartCodeEditorScope(values: {
  content?: string;
  language?: string;
  files?: Array<Record<string, unknown>>;
  active_file_path?: string;
  editor_title?: string;
  file_path?: string;
  diagnostics?: string;
  workspace_name?: string;
  workspace_folders?: string;
  git_branch?: string;
  git_status?: string;
  agent_skills?: string;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
