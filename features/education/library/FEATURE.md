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
- `edu_public_decks(search, certified_only, limit)` — the listing read (public deck + card count via `platform.associations` member edges + certified status), anon-executable, **exposes only `visibility='public'`**. One round-trip, no N+1.
- `edu_certify_content` / `edu_uncertify_content` — super-admin only (protected-style admin grant).
- `edu_suggest_edit` — any authenticated user; resolves + denormalizes the deck owner, rejects self-suggestions.
- `edu_resolve_suggestion` — deck owner (or super-admin) accepts/declines.

Migrations: `education_content_certification.sql`, `education_deck_suggestion.sql`, `education_public_decks_rpc.sql`.

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

## Open / next

- Certification currently covers `fc_set`; extend `resource_type` to quizzes/assessments when P1 decks land in the library.
- More facets (subject) once decks carry a subject dimension; popularity signal (study counts) once wired.
- Only 1 public deck exists in the DB today — the surface is data-ready; seed/publish more to populate.

## Change log

- **2026-07-07** — Phase C shipped: `content_certification` + `deck_suggestion` + `edu_public_decks` (migrations ledger-recorded), `/education/library` browse (search + certified facet + certify toggle), suggest-edit flywheel + owner inbox, `CertifiedBadge`, hub discovery link. Reuses P7's public viewer + duplicate-to-edit.
