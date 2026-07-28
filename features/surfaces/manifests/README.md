# Surface Manifests

Code-first declarations of each UI surface's full contract: registered label, value groups, and the named runtime values the surface can supply. Mirrored into `ui.ui_surface` (label, value_groups, url_pattern, intro, parent) + `ui.ui_surface_value` (values incl. group_key/auto_context) so binding UIs, chrome, and the drift report always reflect what the surface actually is and emits.

This directory **owns the declarations**. The DB is a synced reflection. Admin UI for surface values is read-only — to change what a surface offers, you change the manifest here.

**Full authoring rules → invoke the `surface-authoring` skill. End-to-end registration → `surface-registration` skill.**

## The two laws

- **THE NAMING LAW — `label` is REQUIRED.** The ONE canonical display name (unique per client); every value/group `label` is equally canonical. No chrome hand-types or overrides labels — surface names render via `getSurfaceDisplayLabel`, on-page value/group text via `surfaceValueLabels(manifest)` / `surfaceGroupLabels(manifest)` (`../utils/surface-display.ts`). The `surfaceLabel` override prop is deleted and ESLint-banned.
- **THE COMPLETENESS LAW — declare everything the page loads.** Individual fields AND natural composite values are mandatory. Undeclared runtime keys show as "Undeclared (runtime only)" in the Surface Context window — defects.

## Adding a new manifest

1. **Create the file.** Name it `<local-slug>.manifest.ts`, kebab-case matching the suffix of `ui_surface.name`.
2. **Declare the full contract** — `surfaceName`, `label`, `urlPattern`, `inheritsFrom` (when true), `intro`, `groups`, `values` (baselines via `pickBaseline` + surface-specific, each with a `group`), `agentRoles` where the surface plugs in agents.

   ```ts
   import type {
     SurfaceManifest,
     SurfaceScopePayload,
     SurfaceValue,
     SurfaceValueGroup,
   } from "@/features/surfaces/types";
   import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

   const groups: SurfaceValueGroup[] = [
     { key: "thing_identity", label: "Thing identity", sortOrder: 100 },
     // curated band 0–899; general/baseline/inherited:* are RESERVED
   ];

   const surfaceSpecific: SurfaceValue[] = [
     {
       name: "current_thing_id",
       label: "Active thing",
       description: "UUID of the thing the user has focused. Empty when none.",
       valueType: "string",
       alwaysAvailable: false,
       typicalCharCount: 36,
       group: "thing_identity",
       sortOrder: 300,
     },
   ];

   export const myThingManifest: SurfaceManifest = {
     surfaceName: "matrx-user/my-thing",
     label: "My Thing",                       // REQUIRED — THE NAMING LAW
     urlPattern: "/things/[thingId]",
     groups,
     values: mergeBaselineValues(
       pickBaseline("selection", "content", "context"),
       surfaceSpecific,
     ),
   };

   // Type-safe scope helper — simple surfaces export it here; complex
   // surfaces build raw data → typed scope in a separate runtime module
   // (exemplar: features/marketing/lib/marketing-page-scope.ts).
   export function createMyThingScope(values: {
     current_thing_id?: string;
     selection?: string;
     content?: string;
     context?: Record<string, unknown>;
   }): SurfaceScopePayload {
     return values as SurfaceScopePayload;
   }
   ```

3. **Register it.** Edit `registry.ts`, import the manifest, and add it to `RAW_MANIFESTS`. `ALL_MANIFESTS` is derived (inheritance resolved, baselines auto-injected, provenance + groupKey stamped, values sorted curated → inherited → baseline; opt out of baselines with `skipBaselineValues`) — never edit it directly.

4. **Check + sync.** `pnpm check:surface-drift` (validates label presence/uniqueness, group rules, value invariants), then sync from the Surfaces admin page or `POST /api/admin/surfaces/sync-manifests`. Sync ALWAYS writes `ui_surface.label` + `value_groups`. Drift report: `GET /api/admin/surfaces/drift-report` (incl. `surfaceLabelDrifts` / `valueGroupsDrifts`).

## Conventions

- **`name`** — lower-snake-case, unique within the surface. The DB enforces `^[a-z][a-z0-9_]*$`.
- **`group`** — must reference a declared group key; ungrouped own values land in the synthesized `general` group.
- **`alwaysAvailable: true`** — only set when the surface code _will_ populate this on every launch. Most things are `false`. Inherited alwaysAvailable keys become REQUIRED params in a child's scope helper.
- **`typicalCharCount`** — rough average after stringification. Binding UIs use this to warn when bound to a large value.
- **`valueType`** — drives the binding UI input type. Almost everything stringifies for LLMs.
- **`evidenceSources`** — activates the **Document Evidence System** when a surface already knows a `processed_document_id`. The universal launcher adds the lazy processed-document context pointer before mappings run. Declare on the parent manifest; children inherit.

## Reference implementations

- **`marketing-page.manifest.ts`** — THE exemplar: 40+ values, 7 curated groups, inherits marketing-site → marketing-brand, scope builder in `features/marketing/lib/marketing-page-scope.ts`, emitter `PageWorkspace.tsx`.
- **`notes-editor.manifest.ts`** — the simple case (in-file scope helper).

## Removing a manifest

Delete the file and remove the import from `registry.ts`. The DB rows are NOT auto-deleted — the drift report will surface them as `dbValuesNotInManifest`, and an admin chooses whether to purge or keep them while existing mappings migrate off.

## See also

- `features/surfaces/types.ts` — type definitions (`SurfaceManifest`, `SurfaceValue`, `SurfaceValueGroup`).
- `features/surfaces/utils/surface-display.ts` — canonical label seam.
- `features/surfaces/services/manifest-sync.service.ts` — diff + sync logic.
- `features/surfaces/utils/value-mapping-resolver.ts` — runtime resolver.
- `features/scopes/FEATURE.md` — multi-scope binding contract.
