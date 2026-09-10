# Surface authoring — write targets

Read this when a surface declares, or should declare, `writeTargets` that agent results write into.

## Write targets — the WRITE half of a surface (v1, 2026-07-29)

A surface may declare **`writeTargets`** (`SurfaceWriteTarget` in `features/surfaces/types.ts`): named paths agent results can write INTO the page. Read `features/surfaces/FEATURE.md` § Surface writeback before adding one. Rules:

- **Declare in the manifest, wire on the provider.** Each target gets a handler in `SurfaceRuntimeProvider getWriteHandlers={() => ({...})}`; a declared-but-unwired target fails LOUDLY at apply time — never ship one without the other.
- **Every caller goes through `applySurfaceWrite`** (`features/surfaces/runtime/surface-writeback.ts`) or the `apply_surface_write` kind action — never a bespoke callback into the page.
- **`mode` is the safety contract:** `draft` (stage into the editor, USER saves — the preferred default), `entity` (immediate persist via the page's canonical write path — reserve for writes safe to land directly), `ui` (ephemeral selection/focus/navigation).
- **`updatesValue`** names the read-twin SurfaceValue when 1:1 (the evidence loop). Same naming regime as values (snake_case, unique, declared group); `pnpm check:surface-drift` validates all of it.
- **Handlers validate and THROW on bad input** — the seam converts throws to safe error envelopes; never validate loosely to "be nice".
- **Code-only v1:** not mirrored to the DB yet. Reference implementation: `content-plan-node.manifest.ts` + `NodePanel.tsx` (10 draft field targets + `save_node`).
