# Surface authoring — updating or removing a manifest

Read this when adding, removing, or changing values on an existing manifest, or deleting a manifest entirely.

## Updating an existing manifest

- **Adding a value**: append to `surfaceSpecific` (with its `group`), update the scope-builder signature, then run the focused sync and matching `--check` from Layer 4. Existing bindings keep working — the new value just becomes available to bind against.
- **Removing a value**: before deleting it, inspect its bindings and dependent runtime use. After deletion, the drift report derives the retained mirror row as `dbValuesNotInManifest`. Any existing `surface_value` bindings whose `target` matches will show up as `brokenAgentMappings` / `brokenToolMappings` — admin uses the drift dialog's "Remap to…" / "Remove" / "Keep & notify" actions. **Never silently delete** DB rows that have bindings against them.
- **Changing a field on an existing value** (description, label, alwaysAvailable, typicalCharCount, group): edit in place, then run the focused sync and matching `--check` from Layer 4. The drift report's `diffs` list will show the field-level diff until the sync is applied. If `alwaysAvailable` flipped from `false` → `true`, also update the scope-builder signature so the type system catches missing keys in surface code.

## Removing a manifest entirely

1. Run `pnpm check:surface-impact <surface>` and inspect dependent runtime use while the manifest identity still exists; migrate consumers before deleting the identity.
2. Delete the manifest file.
3. Remove the import + reference in `registry.ts`.
4. Run `pnpm check:surface-drift` (should pass).
5. Inspect the drift report: it derives every former mirror row as `dbValuesNotInManifest` after the deletion. Do not sync the deleted name; the focused transaction deliberately refuses an unknown manifest and does not delete stale rows. An admin decides whether to purge or keep them while existing bindings migrate off.
6. Eventually drop the `ui_surface` row when no bindings remain. **Do not delete the row first** — it cascades.
