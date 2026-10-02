/**
 * The values a surface sends on every run — the only page values a shortcut
 * or binding launch receives beyond what it mapped (W-31; the boundary lives
 * in `mapScopeToInstanceWithSurface`, `features/agents/utils/scope-mapping.ts`).
 *
 *   - manifest values marked `alwaysOn: true`;
 *   - the manifest's document evidence (`evidenceSources`: its id / file-id
 *     values and the attached-document keys), which by contract never
 *     depends on an agent's mapping (`document-evidence.ts`).
 */

import type { ApplicationScope } from "../../agents/types/scope.types";
import { getManifest } from "../runtime/registry";
import { ATTACHED_DOCUMENT_KEY_PREFIX } from "./document-evidence";

export function alwaysOnSurfaceKeys(
  surfaceName: string | null | undefined,
  applicationScope: ApplicationScope | Record<string, unknown> | null | undefined,
): Set<string> {
  const keys = new Set<string>();
  const manifest = surfaceName ? getManifest(surfaceName) : undefined;
  for (const value of manifest?.values ?? []) {
    if (value.alwaysOn) keys.add(value.name);
  }
  for (const declaration of manifest?.evidenceSources ?? []) {
    // The document handle itself — with a file id the evidence key is
    // skipped (`document-evidence.ts`), so the id is what carries it.
    keys.add(declaration.idValue);
    if (declaration.fileIdValue) keys.add(declaration.fileIdValue);
  }
  if (manifest?.evidenceSources?.length) {
    const context = applicationScope?.context;
    if (context && typeof context === "object" && !Array.isArray(context)) {
      for (const key of Object.keys(context)) {
        if (key.startsWith(ATTACHED_DOCUMENT_KEY_PREFIX)) keys.add(key);
      }
    }
  }
  return keys;
}
