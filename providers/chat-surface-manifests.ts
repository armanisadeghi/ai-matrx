// providers/chat-surface-manifests.ts
//
// THE ONE place this app hands its surface manifests to `@ai-matrx/chat`
// (CPM-009a, P19). The package reads manifests only through
// `@ai-matrx/chat/surfaces/runtime/registry`; this module registers the app
// registry (`features/surfaces/manifests/registry.ts`, every manifest in
// `features/surfaces/manifests/**`) there.
//
// Side-effect module, isomorphic (no "use client"): `app/Providers.tsx`
// imports it for the server layer and mounts `ChatSurfaceRegistrations` for
// the browser, so server components (surface labels) and client code read the
// same manifests. Jest registers the same registry lazily in `jest.setup.ts`.
import {
  createSurfaceSourceFromRegistry,
  registerSurfaceManifests,
} from "@ai-matrx/chat/surfaces/runtime/registry";
import {
  getAllManifests,
  getManifest,
  getRawManifest,
  getSurfaceAncestry,
  getSurfaceChildren,
} from "@/features/surfaces/manifests/registry";
import { getSurfaceSection } from "@/features/surfaces/manifests/surface-section";

// INTERIM (BUNDLE-3): the package's index + body seam over the FULL registry
// (every body answers synchronously). The generated-index source that keeps
// manifest bodies out of the first load replaces this once its encoding ships.
registerSurfaceManifests(
  createSurfaceSourceFromRegistry({
    getManifest,
    getAllManifests,
    getRawManifest,
    getSurfaceAncestry,
    getSurfaceChildren,
    getSurfaceSection,
  }),
);
