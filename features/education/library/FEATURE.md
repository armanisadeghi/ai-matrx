# Community Library (`features/education/library`)

> **P6 Phase C.** Browse/discover public study decks, the **Certified** editorial tier, and the ethical **suggest-edit** contribution flywheel. Consumes P7's public viewer + duplicate-to-edit.
> Read before touching community-deck browsing, certification, or suggestions.

## What it is

`/education/library` — a public (signed-out-friendly) surface over `visibility='public'` flashcard decks. Search + a **Certified-only** facet, certified-first ordering. Each deck: **View** (→ P7 public viewer `/p/e/fc_set/{id}`), **Study a copy** (P7 `DuplicateToEditButton` — anon → sign-up → fork), **Suggest edit** (signed-in), and an inline **Certify/Uncertify** toggle for super-admins.

## Data model

| Table | Role | Access |
|---|---|---|
| `education.content_certification` | The "Certified" mark, polymorphic by `(resource_type, resource_id)` (`fc_set` now, extensible). | **Public read** (badges render everywhere, signed-out); writes ONLY via super-admin RPCs. |
| `education.deck_suggestion` | Suggest-edit rows: `(resource, owner_id, suggested_by, body, status)`. | RLS read = contributor \| deck owner \| super-admin. Writes via RPCs. |

RPCs (all `public.`, SECURITY DEFINER):
- `edu_public_decks(search, certified_only, limit, exam_slug)` — the listing read (public deck + card count via `platform.associations` member edges + certified status), anon-executable, **exposes only `visibility='public'`**. One round-trip, no N+1. **`exam_slug` filters on `fc_set.metadata->>'exam_slug'`** so the exam-prep hub reuses this exact RPC for its curated block (`fetchExamCertifiedDecks`). Card count counts `a.role='member'` — the column `fcService` writes (an earlier version counted `a.label`, always NULL → every deck showed 0 cards; fixed in `migrations/education_public_decks_exam_filter.sql`).
- `edu_certify_content` / `edu_uncertify_content` — super-admin only (protected-style admin grant).
- `edu_suggest_edit` — any authenticated user; resolves + denormalizes the deck owner, rejects self-suggestions.
- `edu_resolve_suggestion` — deck owner (or super-admin) accepts/declines.

Migrations: `education_content_certification.sql`, `education_deck_suggestion.sql`, `education_public_decks_rpc.sql`, `education_public_decks_exam_filter.sql` (card-count fix + `exam_slug` filter).

## Entry points

| File | Role |
|---|---|
| `queries.ts` | Server SSR read of initial public decks (anon cookie-free client). |
| `service.ts` | Client re-query as the user searches/filters (`edu_public_decks` RPC). |
| `actions.ts` | Server actions: certify/uncertify (super-admin), suggest-edit, resolve, owner-inbox list. |
| `components/CertifiedBadge.tsx` | The ONE certified trust mark — reuse everywhere, never restyle. |
| `components/LibraryBrowser.tsx` · `DeckCard.tsx` | Browse grid + per-deck actions. |
| `components/SuggestEditDialog.tsx` · `OwnerSuggestionInbox.tsx` | Contribution flywheel + owner inbox. |
| `app/(core)/education/library/page.tsx` · `library/suggestions/page.tsx` | Routes. |

## Invariants

- **Reuse, don't fork P7.** Viewing = `/p/e/fc_set/{id}` (P7 public viewer); copying = `DuplicateToEditButton`. The library never reimplements a viewer or a fork.
- **Certification is admin-only, at the DB.** `content_certification` has no user write policy; only the super-admin SECURITY DEFINER RPCs + service_role write. A TS check is not the gate.
- **`edu_public_decks` must only ever return `visibility='public'`** — it's anon-executable. Never widen its WHERE.
- **Suggest-edit is contribution, not editing.** It routes to the owner's inbox; it NEVER mutates the deck. Explicitly not an answer marketplace.
- **One `CertifiedBadge`** across library + study surfaces.

## Curated exam libraries (starter seed)

The **standardized exam content library** vision surface is live. A seeded set of **9 certified, curated decks** (128 cards) — SAT Math (3), AP Biology (3), GRE Verbal (3) — is public + certified, tagged `metadata.exam_slug` + `metadata.curated`, each card carrying a `TrustEnvelope` (`confidence: "inferred"`, labelled honestly as an AI-generated starter pending human verification — the certify note says so). Generated via the real flashcards agent (`FC_AGENTS.generateCards`) and persisted into the canonical `fc_set`/`fc_card` tables + `role='member'` association edges + `content_certification`. Surfaced on each exam-prep page by `features/education/components/ExamCuratedLibrary.tsx` (server component: `fetchExamCertifiedDecks(examSlug)` decks + `getExamLearnDocs(examSlug)` guides), and in this library filtered to **Certified**.

## Open / next

- Certification currently covers `fc_set`; extend `resource_type` to quizzes/assessments when P1 decks land in the library.
- More facets (subject) once decks carry a subject dimension; popularity signal (study counts) once wired.
- The 9 seed decks are AI-generated starters — the certify flow exists for later **human** verification; more exams (ACT, IB, MCAT, LSAT, GMAT) follow the same seed recipe.

## Change log
- **2026-07-14** — Seeded the first curated exam libraries: 9 certified public decks (SAT/AP Bio/GRE, 128 cards) via the real generation agent, tagged `exam_slug`; `edu_public_decks` gained an `exam_slug` filter and a card-count fix (`role` not `label`); new `ExamCuratedLibrary` surfaces certified decks + guides on each exam-prep page.

- **2026-07-07** — Phase C shipped: `content_certification` + `deck_suggestion` + `edu_public_decks` (migrations ledger-recorded), `/education/library` browse (search + certified facet + certify toggle), suggest-edit flywheel + owner inbox, `CertifiedBadge`, hub discovery link. Reuses P7's public viewer + duplicate-to-edit.
