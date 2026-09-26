export const ROUTE_MANIFEST_SOURCE_SHA_ENV = "ROUTE_MANIFEST_SOURCE_SHA";

/**
 * Select the commit a route-manifest publication describes. Releases pass the
 * already-proven commit explicitly because concurrent work can advance HEAD
 * between the rollout becoming READY and this post-rollout publication.
 */
export function resolveRouteManifestSourceSha(
  releaseSha: string | undefined,
  currentHead: () => string,
  verifyCommit: (sha: string) => string,
): string {
  if (!releaseSha?.trim()) return currentHead();

  const sourceSha = releaseSha.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sourceSha)) {
    throw new Error(
      `${ROUTE_MANIFEST_SOURCE_SHA_ENV} must be an exact 40-character commit SHA`,
    );
  }

  const resolved = verifyCommit(sourceSha).trim().toLowerCase();
  if (resolved !== sourceSha) {
    throw new Error(
      `${ROUTE_MANIFEST_SOURCE_SHA_ENV} must name that exact commit, not an alias`,
    );
  }
  return sourceSha;
}
