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
  SurfaceWriteTarget,
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

/**
 * Write targets — the live editor buffer (2026-08-11).
 *
 * Same trio as `matrx-user/code-editor`, because the shape of "write code into
 * the buffer the user is looking at" is the same: `replace_selection` is the
 * precise one (and REFUSES when nothing is highlighted rather than guessing a
 * range), `insert_at_cursor` adds without destroying anything, and `content`
 * is the blunt whole-buffer rewrite kept because "rewrite this module" is a
 * real ask. The names differ in one place: this surface's whole-buffer read
 * value is `content`, not `current_file_content`, and the target is named
 * after the value it updates so the evidence loop reads cleanly.
 *
 * TWO THINGS ARE NOT THE SAME HERE, and they change the prose rather than the
 * design:
 *
 *  1. NOTHING ON THIS SURFACE PERSISTS. The window is registered
 *     `ephemeral: true`, its files live in component state
 *     (`useCodeEditorWindowState` in-memory mode — no `fileIds`, so no
 *     code_files rows and no auto-save middleware), and there is no Save
 *     control anywhere in the UI. So `mode: "draft"` is right — the write is
 *     staged, never persisted — but the usual draft sentence ("the user still
 *     saves") would be a lie in the other direction: there is nothing to save
 *     TO. The descriptions say what is actually true — the code lands in a
 *     scratch buffer the user reads, copies, or hands back to their IDE, and
 *     a reload discards it. The seam's `draft` confirm line ("nothing is saved
 *     until you save") stays literally true here — nothing IS saved — but it
 *     implies a Save this surface does not have, so the descriptions do not
 *     lean on it. `entity` was rejected outright: "This is saved immediately"
 *     would be flatly false (the `mermaid-editor` / `podcast-run`
 *     mode-as-truth-claim test, run in the opposite direction). `ui` was
 *     rejected too — it is the one branch that appends nothing, but calling a
 *     whole code buffer "ephemeral view state" understates the write and
 *     invites a later reader to relax it to `applyPolicy: "auto"`.
 *  2. THE UNDO STACK IS NOT FREE HERE. This editor is uncontrolled: React
 *     state flows back down as `initialCode`, and `SmallCodeEditorImpl`'s sync
 *     effect applies an out-of-band change with `model.setValue()`, which
 *     discards undo history. So the handlers do NOT write through React state
 *     — they edit the Monaco model directly with `pushEditOperations` between
 *     undo stops, which fires the change event that feeds the SAME
 *     `handleContentChange` the user's typing feeds. State converges, the
 *     `setValue` branch never trips (the model already holds the new text),
 *     and ⌘Z reverses an agent edit exactly like it reverses a paste.
 *
 * Deliberately NOT a target: `editor_title`. It reads like an easy fourth, but
 * the title is an opener-supplied prop the window shell renders — there is no
 * canonical write path for it and no user gesture that renames this window, so
 * a handler would have to invent state nobody else writes. Also undeclared:
 * diagnostics and the git/workspace values (a report of where the code came
 * from, not an input), the multi-file lifecycle (create / rename / delete /
 * close a file), and anything that hands the code back to the opener. The
 * safety story is that an agent edit is a buffer edit — visible, undoable, and
 * discarded on reload unless the human does something with it.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "replace_selection",
    label: "Selected code",
    description:
      "REPLACES the code the user has highlighted in the editor with the code you pass — nothing outside the selection is touched. Prefer this whenever the user is asking about code they have selected. Pass a plain text string of raw code only: no markdown fences, no commentary, no JSON, indented to match where it lands. REFUSED when nothing is selected — ask the user to highlight the code rather than guessing a range. Applied as one undoable edit into the live buffer.",
    valueType: "string",
    updatesValue: "selection",
    mode: "draft",
    applyPolicy: "ask",
    group: "editor_state",
    sortOrder: 100,
  },
  {
    name: "insert_at_cursor",
    label: "Inserted code",
    description:
      "INSERTS the code you pass at the cursor, or immediately AFTER the selection when the user has one — nothing existing is removed or resent. Use this to add a function, a test, or an import instead of rewriting what is already there. Pass a plain text string of raw code only, with no markdown fences; include your own leading or trailing newlines when the insertion needs its own line. Applied as one undoable edit into the live buffer.",
    valueType: "string",
    updatesValue: "content",
    mode: "draft",
    applyPolicy: "ask",
    group: "editor_state",
    sortOrder: 110,
  },
  {
    name: "content",
    label: "Primary content",
    description:
      "REPLACES THE ENTIRE ACTIVE BUFFER with the string you pass. This is a full replacement, not a merge: read `content` first and include every line that should survive, or use `replace_selection` / `insert_at_cursor` when you only mean to change part of it. Pass a plain text string of raw code only, with no markdown fences. Must be non-empty — emptying the buffer is a human action. Applied as ONE undoable edit, so the user can reverse it with undo. This editor is a scratch buffer: the code stays in the window until the user copies it out or hands it back to their IDE, and a reload discards it.",
    valueType: "string",
    updatesValue: "content",
    mode: "draft",
    applyPolicy: "ask",
    group: "editor_state",
    sortOrder: 120,
  },
];

export const smartCodeEditorManifest: SurfaceManifest = {
  surfaceName: "matrx-user/smart-code-editor",
  readiness: "verified",
  readinessNote:
    "Scope + write targets emitted live by the `SurfaceRuntimeProvider` in `SmartCodeEditor` (the shared core behind both the floating window and `SmartCodeEditorModal`). Content and selection are read from the Monaco model at trigger time. The older standalone `MultiFileSmartCodeEditorWindow` is a separate component and does not mount this surface.",
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
  writeTargets,
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
