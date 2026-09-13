// features/ai-work/conversations/artifacts/tree.ts
//
// Pure folder grouping for coding-session artifacts. The DB returns a flat,
// path-ordered list; the panel shows a tree grouped by folder. Kept free of
// React and Supabase so it is unit-testable against real row shapes.

import type { Json } from "@/types/database.types";

export interface ArtifactFile {
  id: string;
  /** Leaf name inside its folder (last path segment). */
  name: string;
  /** Path inside the session artifact root, e.g. `qd/page/desk-v2.html`. */
  relativePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  updatedAt: string;
}

export interface ArtifactFolder {
  /** Folder name (last segment); "" only for the root. */
  name: string;
  /** Full folder path from the root, "" for the root. */
  path: string;
  folders: ArtifactFolder[];
  files: ArtifactFile[];
  /** Files in this folder AND every folder under it. */
  totalFiles: number;
}

interface ArtifactSourceRow {
  id: string;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  updated_at: string;
  metadata: Json | null;
}

function readRelativePath(row: ArtifactSourceRow): string {
  const meta = row.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const value = (meta as Record<string, Json | undefined>).relative_path;
    if (typeof value === "string" && value.trim()) {
      return value.replace(/^\/+/, "");
    }
  }
  // The publisher always stamps relative_path; a row without it still has
  // the canonical file_path `coding-sessions/<provider>/<session>/<rel>`.
  const segments = row.file_path.replace(/^\/+/, "").split("/");
  if (segments[0] === "coding-sessions" && segments.length > 3) {
    return segments.slice(3).join("/");
  }
  return row.file_name;
}

export function toArtifactFile(row: ArtifactSourceRow): ArtifactFile {
  const relativePath = readRelativePath(row);
  const name = relativePath.split("/").pop() || row.file_name;
  return {
    id: row.id,
    name,
    relativePath,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    updatedAt: row.updated_at,
  };
}

function compareName(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Groups flat artifact rows into a folder tree. Folders sort before files,
 * both by natural name order, and every folder carries its recursive count
 * so a collapsed folder still says how much it holds.
 */
export function buildArtifactTree(rows: ArtifactSourceRow[]): ArtifactFolder {
  const root: ArtifactFolder = {
    name: "",
    path: "",
    folders: [],
    files: [],
    totalFiles: 0,
  };
  const folderByPath = new Map<string, ArtifactFolder>([["", root]]);

  function ensureFolder(path: string): ArtifactFolder {
    const existing = folderByPath.get(path);
    if (existing) return existing;
    const cut = path.lastIndexOf("/");
    const parent = ensureFolder(cut === -1 ? "" : path.slice(0, cut));
    const folder: ArtifactFolder = {
      name: cut === -1 ? path : path.slice(cut + 1),
      path,
      folders: [],
      files: [],
      totalFiles: 0,
    };
    parent.folders.push(folder);
    folderByPath.set(path, folder);
    return folder;
  }

  for (const row of rows) {
    const file = toArtifactFile(row);
    const cut = file.relativePath.lastIndexOf("/");
    const folder = ensureFolder(cut === -1 ? "" : file.relativePath.slice(0, cut));
    folder.files.push(file);
  }

  function finalize(folder: ArtifactFolder): number {
    folder.folders.sort((a, b) => compareName(a.name, b.name));
    folder.files.sort((a, b) => compareName(a.name, b.name));
    folder.totalFiles =
      folder.files.length +
      folder.folders.reduce((sum, child) => sum + finalize(child), 0);
    return folder.totalFiles;
  }
  finalize(root);
  return root;
}

/** True for artifacts the app renders as a page rather than as source. */
export function isHtmlArtifact(file: ArtifactFile): boolean {
  if (file.mimeType === "text/html" || file.mimeType === "application/xhtml+xml") {
    return true;
  }
  return /\.x?html?$/i.test(file.name);
}
