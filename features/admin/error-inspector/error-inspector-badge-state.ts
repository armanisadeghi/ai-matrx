/**
 * Immersive capture owns every mobile edge for camera controls. The inspector
 * remains reachable from the shell/admin menu, but its global badge must not
 * cover capture actions or survive the capture screen's hide-controls mode.
 */
export function suppressErrorInspectorBadge(pathname: string): boolean {
  return (
    pathname === "/tools/product-capture" ||
    pathname === "/tools/product-capture/instant"
  );
}
