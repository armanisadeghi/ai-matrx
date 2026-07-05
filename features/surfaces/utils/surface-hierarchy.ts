import type {
  SurfaceOption,
  SurfaceWithStats,
} from "@/features/surfaces/services/surfaces.service";

type NamedSurface = Pick<
  SurfaceOption,
  | "name"
  | "client_name"
  | "description"
  | "parent_surface_name"
  | "executor_name"
> & { is_active?: boolean | null };

/** Encode a surface name for the `/administration/surfaces/...` catch-all route. */
export function surfaceAdminHref(name: string): string {
  return `/administration/surfaces/${name
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

/** Map parent surface name → direct child names (sorted). */
export function buildChildrenByParent<T extends NamedSurface>(
  surfaces: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const s of surfaces) {
    if (!s.parent_surface_name) continue;
    const arr = map.get(s.parent_surface_name) ?? [];
    arr.push(s);
    map.set(s.parent_surface_name, arr);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name));
  }
  return map;
}

/** Walk parent_surface_name from `surfaceName` up to the root. Returns root-first. */
export function getAncestorChain<T extends NamedSurface>(
  surfaceName: string,
  byName: Map<string, T>,
): T[] {
  const chain: T[] = [];
  const seen = new Set<string>();
  let cur = byName.get(surfaceName)?.parent_surface_name ?? null;
  while (cur) {
    if (seen.has(cur)) break;
    seen.add(cur);
    const row = byName.get(cur);
    if (!row) break;
    chain.unshift(row);
    cur = row.parent_surface_name;
  }
  return chain;
}

/** All surface names sorted — every surface can be a parent filter target. */
export function listParentFilterOptions(surfaces: NamedSurface[]): string[] {
  return surfaces.map((s) => s.name).sort((a, b) => a.localeCompare(b));
}
