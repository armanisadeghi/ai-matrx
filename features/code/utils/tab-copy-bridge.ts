import type { FilesystemAdapter } from "../adapters/FilesystemAdapter";
import type { EditorFile } from "../types";
import { getAdapterForTabId } from "../library-sources/registry";
import { isLibraryTabId } from "../hooks/useOpenLibraryFile";
import { isCurrentFilesystemTab } from "../views/explorer/fileTreePaths";

export type TabCopyDestination = "library" | "sandbox";

export function isLibraryOrSourceTab(
  tab: Pick<EditorFile, "id"> | null | undefined,
): boolean {
  if (!tab) return false;
  return isLibraryTabId(tab.id) || Boolean(getAdapterForTabId(tab.id));
}

export function isCurrentSandboxFilesystemTab(
  tab: Pick<EditorFile, "id" | "path"> | null | undefined,
  filesystemId: string,
): boolean {
  if (!tab || !filesystemId.startsWith("sandbox:")) return false;
  return isCurrentFilesystemTab(tab, filesystemId);
}

/**
 * Return the one explicit copy destination supported for a live editor tab.
 * A copy never changes the tab's own save route: Library/source tabs continue
 * saving to their source, and filesystem tabs continue saving to that sandbox.
 */
export function getTabCopyDestination(
  tab: Pick<EditorFile, "id" | "path"> | null | undefined,
  filesystem: Pick<FilesystemAdapter, "id" | "writable" | "writeFile" | "stat">,
): TabCopyDestination | null {
  if (!tab) return null;

  if (isCurrentFilesystemTab(tab, filesystem.id)) {
    return isCurrentSandboxFilesystemTab(tab, filesystem.id) ? "library" : null;
  }

  if (!isLibraryOrSourceTab(tab)) return null;

  return filesystem.id.startsWith("sandbox:") &&
    filesystem.writable &&
    Boolean(filesystem.writeFile) &&
    Boolean(filesystem.stat)
    ? "sandbox"
    : null;
}

/** Normalize a user-entered destination while refusing relative traversal. */
export function normalizeSandboxCopyPath(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.includes("\0")) return null;

  const parts = trimmed.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) return null;
  return `/${parts.join("/")}`;
}

/** The sandbox adapter exposes missing paths through its structured 404. */
export function isMissingSandboxPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /\b404\b|not found|no such file/i.test(error.message)
  );
}

/** Short, truthful save-target label for the compact editor toolbar. */
export function tabOriginLabel(
  tab: Pick<EditorFile, "id" | "path"> | null | undefined,
  filesystem: Pick<FilesystemAdapter, "id" | "label">,
): string | null {
  if (!tab) return null;
  if (isLibraryTabId(tab.id)) return "Library";

  const adapter = getAdapterForTabId(tab.id);
  if (adapter) return adapter.label;

  if (isCurrentFilesystemTab(tab, filesystem.id)) {
    return isCurrentSandboxFilesystemTab(tab, filesystem.id)
      ? `Sandbox: ${filesystem.label}`
      : filesystem.label;
  }
  return null;
}
