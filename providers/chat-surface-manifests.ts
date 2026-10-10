// providers/chat-surface-manifests.ts
//
// THE ONE place this app hands its surface manifests to `@ai-matrx/chat`
// (CPM-009a, P19; index + body since BUNDLE-3). The package answers every
// synchronous read from the generated INDEX (`SURFACE_INDEX`, delivery fields
// of every surface); a surface's BODY (descriptions, groups, write targets,
// client tools, roles) loads lazily through `loadSurfaceBodyRecord`.
//
// Side-effect module, isomorphic (no "use client"): `app/Providers.tsx`
// imports it for the server layer and mounts `ChatSurfaceRegistrations` for
// the browser, so server and client run the SAME index + body API. Jest
// registers the full registry through the same seam in `jest.setup.ts`.
import {
  createIndexedSurfaceSource,
  getManifest,
  registerSurfaceManifests,
} from "@ai-matrx/chat/surfaces/runtime/registry";
import {
  registerLoadedValueDeclarations,
  type LoadedValueDeclarationLookup,
} from "@ai-matrx/chat/surfaces/runtime/loaded-value-check";
import { BASELINE_VALUES } from "@ai-matrx/chat/surfaces/manifests/_baseline.manifest";
import { SURFACE_INDEX } from "@/features/surfaces/manifests/generated/surface-index.generated";
import { loadSurfaceBodyRecord } from "@/features/surfaces/manifests/surface-body-loader";
import { getSurfaceSection } from "@/features/surfaces/manifests/surface-section";

registerSurfaceManifests(
  createIndexedSurfaceSource({
    encoded: SURFACE_INDEX,
    baselineValues: Object.values(BASELINE_VALUES),
    loadBody: loadSurfaceBodyRecord,
    getSurfaceSection,
  }),
);

// The runtime's loaded-value check (ALC-14) reads declared value NAMES — the
// index carries them, so the check works before any body loads.
registerLoadedValueDeclarations(
  (surfaceName) => getManifest(surfaceName) as unknown as ReturnType<LoadedValueDeclarationLookup>,
);
