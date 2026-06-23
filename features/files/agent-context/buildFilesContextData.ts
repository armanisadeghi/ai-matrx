import { PLACEMENT_TYPES } from "@/features/agent-shortcuts/constants";
import { createFilesScope } from "@/features/surfaces/manifests/files.manifest";
import type { CloudFileRecord, CloudFolderRecord } from "@/features/files";

/**
 * Placements offered by the Files browser context menu.
 *
 * Files is metadata-heavy (no text editor), so content-block insertion is
 * intentionally omitted — the user reads/selects files; agents act on the
 * active file, the multi-file selection, or the current folder. We expose the
 * AI-action and quick-action placements only.
 */
export const FILES_CONTEXT_MENU_PLACEMENTS = [
  PLACEMENT_TYPES.AI_ACTION,
  PLACEMENT_TYPES.QUICK_ACTION,
] as const;

/**
 * Shared menu props for `matrx-user/files`.
 *
 * `sourceFeature` is trace-attribution only; `surfaceName` is what drives
 * surface-binding resolution. `"files"` is the surface's own attribution
 * literal in the `SourceFeature` union
 * (`features/agents/types/instance.types.ts`).
 */
export const FILES_CONTEXT_MENU_PROPS = {
  sourceFeature: "files" as const,
  surfaceName: "matrx-user/files" as const,
  isEditable: false as const,
  enabledPlacements: [...FILES_CONTEXT_MENU_PLACEMENTS],
};

export interface BuildFilesContextDataArgs {
  /** The file currently focused/opened in the preview pane, if any. */
  activeFile?: CloudFileRecord | null;
  /** The folder the user is currently browsing, if any (null at root). */
  activeFolder?: CloudFolderRecord | null;
  /**
   * Files currently selected (checkbox multi-select). Folders in the raw
   * selection are filtered out by the caller — only real file records here.
   */
  selectedFiles?: CloudFileRecord[];
}

/**
 * Canonical `contextData` for `matrx-user/files`.
 *
 * PURE: maps live Files-browser state → `createFilesScope(...)`. Demo and
 * production share one shape. The text baselines (`selection`, `content`,
 * `text_*`) have no meaning on this surface — they are left to the platform
 * floor (`withBaselineScope`). We emit `context` as a compact navigation map
 * and every custom value the manifest declares that we can source from state.
 */
export function buildFilesContextData(
  args: BuildFilesContextDataArgs,
): Record<string, unknown> {
  const { activeFile = null, activeFolder = null, selectedFiles = [] } = args;

  const hasActiveFile = Boolean(activeFile);
  const selectedFileIds = selectedFiles.map((f) => f.id);
  const selectedFileNames = selectedFiles.map((f) => f.fileName);
  const selectedCount = selectedFileIds.length;

  // Compact, LLM-readable navigation map. Mirrors the named custom values so a
  // bound agent that didn't map a specific slot still sees the active file,
  // folder, and selection at a glance.
  const context: Record<string, unknown> = {
    surface: "cloud-files-browser",
    active_file: activeFile
      ? {
          id: activeFile.id,
          name: activeFile.fileName,
          mime_type: activeFile.mimeType ?? null,
          size: activeFile.fileSize ?? null,
          path: activeFile.filePath,
          visibility: activeFile.visibility,
        }
      : null,
    active_folder: activeFolder
      ? {
          id: activeFolder.id,
          name: activeFolder.folderName,
          path: activeFolder.folderPath,
        }
      : null,
    selection: {
      count: selectedCount,
      file_ids: selectedFileIds,
      file_names: selectedFileNames,
    },
  };

  const scope = createFilesScope({
    // ── Active file ──────────────────────────────────────────────────────
    active_file_id: hasActiveFile ? activeFile!.id : undefined,
    active_file_name: hasActiveFile ? activeFile!.fileName : undefined,
    active_file_path: hasActiveFile ? activeFile!.filePath : undefined,
    active_file_mime_type: activeFile?.mimeType ?? undefined,
    active_file_size: activeFile?.fileSize ?? undefined,

    // ── Folder context ───────────────────────────────────────────────────
    active_folder_id: activeFolder?.id ?? undefined,
    active_folder_path: activeFolder?.folderPath ?? undefined,

    // ── Selection ────────────────────────────────────────────────────────
    selected_file_ids: selectedCount ? selectedFileIds : undefined,
    selected_file_names: selectedCount ? selectedFileNames : undefined,
    selected_count: selectedCount || undefined,

    // ── Baseline escape valve (text baselines left to the platform floor) ─
    context,
  });

  return scope as Record<string, unknown>;
}
