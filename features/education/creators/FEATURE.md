# Creator Profiles & Public Landing Pages (`features/education/creators`)

**Status:** live · **Tier:** 2 · **Routes:** public `/c/[handle]` (`app/(public)/c/[handle]/`, server-rendered, `force-dynamic`), authed `/education/creator` (noindex)
Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/education/classes-and-creators/STATE.md — read it before touching this feature in ANY repo (creator vision, `learn.aimatrx.com` origin, Stripe Connect go-live status).

## What it is

A creator is a `users.profiles` row that claimed a unique handle and opted its page public: an SEO-first page of their YouTube videos, free tools and classes with enroll CTAs. The anonymous funnel: free tools open in the existing `/p/e` public viewer (with `DuplicateToEditButton`), every enroll CTA sends anon to `/sign-up?redirectTo=/c/<handle>`.

## Model (zero new tables)

Creator columns on `users.profiles`: `creator_handle`, `creator_tagline`, `creator_bio`, `creator_links`, `creator_public`, `creator_published_at`, `creator_featured` (an ORDERED jsonb list of `{kind:'youtube'|'resource'|'class', …}` — order is page layout, items are mixed non-entities, so not `platform.associations`). Migration `migrations/education_creator_profiles.sql`; RPCs: `creator_public_page`, `creator_claim_handle`, `creator_handle_available`, `creator_get_mine`, `creator_update_profile`, `creator_set_public`, `creator_public_handles`, `creator_resolve_featured_resource`, `creator_connect_status`, and `creator_normalize_handle` (handle rules: 3-30 chars `[a-z0-9_-]`, reserved words — in ONE place).

## Rules

- **Anon read is the SECURITY DEFINER `creator_public_page(handle)`**, never a flip of the profile's general `visibility`. It returns only `creator_public=true` rows and DROPS any featured resource that is not itself `visibility='public'` — a private resource cannot leak by being featured.
- **Writes are user-owned** (`auth.uid()`, not super-admin) and go direct via supabase-js (`service.ts`); the public page is `force-dynamic`, so edits show on next load with no cache to bust.
- **A featured class's access mode and price are read LIVE from the class scope settings** by `creator_public_page`; the dashboard shows them read-only (edit in the class form), so the CTA cannot diverge.
- **`EnrollButton`** (leaf client island): anon → sign-up; open/closed → `edu_class_join`; paid → `startClassCheckout` (Stripe Connect). The webhook alone confers paid access; this island never grants it. Mechanism: `features/entitlements/FEATURE.md` § Creator payouts. Payouts UI: `CreatorPayoutsPanel` (`/api/stripe/connect/*`).
- **SEO:** server-rendered content in initial HTML, canonical `/c/<handle>`, JSON-LD `Person` plus a `Course` per featured class, per-creator OG (`renderEduOgImage`), sitemap via `sitemap.ts` into the education sitemap. `/education/creator` is excluded.
- The surface `matrx-user/education-creator` lets an agent claim a handle, edit identity/links and publish state (approval-gated, through `claimHandle` / `updateCreatorProfile` / `setCreatorPublic`); payouts, permissions, handle changes, featured content and deletion are not agent write targets. There is no profile-delete RPC; `creator_set_public(false)` is the retirement action.

## Public education origin

Every public education canonical/OG/sitemap URL is built from `EDU_ORIGIN` (`features/education/constants.ts`, env `NEXT_PUBLIC_EDU_ORIGIN`, default the main site). `proxy.ts` rewrites `/` to `/education` on the edu host and 302s every path outside its allowlist to the main host (it no-ops if the env is unset or equals the main host). Serving `learn.aimatrx.com` needs the domain added in Vercel and DNS plus that env set (UNVERIFIABLE here: Vercel project state); status in the classes-and-creators STATE.

## Where it lives

`types.ts`, `youtube.ts` (pure `parseYouTubeId` / nocookie embed / thumbnail), `queries.ts` (server public reads), `service.ts` (client RPCs), `sitemap.ts`, `components/` (`CreatorLandingPage`, `YouTubeEmbed`, `EnrollButton`, `CreatorDashboard`, `CreatorPayoutsPanel`), manifest `features/surfaces/manifests/education-creator.manifest.ts`, `app/(public)/c/[handle]/{page,opengraph-image}.tsx`, `app/(core)/education/creator/page.tsx`.

## Open

- In-page avatar uploader (reuse `fileHandler`); the picker offers only `fc_set` and `learn_doc` (`note`/`study_media` resolve if hand-added); `creator_resolve_featured_resource` card count is best-effort.
