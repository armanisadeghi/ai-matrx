# Education Publishing Engine (`features/education/publishing`)

> **P6 Phase A.** The DB-backed `/education/learn` study-guide engine + the Education Hub SEO machinery. Publish a study guide from the UI → it's live, indexed, OG-imaged, and in the sitemap **without a deploy.**
> Read this before touching learn-doc content, the sitemap, OG images, or axis JSON-LD.

## What it is

`/education/learn/<...slug>` used to render from a hardcoded TS registry (`data/learn-content.ts`, deleted). It now renders from **`education.learn_doc`** — structured study guides authored/edited/published by super-admins. Content is the canonical `EduSection[]` vocabulary (`features/education/types.ts`) stored as JSONB — **one content schema, ever**; the public page uses the same `SectionRenderer` as the marketing/axis pages.

## Data model — `education.learn_doc`

Canonical base entity (id, organization_id, created_by/at, updated_by/at, deleted_at, version, metadata) + `visibility` + publishing payload (`slug` unique, `title`, `summary`, `subject`, `letter`, `keywords[]`, `sections` jsonb, `related` jsonb, `content_updated_at`, `published_at`).

**Publication = visibility.** `personal` = draft (owner + super-admin only, via std RLS). `public` = published → anon `pub_read` returns it (search-indexable). Draft/published is derived, never a separate column.

- Registered: `platform.entity_types` + `platform.shareable_resource_registry` (token `learn_doc`).
- RLS: canonical `iam.apply_rls('education','learn_doc','learn_doc','entity')` — anon reads only `visibility='public'`. Table GRANTs added explicitly (`anon` SELECT, `authenticated` CRUD, `service_role` ALL).
- Migration: `migrations/education_learn_doc.sql`.

## Writes — super-admin-gated RPCs only (protected-style)

All authoring flows through `public.` SECURITY DEFINER RPCs gated by `is_super_admin()`, so **any** super-admin can edit **any** doc (not just the creator) while RLS stays strict:
`edu_learn_doc_upsert` (create/update draft) · `edu_learn_doc_set_status` (publish/unpublish) · `edu_learn_doc_delete` (soft) · `edu_learn_doc_admin_list` (all incl. drafts).

## Entry points

