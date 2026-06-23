import { PLACEMENT_TYPES } from "@/features/agent-shortcuts/constants";
import { createCodeEditorScope } from "@/features/surfaces/manifests/code-editor.manifest";
import type { EditorDiagnostic } from "../redux/diagnosticsSlice";
import type { CodeTabsState } from "../redux/tabsSlice";
import { isPreviewTab } from "../types";

/**
 * Open editable (Monaco-backed) tabs → the workspace SurfaceValues that both
 * code-editor menu wrappers need. Preview tabs (binary / cloud / diff /
 * render) have no editable buffer and are excluded.
 */
export function summarizeOpenTabs(tabs: CodeTabsState): {
  openFilePaths: string[];
  modifiedFilePaths: string[];
} {
  const editable = tabs.order
    .map((id) => tabs.byId[id])
    .filter((t): t is NonNullable<typeof t> => !!t && !isPreviewTab(t.kind));
  return {
    openFilePaths: editable.map((t) => t.path).filter(Boolean),
    modifiedFilePaths: editable
      .filter((t) => t.dirty)
      .map((t) => t.path)
      .filter(Boolean),
  };
}

/** Placements wired on `/code` — matches `CodeWorkspaceContextMenu`. */
export const CODE_WORKSPACE_CONTEXT_MENU_PLACEMENTS = [
  PLACEMENT_TYPES.AI_ACTION,
  PLACEMENT_TYPES.ORGANIZATION_TOOL,
  PLACEMENT_TYPES.USER_TOOL,
] as const;

/** Line/column selection rectangle for the `selection_range` SurfaceValue. */
export interface CodeSelectionRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface BuildCodeWorkspaceContextDataArgs {
  fullContent: string;
  selectedText: string;
  language: string;
  filePath: string;
  currentLine: number;
  currentColumn: number;
  lineCount: number;
  activeTabDiagnostics: EditorDiagnostic[];
  allDiagnostics: Record<string, EditorDiagnostic[]>;
  /** True when the focused file has unsaved edits. */
  isModified?: boolean;
  /** Text immediately before the selection/caret (baseline `text_before`). */
  textBefore?: string;
  /** Text immediately after the selection/caret (baseline `text_after`). */
  textAfter?: string;
  /** Line/column rectangle of the live selection (empty when nothing selected). */
  selectionRange?: CodeSelectionRange | null;
  /** Best-effort enclosing function/symbol name at the caret. */
  currentFunctionName?: string;
  /** Paths of every open tab. Defaults to `[filePath]` when not supplied. */
  openFilePaths?: string[];
  /** Paths of open tabs with unsaved edits. */
  modifiedFilePaths?: string[];
  /** Absolute path of the workspace root, when one is loaded. */
  workspaceRoot?: string;
  /**
   * Localized surround context (`<TEXT_BEFORE>…</TEXT_BEFORE>` / `<TEXT_AFTER>…`)
   * for the baseline `context` value. When omitted, a small JSON blob with the
   * active-file metadata is used so a `context` binding never resolves empty.
   */
  surroundContext?: string;
}

/**
 * Canonical `contextData` shape for `matrx-user/code-editor`.
 *
 * Emits THREE coordinated layers, all in one bag:
 *  1. The generic baselines (`content` / `selection` / `text_before` /
 *     `text_after` / `context`) so any baseline binding resolves from real
 *     editor state.
 *  2. The surface's declared SurfaceValue names (`current_file_*`,
 *     `current_line_number`, `selection_range`, `open_file_paths`, …) — these
 *     are what `agx_agent_surface.value_mappings` bind against. Built through
 *     `createCodeEditorScope` so a typo or missing required key is a TS error.
 *  3. The cross-editor `vsc_*` contract (kept byte-for-byte) so legacy
 *     Shortcuts whose `scopeMappings` reference `vsc_active_file_content` etc.
 *     keep working in BOTH the `/code` workspace and the embedded editor.
 *
 * Shared by `CodeWorkspaceContextMenu`, `CodeEditorContextMenu`, and any
 * harness that must mirror the surface.
 */
