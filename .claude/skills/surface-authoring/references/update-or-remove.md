# Surface authoring — updating or removing a manifest

Read this when adding, removing, or changing values on an existing manifest, or deleting a manifest entirely.

## Updating an existing manifest

- **Adding a value**: append to `surfaceSpecific` (with its `group`), update the scope-builder signature, re-sync. Existing bindings keep working — the new value just becomes available to bind against.
- **Removing a value**: delete from the manifest. Sync will mark its DB row as `dbValuesNotInManifest` in the drift report. Any existing `surface_value` bindings whose `target` matches will show up as `brokenAgentMappings` / `brokenToolMappings` — admin uses the drift dialog's "Remap to…" / "Remove" / "Keep & notify" actions. **Never silently delete** DB rows that have bindings against them.
- **Changing a field on an existing value** (description, label, alwaysAvailable, typicalCharCount, group): edit in place. Sync upserts. The drift report's `diffs` list will show the field-level diff until the sync is applied. If `alwaysAvailable` flipped from `false` → `true`, also update the scope-builder signature so the type system catches missing keys in surface code.

## Removing a manifest entirely

1. Delete the manifest file.
2. Remove the import + reference in `registry.ts`.
3. Run `pnpm check:surface-drift` (should pass).
4. Run the DB sync — drift report will show every value as `dbValuesNotInManifest`. Admin decides whether to purge or keep them while existing bindings migrate off.
5. Eventually drop the `ui_surface` row when no bindings remain. **Do not delete the row first** — it cascades.
