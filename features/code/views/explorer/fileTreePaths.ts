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
