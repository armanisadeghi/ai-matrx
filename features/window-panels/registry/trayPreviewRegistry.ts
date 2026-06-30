/**
 * trayPreviewRegistry — overlay-id → tray-chip preview helpers.
 *
 * Replaces the `renderTrayPreview` / `captureTraySnapshot` fields that used to
 * live next to `componentImport` on a window's full entry. Co-locating them
 * with the lazy `componentImport` is what kept dragging the dynamic-import
 * graph into anything that touched the registry — even code that only needed
 * metadata. Splitting tray previews out keeps the metadata lookup
 * (`windowRegistryMetadata.ts`) import-safe everywhere.
 *
 * This file imports ONLY the tray-preview JSX functions (in `tray-previews.tsx`)
 * and a type. No window components, no `next/dynamic`. Safe to import from
 * the tray-chip render path without inflating the main chunk.
 *
 * Add a new tray preview here, NOT in the metadata file.
 */

import type { TrayPreviewContext } from "./windowRegistryTypes";
import {
  cloudFilesTrayPreview,
  errorInspectorTrayPreview,
  notesTrayPreview,
  quickTasksTrayPreview,
  scraperTrayPreview,
  smartCodeEditorTrayPreview,
} from "./tray-previews";
import type { ReactNode } from "react";

export interface TrayPreviewEntry {
  renderTrayPreview?: (ctx: TrayPreviewContext) => ReactNode;
  captureTraySnapshot?: (bodyEl: HTMLElement) => Promise<string | null>;
}

const TRAY_PREVIEW_REGISTRY: Record<string, TrayPreviewEntry> = {
  notesWindow: { renderTrayPreview: notesTrayPreview },
  quickTasksWindow: { renderTrayPreview: quickTasksTrayPreview },
  cloudFilesWindow: { renderTrayPreview: cloudFilesTrayPreview },
  scraperWindow: { renderTrayPreview: scraperTrayPreview },
  smartCodeEditorWindow: { renderTrayPreview: smartCodeEditorTrayPreview },
  errorInspectorWindow: { renderTrayPreview: errorInspectorTrayPreview },
};

export function getTrayPreviewEntry(
  overlayId: string,
): TrayPreviewEntry | undefined {
  return TRAY_PREVIEW_REGISTRY[overlayId];
}
