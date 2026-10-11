# Education Publishing Engine (`features/education/publishing`)

The DB-backed `/education/learn` study-guide engine plus the Education Hub SEO machinery. A guide
published from the UI is live, indexed, OG-imaged and in the sitemap without a deploy. Read before
touching learn-doc content, the sitemap, OG images or axis JSON-LD. Public-content rules (publish /
curate / human-verify are three states no write collapses, exam slugs, `edu_public_decks`,
`CertifiedBadge`): IC-12 in `common-docs/systems/education/INTEGRATION_MAP.md`.

## Data model

`education.learn_doc` is a canonical base entity plus `visibility` and the guide payload (`slug`
unique, `title`, `summary`, `subject`, `letter`, `keywords[]`, `sections` jsonb, `related` jsonb,
`content_updated_at`, `published_at`). Content is the canonical `EduSection[]` vocabulary
(`../types.ts`) — one content schema, rendered by the shared `SectionRenderer`.

**Publication = visibility**: `personal` is a draft, `public` is published (anon `pub_read`);
there is no status column. Registered in `platform.entity_types` and
`platform.shareable_resource_registry` (token `learn_doc`); RLS via
`iam.apply_rls('education','learn_doc','learn_doc','entity')`, plus explicit table GRANTs
(`anon` SELECT, `authenticated` CRUD, `service_role` ALL). Migration: `migrations/education_learn_doc.sql`.

**Writes** go only through `is_super_admin()`-gated SECURITY DEFINER RPCs (any super-admin may edit
any doc): `edu_learn_doc_upsert`, `edu_learn_doc_set_status` (publish/unpublish),
`edu_learn_doc_delete` (soft), `edu_learn_doc_admin_list`.

## Where it lives

- `queries.ts` — public server reads (anon cookie-free client, `unstable_cache` tag
  `education-learn-docs`, ISR): `listPublishedLearnDocs`, `getPublishedLearnDoc` (derived from the
  list), `getPublishedLearnDocTitles`, `getExamLearnDocs(examSlug)` (feeds the exam-prep hub).
- `actions.ts` — `"use server"` mutations → RPC → `updateTag('education-learn-docs')`.
- `sitemap.ts` → `app/sitemap.xml/route.ts` (dynamic, so a database outage cannot fail a build;
  hourly revalidation). `ogImage.tsx` — branded renderer; learn docs use the route handler
  `/education/learn/og/[...slug]` (a catch-all cannot host file-based OG), axis families use
  `opengraph-image.tsx`.
- `components/LearnDocAdmin.tsx` (authoring UI, route `/education/learn/admin`, super-admin
  self-gated; surface `matrx-user/education-learn-authoring` with four ask-policy draft targets
  that stage into the editor — slug, publish and delete are not targets), `SectionBlockEditor.tsx`
  (visual editor for all `EduSection` kinds; Advanced JSON is an escape hatch, not a second path).
- `components/ExamContentPipeline.tsx`, `examContentPipeline.ts`, `verifyGeneratedDeck.ts` —
  super-admin batch authoring of exam decks (below).
- SEO: learn `[...slug]` and the axis `[slug]` routes use `generateStaticParams` + `revalidate=3600`
  (`axisStaticParams` in `route-helpers.ts`); `LearnArticle` emits `Article`, `AxisDetail` emits
  `FAQPage` (any `faq` section) + `Course` (subjects / exam-prep).

## Invariants

- No dual content path: the DB is the only source (the `LEARN_DOCS` registry is gone).
- Never a raw per-slug `unstable_cache` with static keyParts — it collapses every slug onto one
  entry. Derive from the list or put the arg in keyParts.
- Writes never bypass the RPCs (no direct `.from('learn_doc').insert()`).
- Anon read needs BOTH the schema GRANT and the `pub_read` policy.
- Every save passes the full renderer-shape gate: `validateAuthoredSections` (kind + every
  renderer-consumed field, e.g. FAQ `{q, a}` not `{question, answer}`) runs before
  `edu_learn_doc_upsert`; malformed blocks disable Save/Publish. Agent writes share the gate
  (`validateSectionFields`); the textarea's own check stays kind-only so existing guides still load.
- Batch exam content fails closed: an empty/failed IC-3 retrieval, a citation id outside the
  retrieved set, a missing excerpt, or any non-`verified` card verdict leaves that deck private and
  disables publish. Generation and verification resolve through mandate keys
  (`flashcards.generate_from_source`, `flashcards.verify_against_source`).
- Publish is a visible human transition: the pipeline drafts and verifies privately; the explicit
  button makes the set public as an AI-built starter and never writes WP9's human-verification
  fields or claims Certified.
- Interrupted work is recoverable: the admin recovers the newest private draft per exam and plan,
  generates only missing plans, never changes visibility or duplicates. Persisted verdicts are
  reused only while `verified` and `verifiedBack` equals the current answer. A zero-card shell is
  rejected visibly and its plan becomes generatable again; verification refuses zero-card sets.

Open: grounded guide drafting waits on a requested `education.learn_doc_draft` mandate (not yet
declared) that returns strict `EduSection[]`; it stays a draft until the admin publishes. Phase B/C
status: `common-docs/systems/education/STATE.md`.

Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/education/STATE.md — read it before touching this feature in ANY repo.