export function buildCodeWorkspaceContextData(
  args: BuildCodeWorkspaceContextDataArgs,
  options?: { contextFilter?: string | null },
): Record<string, unknown> {
  const {
    fullContent,
    selectedText,
    language,
    filePath,
    currentLine,
    currentColumn,
    lineCount,
    activeTabDiagnostics,
    allDiagnostics,
    isModified = false,
    textBefore,
    textAfter,
    selectionRange,
    currentFunctionName,
    openFilePaths,
    modifiedFilePaths,
    workspaceRoot,
    surroundContext,
  } = args;

  const contextFilter =
    options && "contextFilter" in options
      ? options.contextFilter
      : "code-editor";

  const hasSelection = selectedText.length > 0;
  const hasFile = filePath.length > 0 || fullContent.length > 0;
  const openPaths =
    openFilePaths ?? (filePath ? [filePath] : ([] as string[]));

  // Surface-declared values — type-checked against the manifest. Empty/zero
  // values are omitted so the resolver floors them rather than binding "".
  const surfaceScope = createCodeEditorScope({
    open_file_paths: openPaths,
    open_file_count: openPaths.length,

    selection: hasSelection ? selectedText : undefined,
    text_before: textBefore || undefined,
    text_after: textAfter || undefined,
    content: hasFile ? fullContent : undefined,
    context: surroundContext
      ? { raw: surroundContext }
      : { language, filePath, lineCount, currentLine, currentColumn },

    current_file_path: filePath || undefined,
    current_file_language: language || undefined,
    current_file_content: hasFile ? fullContent : undefined,
    current_file_modified: hasFile ? isModified : undefined,
    current_line_number: currentLine || undefined,
    current_column_number: currentColumn || undefined,
    selection_range: hasSelection ? (selectionRange ?? undefined) : undefined,
    current_function_name: currentFunctionName || undefined,
    modified_file_paths: modifiedFilePaths?.length
      ? modifiedFilePaths
      : undefined,
    workspace_root: workspaceRoot || undefined,
  });

  return {
    ...surfaceScope,
    ...(contextFilter ? { contextFilter } : {}),

    // Cross-editor `vsc_*` contract — see features/code-editor/FEATURE.md.
    vsc_active_file_path: filePath,
    vsc_active_file_content: fullContent,
    vsc_active_file_language: language,
    vsc_selected_text: selectedText,
    vsc_diagnostics: activeTabDiagnostics,
    vsc_all_diagnostics: allDiagnostics,
    vsc_current_line: currentLine,
    vsc_current_column: currentColumn,
    vsc_line_count: lineCount,
    vsc_has_selection: hasSelection,
  };
}

/**
 * The launch-time `ApplicationScope` for a code-editor menu: the full
 * `contextData` minus menu-control keys that are not scope values.
 *
 * `contextFilter` belongs on `contextData` (it tells the menu which shortcuts
 * to show) but must NOT reach the agent — the legacy resolver's pass-3 would
 * otherwise pass it through as an ad-hoc context entry. Monaco isn't a DOM
 * textarea, so wrappers return this directly instead of routing through
 * `buildApplicationScopeFromMenuContext` (which would clobber the live
 * text-neighbor values it computes from the editor model).
 */
export function codeEditorLaunchScope(
  contextData: Record<string, unknown>,
): Record<string, unknown> {
  const scope = { ...contextData };
  delete scope.contextFilter;
  return scope;
}

/** Shared menu props for the `/code` workspace context menu wrapper. */
export const CODE_WORKSPACE_CONTEXT_MENU_PROPS = {
  sourceFeature: "code-editor" as const,
  surfaceName: "matrx-user/code-editor" as const,
  isEditable: true as const,
  enabledPlacements: [...CODE_WORKSPACE_CONTEXT_MENU_PLACEMENTS],
};