| File                                        | Role                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `queries.ts`                                | Public server reads (anon cookie-free client, `unstable_cache` tagged `education-learn-docs`, ISR). `listPublishedLearnDocs` / `getPublishedLearnDoc` (**derived from the list — a per-slug `unstable_cache` collapses on static keyParts**) / `getPublishedLearnDocTitles` / `getExamLearnDocs(examSlug)` (docs keyworded with an exam slug — powers the exam-prep hub's curated study-guide block, derived from the cached list). |
| `actions.ts`                                | `"use server"` admin mutations → RPC → `updateTag('education-learn-docs')` (read-your-own-writes) → public surfaces update without a deploy.                                                                                                                                                                                                                                                                                        |
| `sitemap.ts`                                | Every axis index/entry + published learn doc + live tool → `app/sitemap.xml/route.ts`.                                                                                                                                                                                                                                                                                                                                              |
| `ogImage.tsx`                               | Shared branded OG renderer; thin `opengraph-image.tsx` routes for axis families; learn docs use `/education/learn/og/[...slug]` route handler (catch-all can't host file-based OG).                                                                                                                                                                                                                                                 |
| `components/LearnDocAdmin.tsx`              | The authoring UI (list + visual `EduSection` block editor + optional Advanced JSON + live `SectionRenderer` preview).                                                                                                                                                                                                                                                                                                               |
| `components/SectionBlockEditor.tsx`         | The reusable non-technical editor for all seven `EduSection` kinds: add, edit, reorder and remove blocks/items without touching JSON.                                                                                                                                                                                                                                                                                               |
| `components/ExamContentPipeline.tsx`        | Super-admin batch authoring: select processed official sources → IC-3 exact-passage retrieval (focused query, then an exam-name lexical-safe retry inside the same explicit corpus) → three private exam-deck drafts through `flashcards.generate_from_source` → per-card `flashcards.verify_against_source` pass → explicit publish/curate action.                                                                                 |
| `examContentPipeline.ts`                    | The three launch-floor deck plans and the fail-closed grounding gate shared with tests.                                                                                                                                                                                                                                                                                                                                             |
| `verifyGeneratedDeck.ts`                    | Rejects citations outside the retrieved chunk-id set, runs the canonical verification mandate, and persists verdicts through the existing trust metadata seam.                                                                                                                                                                                                                                                                      |
| `app/(core)/education/learn/admin/page.tsx` | Self-gating super-admin route (explicit segment beats the `[...slug]` catch-all).                                                                                                                                                                                                                                                                                                                                                   |

## SEO surfaces (Phase A deliverables)

- **ISR + static params:** learn `[...slug]` and all 5 axis `[slug]` routes have `generateStaticParams` + `dynamicParams` + `revalidate=3600` (`axisStaticParams` in `route-helpers.ts`).
- **Sitemap:** dynamic, enumerates the whole hub (was one hardcoded `/education` URL).
- **OG images:** per learn doc (route handler at `/education/learn/og/[...slug]`) + per axis entry (`opengraph-image.tsx`).
- **JSON-LD:** `LearnArticle` emits `Article`; `AxisDetail` emits `FAQPage` (from any `faq` section) + `Course` (subjects / exam-prep).

## Invariants

- **No dual content path.** `LEARN_DOCS` registry is deleted; DB is the only source.
- **Never a raw per-slug `unstable_cache`** with a static keyParts array — it silently collapses all slugs onto one entry. Derive from the list, or put the arg in keyParts.
- **Writes never bypass the RPCs** — no direct `.from('learn_doc').insert()` from app code.
- Anon read requires the schema-level GRANT **and** the `pub_read` policy — both, or signed-out visitors get nothing / a 404.
- **Every save uses the full renderer-shape gate.** `validateAuthoredSections` checks kind + every
  renderer-consumed field before `edu_learn_doc_upsert`; malformed blocks disable Save/Publish and
  cannot become a blank public section. Advanced JSON is an escape hatch for experts, not a second
  persistence path.
- **Batch content fails closed.** An empty/failed IC-3 result, a citation id outside the retrieved
  set, a missing excerpt, or any non-`verified` card verdict leaves that deck private and disables
  the publish action. Generation and verification resolve through mandate keys; no agent id or
  prompt lives in this feature.
- **Publish is a visible human transition.** The pipeline may automate private drafting and the
  verification pass. The explicit button makes the set public and curated as an **AI-built
  starter**; it never writes WP9's human-verification fields or claims Certified.
- **Interrupted work remains recoverable.** On load, the admin recovers the newest private draft
  for each exam and each of the three generation plans, shows it only under its own exam, and
  offers the same source-verification pass again. A subsequent run generates only missing plans;
  recovery never changes visibility or duplicates an existing draft. Persisted verdicts are
  reused only while they are `verified` and `verifiedBack` exactly matches the current answer;
  an edit or any negative verdict forces a new check. Recovery inspects card membership before it
  accepts a draft: an interrupted zero-card set shell is visibly rejected and the plan becomes
  generatable again. Verification also refuses zero-card sets explicitly instead of reporting the
  nonsensical “0 cards failed.”

## Open / next

- **Grounded guide drafting:** consume the requested `education.learn_doc_draft` mandate once WP2
  declares its strict `EduSection[]` output. It will receive the same IC-3 passage serialization,
  validate into the visual editor, and remain a draft until the admin publishes it.
- Phase B (exam hub, consumes P1) and Phase C (community library, consumes P7) — see `common-docs/systems/education/STATE.md`.

## Change log

- **2026-08-19** — Made the database-backed sitemap route dynamic so temporary
  database or network outages cannot fail production builds while enumerating
  published learn docs; the route retains its hourly response revalidation.
- **2026-08-18** — Added the grounded exam-content pipeline to the existing study-guide admin:
  explicit processed-source selection, IC-3 retrieval, three focused private deck drafts through
  the canonical converter/mandate, durable chunk-id preservation, per-card source-verification,
  interrupted-draft recovery, and a separate publish/curate-as-AI-starter action. Empty retrieval
  and unknown citations refuse publication; 4 focused pipeline tests cover the three-deck plan
  and fail-closed gate.
- **2026-08-17** — Replaced JSON-first authoring with the reusable visual `SectionBlockEditor`
  across all seven `EduSection` kinds; Advanced JSON remains optional. Added one strict save gate
  shared with agent writes, so the known `{question, answer}` FAQ shape is refused before save.
  Verified against all 11 live guides (zero stranded rows), Jest regression coverage, desktop and
  375px browser flows, and a deliberate malformed draft with both save actions disabled.
- **2026-08-13** — The authoring UI is a real surface (`matrx-user/education-learn-authoring`) and agents can DRAFT into it. `LearnDocAdmin.tsx` mounts `SurfaceRuntimeProvider` on the list and registers 4 ask-policy **draft** targets (`doc_metadata`, `doc_sections`, `add_sections`, `doc_related`) that stage into the editor's own state — the admin still presses Save, so "publish without a deploy" stays a human action and `slug` / publish / delete are not targets at all. This closes the **"Agent-assisted drafting"** stretch item below through the declared surface seam rather than a bespoke in-UI generate button. `validate.ts` gained `EDU_SECTION_KINDS` (the exported vocabulary), `validateSectionsValue` / `validateRelatedValue` (shape-checks over an ALREADY-PARSED value, so the write handlers and the textarea share one implementation), and `validateSectionFields` — a stricter **agent-only** pass, added because a live agent emitted a valid-`kind` FAQ section keyed `{question, answer}` instead of `{q, a}`, which parses, saves, and renders blank. The textarea's own check stays kind-only on purpose: tightening it would reject guides that already exist.
- **2026-07-14** — Published 3 exam study guides (`exam/sat-math-guide`, `exam/ap-biology-big-ideas`, `exam/gre-verbal-guide`), keyworded with their exam slug; added `getExamLearnDocs(examSlug)` so the exam-prep hub surfaces them beside the certified decks.

- **2026-07-07** — Learn OG images moved from invalid `[...slug]/opengraph-image.tsx` to `/education/learn/og/[...slug]` route handler (Next.js catch-all constraint); page metadata sets `ogImage` explicitly.
- **2026-07-07** — Phase A shipped: `education.learn_doc` + RPCs + RLS, 8 seed docs migrated off the deleted registry, DB-backed `/learn` (ISR + static params), dynamic sitemap, per-doc/per-axis OG images, FAQPage/Course JSON-LD, super-admin authoring UI.
