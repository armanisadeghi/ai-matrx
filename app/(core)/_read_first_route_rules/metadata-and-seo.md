# Route Metadata Rules

**Static** layout: `createRouteMetadata("/path", { title, description })`
→ `agents/layout.tsx`

**Dynamic** [id] layout: `createDynamicRouteMetadata("/path", { title, description })` in `generateMetadata`
→ `agents/[id]/layout.tsx`

**Sub-pages**: return `{ title }` only. Layout provides favicon+OG.
→ `agents/[id]/run/page.tsx`

**New route**: add favicon entry in `constants/navigation-links.tsx`

**Utils**: `utils/route-metadata.ts`, `utils/favicon-utils.ts`