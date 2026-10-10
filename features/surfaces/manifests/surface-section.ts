/**
 * The app section a surface's page sits in ("/marketing/[brandId]" →
 * "Marketing") — the navigation's own owner for the page's route, the same
 * one the sidebar and header light up, never a second map. Handed to
 * `@ai-matrx/chat` through the manifest seam (`getSurfaceSection`).
 */
// The INDEX lookup (urlPattern is an index field) — never the full registry,
// which would put every manifest body in the first load.
import { getManifest } from "@ai-matrx/chat/surfaces/runtime/registry";
import { primaryNavItems } from "@/features/shell/constants/nav-data";
import { findOwningNavItem } from "@/features/shell/utils/is-nav-group-active";

export function getSurfaceSection(surfaceName: string): string | null {
  const pattern = getManifest(surfaceName)?.urlPattern;
  if (!pattern?.startsWith("/")) return null;
  return findOwningNavItem(pattern, primaryNavItems)?.label ?? null;
}
