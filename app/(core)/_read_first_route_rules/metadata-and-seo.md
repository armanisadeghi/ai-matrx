# Route Metadata Rules

**Static** layout: `createRouteMetadata("/path", { title, description })`
→ `agents/layout.tsx`

**Dynamic** [id] layout: `createDynamicRouteMetadata("/path", { title, description })` in `generateMetadata`
→ `agents/[id]/layout.tsx`

**Sub-pages** with their own tab title: a sub-`layout.tsx` calls the same helper with
`titlePrefix` + a unique `letter` → `"Run | My Agent — AI Matrx"`. A page-level
`{ title }` alone renders `"Run — AI Matrx"` — the `(core)` template wraps only `%s`,
so the section/entity name is lost. No distinct title → export no metadata; the
nearest layout covers favicon+OG. Tab-title rule: the `route-metadata-favicons` skill.
→ `agents/[id]/run/layout.tsx` (dynamic) · `notes/[id]/diff/layout.tsx` (static)

**New route**: add favicon entry in `constants/favicon-route-data.ts`

**Guard**: run `pnpm check:route-metadata` (or `:strict`) to catch module roots
that bypass the helpers, omit an admin badge letter, or skip the registry. It checks
module roots only — sub-page metadata is unguarded.

**Utils**: `utils/route-metadata.ts`, `utils/favicon-utils.ts`
