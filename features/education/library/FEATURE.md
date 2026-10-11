# Education Library (`features/education/library`)

**Status:** live · **Tier:** 2 · **Routes:** `/education/library`, `/education/library/community`, `/education/library/suggestions`
Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/education/STATE.md — read it before touching this feature in ANY repo (rule 21 covers certification and public viewing). Agent-facing surface contracts: `features/surfaces/guides/education-library.md` (and the manifests `education-library`, `education-library-community`, `education-library-suggestions`) — this file does not restate them.

## What it is

Two surfaces. `/education/library` is the learner's own artifact library: `education.fc_set`, `education.assessment`, `education.study_media` and `workbench.notes` on one `EntityListPage` (Mine / Shared / Public lanes, server paging/filtering/sorting, subtype-aware doors into each owning tool; cards default, rows and table also offered). `/education/library/community` is the signed-out-friendly public deck browser: search, Certified-only facet, certified-first order; per deck View (`/p/e/fc_set/{id}`), Study a copy (`DuplicateToEditButton`), Suggest edit (signed in), and Certify/Uncertify for super-admins. `/education/library/suggestions` is the owner's suggestion inbox.

## Where it lives

`listConfig.tsx`, `columns.tsx`, `useEducationLibraryRowActions.tsx` (the one list config), `service.ts` (list service triple, client suggest/resolve RPCs `suggestDeckEdit` / `resolveDeckSuggestion` — direct client RPCs because a server action redacts the RPC's reason in production), `actions.ts` (server actions: certify/uncertify with `requireSuperAdmin`, owner inbox list), `queries.ts` (anon SSR read), `artifactVisuals.ts`, `*Surface.ts` (agent scopes), `components/` (`CertifiedBadge`, `LibraryBrowser`, `DeckCard`, `SuggestEditDialog`, `OwnerSuggestionInbox`, `StudyProgressBar`). The exam-prep pages reuse `edu_public_decks(exam_slug)` via `components/ExamCuratedLibrary.tsx`; corpus expansion goes through `publishing/components/ExamContentPipeline.tsx`.

Data: `education.content_certification` (public read; writes only by super-admin RPCs `edu_certify_content` / `edu_uncertify_content` and `service_role`), `education.deck_suggestion` (RLS: contributor, deck owner or super-admin; RPCs `edu_suggest_edit`, `edu_resolve_suggestion`), list RPCs `edu_library_list_scoped` / `edu_library_scope_counts` / `edu_library_facets` (exact `id` filter in `p_filters` lets focused consumers such as a kit reuse the KPI fold) and anon `edu_public_decks`.

## Invariants

- **Created artifacts are never hidden behind a public-only query**; every Create Kit target has a Mine row and a subtype-aware door. Search covers every visible identity, including `source_title`.
- **One canonical list shell** (`EntityListPage`): no parallel table, scope vocabulary or client-side complete-list query.
- **Reuse P7:** viewing is `/p/e/fc_set/{id}`, copying is `DuplicateToEditButton`; never a library viewer or fork.
- **Certification is gated at the DB**, not by a TS check. `edu_public_decks` is anon-executable: it must return only `visibility='public'`; never widen its WHERE. Card count uses the `role='member'` edge, the same `platform.associations_live` predicate as the list RPC — one definition.
- **Suggest-edit is contribution, not editing:** it goes to the owner's inbox and never mutates the deck.
- **One `CertifiedBadge`** across library and study surfaces. The seeded exam starters (SAT / AP Bio / GRE, tagged `metadata.exam_slug` + `curated`, per-card `TrustEnvelope` `confidence: "inferred"`) are AI-built starters: the UI must not call them Certified until a human adds the mark via `edu_verify_content`.
- **The library is a STUDY library.** Enrichment (`item_count`, `topic`, `difficulty`, `duration_seconds`, `source_title`, `studied_count`, `accuracy_pct`, `due_count`, `last_studied_at`) is applied AFTER `LIMIT`/`OFFSET` — never move it into `edu_library_scope_rows`, or every list load pays for the whole corpus.
- **Accuracy, never `mastery_score`:** `mastery_score` is a decayed write-time snapshot; lifetime `correct_count / attempt_count` does not decay.
- **`libraryRowStats(row)` is the only reader of the raw enrichment fields** (the generator types function columns as non-null; reading raw renders a never-studied deck as "0% correct").
- **Presentation comes from `TARGET_PRESENTATION`** (`convert/targetPresentation.ts`) via `artifactVisuals.ts`; add a format there plus one line in `SUBTYPE_TO_TARGET`. Never declare a colour here.
- **Progress renders nothing before the first attempt** (`StudyProgressBar` returns null; surfaces say "Not started").

## Open

- Certification covers `fc_set` only; extend `resource_type` to assessments. More facets (subject) once decks carry a subject; a popularity signal once study counts are wired. More exams (ACT, IB, MCAT, LSAT, GMAT) follow the same seed recipe.
