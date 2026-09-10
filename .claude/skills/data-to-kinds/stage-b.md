---
type: Reference
title: "data-to-kinds — Stage B (Render)"
description: "The Stage B (Render, matrx-frontend) procedure: component sweep, types, compiled mirrors, copy controls, components, kind_component rows, activation, live demo; read it when you are Stage B of a run. Companion to the data-to-kinds skill."
tags: [data-to-kinds, skills, stage-b]
timestamp: 2026-09-10T00:00:00Z
---

# Stage B — Render (matrx-frontend)

1. **Sweep `content_ir.kind_component` for every family slug first.** A stale ACTIVE
   `source='db'` override authored against an old shape silently wins over your bundled
   component — deactivate (never delete) with a note. Then **survey existing renderers** for this
   data family (the Inventory Law — the platform has usually built them several times; search had
   six). Name the best-of-breed, CONSUME its utilities (search: `features/tool-call-visualization/
   renderers/search/parseSearch.ts`), and design ONE canonical component per kind. Legacy D-grade
   displays are converged at cutover (Stage D), not forked now.
2. **Generate the types from the registry:** `pnpm shape:types <slug> [<slug>…]` →
   `features/content-ir/kinds/generated/<slug>.gen.ts` (self-contained, drift-checked by
   `pnpm check:kind-types`; header carries the registry version). Never hand-edit a `.gen.ts`;
   a collection whose registry row is cutover-gated has NO `.gen.ts` until cutover.
3. **Write the compiled parser mirrors** — `features/content-ir/kinds/<family>.ts`: one
   `KindSchema` + `KindDefinition` per kind (`legacyBlockType` = slug, `object/kind` +
   `array/itemKinds` for nested kinds, `json[]` for plain sub-structure), uniform
   `{value, isComplete}` streaming bridge; export `<FAMILY>_KIND_DEFINITIONS` and spread it into
   `features/content-ir/registry/system-kinds.ts`. (Rows whose schema can't be flattened have
   `kind_definition.data` NULL, so the streaming parser has no warm schema without this mirror —
   still hand-written; SDK gap.)
4. **Every data surface carries COPY controls** (Arman, 2026-08-24): *"when you have something
   like this, in almost all instances, you're going to want to copy things. And considering the
   fact that we specialize in AI, that's one of the most important things we need to offer."* The
   canonical pair is `components/agent-copy/CopyButtons` — plain Copy + the `CopyForAiIcon`
   Copy-for-AI, `json` as a menu item, never a third button. On a collection or a rich card the
   AI copy is **graded** (`aiVariants`): the declared `ai_view` first, the body alone second, the
   full payload as the automatic "Everything" escape hatch. Put the pair on the card header AND on
   every section, each scoped to that section's data.
5. **Build the components** in `components/mardown-display/blocks/<family>/` — one per kind,
   defensive readers (a half-arrived value is a NORMAL state), the collection delegating every
   nested instance via a static sibling map with a db-override seam (pattern:
   `search-kinds/SearchKindNested.tsx`), never a per-item `next/dynamic` re-entry, never
   reimplementing a nested kind. Register each in `BlockComponentRegistry.tsx`, the dispatch
   shape table (`block-dispatch.tsx`), the `FeSynthesizedBlockType`/`ShapeBlockType` unions, and
   the pin test `__tests__/component-registry.test.ts`.
9. **Land the `kind_component` rows** as one idempotent migration
   (`migrations/content_ir_<family>_components.sql`, role=`output`, source=`bundled`,
   platform web), apply, ledger it.
6. **Activate:** re-run the family's publish (`publish_kind_catalog.py … --apply`; the search
   pilot's legacy path is `scripts/seed_search_kind_family.py`) — the dual gate now passes — and
   VERIFY by SQL: `select kind, is_active, metadata->>'maturity' from content_ir.kind_definition
   where kind in (…)`. Every family slug `is_active=true` except cutover-gated collections.
7. **Ship the live demo — the standing proof format.** `app/(dev)/demos/<family>/page.dev.tsx`:
   an input, a real call to the Stage A endpoint via `useBackendApi` + `consumeStream`, the
   result rendered through `KindInstanceRender` (the production route path), the translation
   report shown (unknown keys = red banner). ZERO mocks, zero pasted fixtures. Verify in the
   in-app browser against localhost (`MATRX_PREVIEW_PROFILE=user pnpm preview:start`; `/demos/*`
   is parked under the default profile) and on `https://demos.aimatrx.com/demos/<family>` after
   deploy; also render each item kind on the admin preview
   `/administration/utilities/kind-registry/<slug>`. Untested-in-browser = untested.
8. **Gate: Arman approves the rendering on the demo.** Iterate on look there. Update the ledger
   (Stage B DONE, demo URL), push, and **fire V + D** (first run of a pilot: fire C instead, which
   fires them).
