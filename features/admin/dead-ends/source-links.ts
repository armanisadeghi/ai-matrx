/**
 * Doors onto a source location.
 *
 * A finding that names `features/notes/X.tsx:412` and gives you no way to open
 * it would be the checker committing the exact offence it detects. There is no
 * in-app viewer for arbitrary `.tsx` source (the feature-docs viewer is
 * markdown-only, DB-backed), so the door is the repository.
 *
 * WHICH REF — this decides whether the links survive.
 * The obvious choice is the commit the scan ran against, so line numbers stay
 * exact forever. It is the wrong one: that sha only ever exists on a feature
 * branch (committing the report creates a NEW commit, so the report can never
 * carry its own), and a squash-merge deletes the branch. GitHub then garbage
 * collects the sha and EVERY link on this page 404s — the scoreboard becomes
 * the dead end it exists to detect.
 *
 * So links point at the default branch, which is permanent. The cost is that a
 * line number drifts once the file is edited after the scan — which is exactly
 * what the page's snapshot-age banner is telling you to fix. The scanned commit
 * is still shown in the header, linked to its own compare view, as provenance.
 */

/** The one place the repo URL is written. */
const REPO_URL = "https://github.com/armanisadeghi/ai-matrx";

/** Permanent ref. See the note above — never the scan commit. */
const DEFAULT_BRANCH = "main";

/** Line-anchored source door. */
export function sourceHref(file: string, line: number): string {
  return `${REPO_URL}/blob/${DEFAULT_BRANCH}/${encodeURI(file)}#L${line}`;
}

/** File or directory door, unanchored — used by the bucket lists. */
export function pathHref(path: string): string {
  return `${REPO_URL}/tree/${DEFAULT_BRANCH}/${encodeURI(path)}`;
}

/**
 * The scanned commit itself, as provenance. A commit URL survives on the
 * default branch after a merge (squash or not), unlike a blob pinned to a
 * deleted branch head, and it degrades to a 404 that means "that scan's commit
 * is gone" rather than silently mis-anchoring a line.
 */
export function commitHref(commit: string): string {
  return `${REPO_URL}/commit/${commit}`;
}

/** The registry a missing `hrefFor` gets added to — the one-click fix pointer. */
export const ENTITY_REGISTRY_PATH =
  "features/scopes/registry/entityRegistry.ts";
