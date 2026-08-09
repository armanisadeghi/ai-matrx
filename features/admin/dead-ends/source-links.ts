/**
 * Doors onto a source location.
 *
 * A finding that names `features/notes/X.tsx:412` and gives you no way to open
 * it would be the checker committing the exact offence it detects. There is no
 * in-app viewer for arbitrary `.tsx` source (the feature-docs viewer is
 * markdown-only, DB-backed), so the honest door is the repository at the exact
 * commit the scan ran against — a permanent, line-anchored URL.
 */

/** The one place the repo URL is written. */
const REPO_URL = "https://github.com/armanisadeghi/ai-matrx";

/**
 * Blob URL pinned to the scanned commit so the line number still points at the
 * right code months later. Falls back to `main` when the scan could not
 * resolve a commit (a non-git checkout) — degraded, and visibly so.
 */
export function sourceHref(
  file: string,
  line: number,
  commit: string | null,
): string {
  const ref = commit ?? "main";
  return `${REPO_URL}/blob/${ref}/${encodeURI(file)}#L${line}`;
}

/** Directory-level door, for the worst-files / worst-features tables. */
export function treeHref(path: string, commit: string | null): string {
  const ref = commit ?? "main";
  return `${REPO_URL}/tree/${ref}/${encodeURI(path)}`;
}

/** The registry a missing `hrefFor` gets added to — the one-click fix pointer. */
export const ENTITY_REGISTRY_PATH =
  "features/scopes/registry/entityRegistry.ts";
