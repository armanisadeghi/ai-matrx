/**
 * Resolve the URL token a mounted window publishes.
 *
 * Registry metadata is the shared contract between the URL hydrator and the
 * mounted window. Page-local WindowPanels without registry metadata may still
 * provide an explicit key.
 */
export function resolveWindowUrlSyncKey(
  registryKey?: string,
  explicitKey?: string,
): string | undefined {
  return registryKey ?? explicitKey;
}
