# Education Publishing Engine (`features/education/publishing`)

> **P6 Phase A.** The DB-backed `/education/learn` study-guide engine + the Education Hub SEO machinery. Publish a study guide from the UI → it's live, indexed, OG-imaged, and in the sitemap **without a deploy.**
> Read this before touching learn-doc content, the sitemap, OG images, or axis JSON-LD.

## What it is

`/education/learn/<...slug>` used to render from a hardcoded TS registry (`data/learn-content.ts`, deleted). It now renders from **`education.learn_doc`** — structured study guides authored/edited/published by super-admins. Content is the canonical `EduSection[]` vocabulary (`features/education/types.ts`) stored as JSONB — **one content schema, ever**; the public page uses the same `SectionRenderer` as the marketing/axis pages.

## Data model — `education.learn_doc`

Canonical base entity (id, organization_id, created_by/at, updated_by/at, deleted_at, version, metadata) + `visibility` + publishing payload (`slug` unique, `title`, `summary`, `subject`, `letter`, `keywords[]`, `sections` jsonb, `related` jsonb, `content_updated_at`, `published_at`).

**Publication = visibility.** `private` = draft (owner + super-admin only, via std RLS). `public` = published → anon `pub_read` returns it (search-indexable). Draft/published is derived, never a separate column.

- Registered: `platform.entity_types` + `platform.shareable_resource_registry` (token `learn_doc`).
- RLS: canonical `iam.apply_rls('education','learn_doc','learn_doc','entity')` — anon reads only `visibility='public'`. Table GRANTs added explicitly (`anon` SELECT, `authenticated` CRUD, `service_role` ALL).
- Migration: `migrations/education_learn_doc.sql`.

## Writes — super-admin-gated RPCs only (protected-style)

All authoring flows through `public.` SECURITY DEFINER RPCs gated by `is_super_admin()`, so **any** super-admin can edit **any** doc (not just the creator) while RLS stays strict:
`edu_learn_doc_upsert` (create/update draft) · `edu_learn_doc_set_status` (publish/unpublish) · `edu_learn_doc_delete` (soft) · `edu_learn_doc_admin_list` (all incl. drafts).

## Entry points

| File | Role |
|---|---|
| `queries.ts` | Public server reads (anon cookie-free client, `unstable_cache` tagged `education-learn-docs`, ISR). `listPublishedLearnDocs` / `getPublishedLearnDoc` (**derived from the list — a per-slug `unstable_cache` collapses on static keyParts**) / `getPublishedLearnDocTitles`. |
| `actions.ts` | `"use server"` admin mutations → RPC → `updateTag('education-learn-docs')` (read-your-own-writes) → public surfaces update without a deploy. |
| `sitemap.ts` | Every axis index/entry + published learn doc + live tool → `app/sitemap.xml/route.ts`. |
| `ogImage.tsx` | Shared branded OG renderer; thin `opengraph-image.tsx` routes for learn docs + all 5 axis families. |
| `components/LearnDocAdmin.tsx` | The authoring UI (list + JSON-sections editor with live `SectionRenderer` preview). |
| `app/(core)/education/learn/admin/page.tsx` | Self-gating super-admin route (explicit segment beats the `[...slug]` catch-all). |

## SEO surfaces (Phase A deliverables)

- **ISR + static params:** learn `[...slug]` and all 5 axis `[slug]` routes have `generateStaticParams` + `dynamicParams` + `revalidate=3600` (`axisStaticParams` in `route-helpers.ts`).
- **Sitemap:** dynamic, enumerates the whole hub (was one hardcoded `/education` URL).
- **OG images:** per learn doc + per axis entry.
- **JSON-LD:** `LearnArticle` emits `Article`; `AxisDetail` emits `FAQPage` (from any `faq` section) + `Course` (subjects / exam-prep).

## Invariants

- **No dual content path.** `LEARN_DOCS` registry is deleted; DB is the only source.
- **Never a raw per-slug `unstable_cache`** with a static keyParts array — it silently collapses all slugs onto one entry. Derive from the list, or put the arg in keyParts.
- **Writes never bypass the RPCs** — no direct `.from('learn_doc').insert()` from app code.
- Anon read requires the schema-level GRANT **and** the `pub_read` policy — both, or signed-out visitors get nothing / a 404.

## Open / next

- **Agent-assisted drafting** (Phase A stretch): a "draft sections with AI" flow (agent → `EduSection[]` JSON → human review → publish). The editor already accepts pasted sections JSON, so agent output drops straight in; the in-UI generate button is the remaining piece.
- Visual block editor (currently JSON textarea + live preview).
- Phase B (exam hub, consumes P1) and Phase C (community library, consumes P7) — see `docs/proposals/education-projects/P6-content-publishing.md`.

## Change log

- **2026-07-07** — Phase A shipped: `education.learn_doc` + RPCs + RLS, 8 seed docs migrated off the deleted registry, DB-backed `/learn` (ISR + static params), dynamic sitemap, per-doc/per-axis OG images, FAQPage/Course JSON-LD, super-admin authoring UI.
