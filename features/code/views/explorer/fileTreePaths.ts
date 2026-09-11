/** POSIX path helpers used to reveal the active editor tab in the explorer. */
export function normalizeExplorerPath(path: string): string {
  if (!path) return "/";
  const collapsed = path.replace(/\/+/g, "/");
  return collapsed === "/" ? "/" : collapsed.replace(/\/$/, "");
}

export function isPathWithinRoot(path: string, root: string): boolean {
  const normalizedPath = normalizeExplorerPath(path);
  const normalizedRoot = normalizeExplorerPath(root);
  return (
    normalizedRoot === "/" ||
    normalizedPath === normalizedRoot ||
    normalizedPath.startsWith(`${normalizedRoot}/`)
  );
}

/** Directories that must be open for a file to be visible below `root`. */
export function ancestorPathsForFile(path: string, root: string): string[] {
  const normalizedPath = normalizeExplorerPath(path);
  const normalizedRoot = normalizeExplorerPath(root);
  if (!isPathWithinRoot(normalizedPath, normalizedRoot)) return [];

  const parent = normalizedPath.replace(/\/[^/]+$/, "") || "/";
  const ancestors = [normalizedRoot];
  let current = normalizedRoot;
  for (const segment of parent.slice(normalizedRoot.length).split("/")) {
    if (!segment) continue;
    current = `${current === "/" ? "" : current}/${segment}`;
    ancestors.push(current);
  }
  return ancestors;
}

export function isCurrentFilesystemTab(
  tab: { id: string; path: string } | null,
  filesystemId: string,
): boolean {
  if (!tab || !tab.path.startsWith("/")) return false;
  if (tab.id.startsWith(`${filesystemId}:`)) return true;
  return (
    filesystemId.startsWith("sandbox:") &&
    tab.id === `session-report:${filesystemId.slice("sandbox:".length)}`
  );
}

export function validateFilesystemEntryName(name: string): string | null {
  if (!name) return "Enter a name.";
  if (name === "." || name === "..") return "Choose a file or folder name.";
  if (name.includes("/") || name.includes("\0")) {
    return "Names cannot contain a path separator.";
  }
  return null;
}
