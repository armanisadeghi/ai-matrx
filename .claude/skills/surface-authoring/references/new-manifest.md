# Surface authoring — writing and registering a new manifest

Read this when creating a brand-new manifest file: the full-contract template, where the scope builder lives, registering it, and seeding + syncing its DB rows.

## Contents

- The manifest file (full-contract template)
  - The scope builder — where it lives
- Wiring it up
  - Seeding the `ui_surface` row
  - Seeding a new `ui_client` row

## The manifest file (full-contract template)

```ts
/**
 * Surface manifest — <Human surface name> (`<client>/<local>`).
 *
 * 1-2 sentence summary of what this surface is and when it emits values.
 */

import type {
  SurfaceManifest,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  { key: "thing_identity", label: "Thing identity", sortOrder: 100 },
  { key: "thing_content", label: "Thing content", sortOrder: 200 },
  // curated band is 0–899; general/baseline/inherited:* are reserved
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "current_thing_id",
    label: "Active thing",
    description:
      "UUID of the thing the user has focused. Empty when none is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "thing_identity",
    sortOrder: 300,
  },
  // ... EVERY field the page loads (THE COMPLETENESS LAW), plus natural
  // composite values (e.g. a `thing_summary` object alongside its fields)
];

export const <localSlug>Manifest: SurfaceManifest = {
  surfaceName: "<client>/<local>",
  label: "<Canonical Display Name>",          // REQUIRED — THE NAMING LAW
  urlPattern: "/things/[thingId]",
  inheritsFrom: "<client>/<parent>",          // omit when standalone
  intro: `<surface_intro>
What this surface IS, what the user does here, how to read its values.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  agentRoles: [ /* see End-to-end layered registration in SKILL.md */ ],
};
```

### The scope builder — where it lives

**Simple surface** (few values, trivially assembled): export `create<LocalSlug>Scope(values): SurfaceScopePayload` from the manifest file itself — see `notes-editor.manifest.ts`. Required keys (every `alwaysAvailable: true` value) get no `?`; optional keys get `?`. THIS is the "a UI cannot lie" enforcement.

**Complex surface** (raw workspace data needs parsing/derivation): put a **runtime builder module** beside the feature, not in the manifest — see `features/marketing/lib/marketing-page-scope.ts` (`buildMarketingPageScope`). The pattern:

1. The module takes the page's RAW loaded data (records, snapshots, memberships) and derives the typed values (parse stored JSON, compute availability, map rows).
2. When inheriting, it builds the parent scope first and spreads it: **`...base` first, child keys after — child wins.**
3. It returns through the manifest's `create<LocalSlug>Scope(...)` so TS still enforces the declaration.
4. The page's emitter (e.g. `PageWorkspace.tsx`) calls the builder at **trigger time** with live refs, never stale state.

## Wiring it up

1. **Create the file** at `features/surfaces/manifests/<local-slug>.manifest.ts`.
2. **Register** in `features/surfaces/manifests/registry.ts`:
   ```ts
   import { <localSlug>Manifest } from "./<local-slug>.manifest";
   // ...
   const RAW_MANIFESTS: readonly SurfaceManifest[] = [
     // ...existing
     <localSlug>Manifest,
   ];
   ```
   `ALL_MANIFESTS` is derived from `RAW_MANIFESTS` (inheritance + baseline injection + provenance/group resolution) — never edit it directly.
3. **Run BOTH checks locally** before pushing:
   ```bash
   pnpm check:surface-drift && pnpm check:surface-routes
   ```
   `check:surface-drift` validates manifest invariants (unique names, regex, valueType, surface-name shape, **label presence + per-client uniqueness, group key/band/label rules**). It validates manifests *against themselves* and is blind to route coverage — which is how ten live `/agents/shortcuts` routes pointed at a surface with **no manifest and no DB row** until 2026-08-17.
   `check:surface-routes` closes that: it walks every `(core)` route through the real resolver. A mapping pointing at a surface with no manifest **fails** (a PHANTOM); a route resolving to nothing is **reported** unless it carries a written reason in that script's `DELIBERATELY_UNMAPPED` list. Never silence a route by adding it there without a real reason — that re-creates the blindness.
4. **Sync the DB**:
   - From the Surfaces admin page (`/administration/ui/surfaces`) → "Sync Manifests" button.
   - Or via API: `POST /api/admin/surfaces/sync-manifests` (super-admin gated).
   - The endpoint diffs `ALL_MANIFESTS` against the mirror and upserts — including `ui_surface.label` + `value_groups` (ALWAYS written) and per-value `group_key`. If a `ui_surface` row is missing for the surface, it's reported as `skippedMissingSurface` — you must seed the `ui_surface` row first.

### Seeding the `ui_surface` row

If you're adding a brand-new surface (not just adding values to an existing one), the `ui_surface` row must exist before the sync will accept SurfaceValues:

- Easiest path: open `/administration/ui/surfaces` → "New Surface" → pick the client + enter the name.
- Or via SQL (admin only, ON CASCADE on the FKs):
  ```sql
  INSERT INTO ui.ui_surface (name, client_name, description, sort_order, is_active)
  VALUES ('<client>/<local>', '<client>', '<1-sentence description>', 300, true);
  ```
- If the surface is in the curated candidates list (`features/surfaces/data/surface-candidates.ts`), the admin "Add from candidates" dialog seeds it in one click.

### Seeding a new `ui_client` row

Rare. Only when the user explicitly asks for a new client domain (e.g. a new mobile app). Confirm first; then:

```sql
INSERT INTO ui.ui_client (name, description, sort_order, is_active)
VALUES ('<new-client>', '<description>', 200, true);
```
