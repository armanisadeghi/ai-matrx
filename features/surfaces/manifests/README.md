# Surface Manifests

Code-first declarations of the named runtime values each UI surface can supply. Mirrored into `public.ui_surface_value` so binding UIs (agent mapping editors, tool mapping editors, audit views) always show what the surface actually emits.

This directory is the **single source of truth**. The DB is a synced reflection. Admin UI for surface values is read-only — to change what a surface offers, you change the manifest here.

## Adding a new manifest

1. **Create the file.** Name it `<surface-slug>.manifest.ts`. Use kebab-case matching the surface slug from `ui_surface.name` (just the suffix after the client prefix is fine for the filename — full slug is in the manifest body).
2. **Declare the manifest.** Spread baseline values where they apply, append surface-specific values.

   ```ts
   import type { SurfaceManifest, SurfaceValue, SurfaceScopePayload } from "@/features/surfaces/types";
   import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

   const surfaceSpecific: SurfaceValue[] = [
     {
       name: "current_thing_id",
       label: "Active thing",
       description: "UUID of the thing the user has focused. Empty when none.",
       valueType: "string",
       alwaysAvailable: false,
       typicalCharCount: 36,
       sortOrder: 300,
     },
   ];

   export const myThingManifest: SurfaceManifest = {
     surfaceName: "matrx-user/my-thing",
     values: mergeBaselineValues(
       pickBaseline("selection", "content", "context"),
       surfaceSpecific,
     ),
   };

   // Type-safe scope helper used by the surface code at runtime:
   export function createMyThingScope(values: {
     current_thing_id?: string;
     selection?: string;
     content?: string;
     context?: Record<string, unknown>;
   }): SurfaceScopePayload {
     return values as SurfaceScopePayload;
   }
   ```

3. **Register it.** Edit `registry.ts`, import the manifest, and add it to `ALL_MANIFESTS`.

4. **Sync the DB.** Run the manifest sync from the Surfaces admin page (Phase 2), or hit `POST /api/admin/surfaces/sync-manifests` directly. Drift report is at `GET /api/admin/surfaces/drift-report`.

## Conventions

- **`name`** — lower-snake-case, unique within the surface. The DB enforces `^[a-z][a-z0-9_]*$`.
- **`alwaysAvailable: true`** — only set when the surface code _will_ populate this on every launch. Most things are `false`.
- **`typicalCharCount`** — rough average after stringification. Binding UIs use this to warn when bound to a large value.
- **`valueType`** — drives the binding UI input type. Almost everything stringifies for LLMs.

## Removing a manifest

Delete the file and remove the import from `registry.ts`. The DB rows are NOT auto-deleted — the drift report will surface them as `dbValuesNotInManifest`, and an admin chooses whether to purge or keep them while existing mappings migrate off.

## See also

- `features/surfaces/types.ts` — type definitions.
- `features/surfaces/services/manifest-sync.service.ts` — diff + sync logic.
- `features/surfaces/utils/value-mapping-resolver.ts` — runtime resolver.
- `features/scopes/FEATURE.md` — multi-scope binding contract.
