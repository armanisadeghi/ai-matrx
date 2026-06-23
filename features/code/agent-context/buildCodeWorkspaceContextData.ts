import { PLACEMENT_TYPES } from "@/features/agent-shortcuts/constants";
import type { EditorDiagnostic } from "../redux/diagnosticsSlice";

/** Placements wired on `/code` — matches `CodeWorkspaceContextMenu`. */
export const CODE_WORKSPACE_CONTEXT_MENU_PLACEMENTS = [
  PLACEMENT_TYPES.AI_ACTION,
  PLACEMENT_TYPES.ORGANIZATION_TOOL,
  PLACEMENT_TYPES.USER_TOOL,
] as const;

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
}

/**
 * Canonical `contextData` shape for `matrx-user/code-editor`.
 * Shared by `CodeWorkspaceContextMenu` and any harness that must mirror `/code`.
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
  } = args;

  const contextFilter =
    options && "contextFilter" in options
      ? options.contextFilter
      : "code-editor";

  return {
    content: fullContent,
    selection: selectedText,
    ...(contextFilter ? { contextFilter } : {}),

    vsc_active_file_path: filePath,
    vsc_active_file_content: fullContent,
    vsc_active_file_language: language,
    vsc_selected_text: selectedText,
    vsc_diagnostics: activeTabDiagnostics,
    vsc_all_diagnostics: allDiagnostics,
    vsc_current_line: currentLine,
    vsc_current_column: currentColumn,
    vsc_line_count: lineCount,
    vsc_has_selection: selectedText.length > 0,
  };
}

/** Shared menu props for the `/code` workspace context menu wrapper. */
export const CODE_WORKSPACE_CONTEXT_MENU_PROPS = {
  sourceFeature: "code-editor" as const,
  surfaceName: "matrx-user/code-editor" as const,
  isEditable: false as const,
  enabledPlacements: [...CODE_WORKSPACE_CONTEXT_MENU_PLACEMENTS],
};
