# P6 — Content Publishing Engine (`/learn` → DB-backed + SEO growth)

> **Status date:** 2026-07-07 · **Wave 1, priority tier 3** · One agent, human in the loop.
> Read [`README.md`](./README.md) and
> [`app/(core)/education/ROUTING.md`](../../../app/(core)/education/ROUTING.md) (the routing +
> metadata contract) before starting.

## Objective

Turn the demo-grade `/learn` surface into a real, DB-backed, SEO-optimized publishing engine —
the top-of-funnel organic-growth machine. New articles publish from an authoring UI without a
deploy; every education URL is enumerated, statically generated, OG-imaged, and structured-data
annotated so the marketing/discovery hub actually ranks and funnels into the app. Fully
independent of the study tools — zero cross-project blocking.

## Current state (verified — build on this)

- **`/learn` is a hardcoded TS registry:** `features/education/data/learn-content.ts` —
  `LEARN_DOCS`, exactly 8 docs; header comment says "Seeded here for the demo; the production
  engine will read `education.study_structured_section`." Index page maps the array;
  `[...slug]/page.tsx` looks up `LEARN_DOC_BY_SLUG`. **No DB read path, no authoring UI.**
- **`education.study_structured_section` exists and has 0 rows** — the intended table, never
  queried anywhere. Validate its shape fits structured sections (it predates the content); alter
  or replace it deliberately via migration, don't work around it.
- **The marketing/discovery hub is content-complete:** 5 axes (subjects/levels/exam-prep/
  study-aids/features) with rich `sections` + `SectionRenderer` + per-page canonical/OG/twitter
  metadata. Your job is machinery over it, not content.
- **SEO gaps (all verified):** `app/sitemap.xml/route.ts` is hand-written XML with a **single
  hardcoded `/education` URL** — no axis entries, no learn docs; **no `generateStaticParams`**
  anywhere under education; **no `opengraph-image`/`twitter-image` routes**; **axis pages emit
  zero JSON-LD** (only `LearnArticle.tsx:34-67` emits Article JSON-LD — keep it).
- Axis content includes `faq` blocks — ready-made `FAQPage` structured data.

## Scope

**IN**
- **DB-backed content:** finalize `education.study_structured_section` (or a successor table set)
  as the structured-content store — sections typed to the existing `SectionRenderer` vocabulary,
  draft/published status, slugs, metadata (title/description/keywords), authorship columns, RLS
  (public read for published, author/admin write).
- **Authoring/admin UI:** create/edit/preview/publish learn docs (structured sections, not a blob
  editor) — admin-gated; migrate the 8 seed docs into the DB and delete the TS registry (no
  fallback path — DB is the only source).
- **Rendering:** `/learn` index + `[...slug]` read from the DB with `'use cache'` +
  `cacheTag()`/`revalidateTag()` on publish, plus `generateStaticParams` for learn docs AND the
  five axis page families (their data is static TS — cheap win).
- **Sitemap:** replace the hardcoded XML with dynamic enumeration — every axis entry, every
  published learn doc, the hub pages; correct lastmod.
- **OG images:** per-doc + per-axis `opengraph-image` routes (branded, generated).
- **JSON-LD:** `FAQPage` from axis `faq` blocks; `Course`/`EducationalOrganization` where
  appropriate on axis pages; keep + verify the Article schema on learn docs.
- Keyword coverage pass: titles/descriptions/headings across learn + axes.

**OUT**
- The study tools. The axis *content* itself (done). Entitlements (learn content stays free +
  crawlable per the funnel model — P8's requirements doc). Blog/other marketing surfaces outside
  `/education`.

## Deliverables / Definition of done

1. Publish a brand-new learn article through the authoring UI → it renders at its URL **without a
   deploy**, appears in the sitemap, has an OG image, and carries valid Article JSON-LD.
2. The 8 seed docs are served from the DB; `LEARN_DOCS` is deleted (no dual path).
3. `sitemap.xml` enumerates every education URL (spot-check counts vs the axis registries).
4. Axis pages emit `FAQPage` JSON-LD that passes Google's Rich Results test; OG images render for
   docs and axes.
5. ISR/`revalidateTag` proven: edit → publish → live page updates without redeploy.
6. Admin map + feature docs updated; the education admin page links the authoring UI.

## Surfaces touched

- `app/(core)/education/learn/**` (DB-read rendering + `generateStaticParams`)
- Axis page families under `app/(core)/education/{subjects,levels,exam-prep,study-aids,features}`
  (static params + JSON-LD + OG — no content changes)
- `app/sitemap.xml/route.ts` (rewrite), new `opengraph-image` routes
- `features/education/data/` (registry → DB service; delete `learn-content.ts` seed after
  migration), new `features/education/publishing/**` (authoring)
- `education.study_structured_section` (+ migrations)
- A new admin authoring surface (admin-gated per the Admin Levels rules)

## Dependencies & contracts

- None blocking — fully parallel. Coordinate only with P7 on whether learn docs enter the
  shareable registry (recommend: no — they're published content, not user resources).
- Caching: dynamic-by-default repo — opt in deliberately with `'use cache'` + tags per CLAUDE.md.

## Build guidance

- Read the official Next.js guide referenced in CLAUDE.md for SSG/ISR + metadata patterns;
  `nextjs-patterns` skill is available.
- Section vocabulary: reuse the existing `SectionRenderer` types — the DB rows serialize the SAME
  section shapes; do not invent a second content schema.
- Authoring UI is admin surface: `requireSuperAdmin` default gate unless Arman lowers it.
- DB via `db-change` skills; `type-safety`; `finalize-and-ship`.

## Verification

Publish a test article end-to-end without deploying; validate JSON-LD via the Rich Results test;
curl the sitemap and diff URL counts against the registries; run Lighthouse SEO on a learn doc +
an axis page; confirm OG images via a share-preview debugger. Hand Arman the exact URLs.
