/**
 * DEV GUARD: a mounted surface with no `ui.ui_surface` row. Every agent send
 * from such a surface fails with "Surface '<name>' is not registered in
 * ui.ui_surface." (2026-10-10: marketing-social-outliers / -kpis / -swipe /
 * -ads shipped with manifests and no rows). The release applies the sync
 * (`scripts/check-release-surface-registration.ts --apply`); this makes the
 * gap loud in the browser console on a dev build before anyone presses Send.
 */
import {
  getGlobalSurfaceRegistry,
} from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { getSurfaceByName } from "@ai-matrx/chat/surfaces/services/surfaces.service";

export const MISSING_SURFACE_ROW_MESSAGE = (name: string): string =>
  `SURFACE ROW MISSING: '${name}' is mounted but has no ui.ui_surface row — every agent send from it will fail with "Surface '${name}' is not registered in ui.ui_surface." Fix: pnpm exec tsx scripts/sync-surface-manifests-direct.ts --surface ${name}`;

/** Names in `mounted` that `exists` reports absent; each name is asked once (`seen`). */
export async function findMissingSurfaceRows(
  mounted: readonly string[],
  exists: (name: string) => Promise<boolean>,
  seen: Set<string>,
): Promise<string[]> {
  const missing: string[] = [];
  for (const name of new Set(mounted)) {
    if (seen.has(name)) continue;
    seen.add(name);
    if (!(await exists(name))) missing.push(name);
  }
  return missing;
}

export function installSurfaceRowGuard(
  report: (message: string) => void = (m) => console.error(m),
): () => void {
  if (process.env.NODE_ENV === "production") return () => {};
  const seen = new Set<string>();
  const registry = getGlobalSurfaceRegistry();
  const exists = async (name: string): Promise<boolean> => {
    try {
      return (await getSurfaceByName(name)) !== null;
    } catch {
      seen.delete(name); // an unreadable lookup is not "missing"; ask again later
      return true;
    }
  };
  const check = () => {
    void findMissingSurfaceRows(
      registry.depths().map((entry) => entry.surfaceName),
      exists,
      seen,
    ).then((missing) => {
      for (const name of missing) report(MISSING_SURFACE_ROW_MESSAGE(name));
    });
  };
  check();
  return registry.subscribe(check);
}
