/**
 * THE SURFACE BODY LOADER (BUNDLE-3, step 1).
 *
 * The browser's first load carries only the generated surface index
 * (`generated/surface-index.generated.ts`). A surface's BODY — its full
 * resolved manifest — comes from the full registry, which this loader pulls in
 * as ONE lazy chunk the first time any body is asked for (a surface mounting
 * prefetches it). Step 2 replaces this with a per-surface loader map.
 */
import type { SurfaceBodyRecord } from "@ai-matrx/chat/surfaces/runtime/registry";

export async function loadSurfaceBodyRecord(
  surfaceName: string,
): Promise<SurfaceBodyRecord | undefined> {
  const registry = await import("./registry");
  const body = registry.getManifest(surfaceName);
  const raw = registry.getRawManifest(surfaceName);
  return body && raw ? { body, raw } : undefined;
}
