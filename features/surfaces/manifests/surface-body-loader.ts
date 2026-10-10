/**
 * THE SURFACE BODY LOADER (BUNDLE-3, step 2: one body file per surface).
 *
 * The browser's first load carries only the generated surface index
 * (`generated/surface-index.generated.ts`). A surface's BODY — its full
 * resolved manifest — loads from its OWN manifest file plus its parent chain's
 * files (`generated/surface-body-loaders.generated.ts`, written by
 * `pnpm generate:surface-index`), resolved through the same declaration
 * registry the full registry uses. Never the whole registry: a page pays for
 * its own surface only. `pnpm check:surface-index` proves every loader's body
 * equals the full registry's, field by field.
 */
import type { SurfaceBodyRecord } from "@ai-matrx/chat/surfaces/runtime/registry";

/**
 * Nothing here is in the first load: the loader map and the resolver are one
 * small lazy chunk, and each surface's files are their own chunks.
 */
export async function loadSurfaceBodyRecord(
  surfaceName: string,
): Promise<SurfaceBodyRecord | undefined> {
  const [{ SURFACE_BODY_LOADERS }, { resolveSurfaceChain }] = await Promise.all([
    import("./generated/surface-body-loaders.generated"),
    import("./surface-declaration-registry"),
  ]);
  const load = SURFACE_BODY_LOADERS[surfaceName];
  if (!load) return undefined;
  return resolveSurfaceChain(await load());
}
