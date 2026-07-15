# Creator Profiles & Public Landing Pages (`features/education/creators`)

**Status:** live · **Tier:** 2 (Education Hub — growth) · **Spec:** [`CONVERGENCE_C_CREATORS.md`](../../../docs/proposals/education-projects/CONVERGENCE_C_CREATORS.md) · **Last updated:** 2026-07-14

> The platform's single biggest growth lever: teachers and successful YouTubers claim a public handle and build an SEO-first page at **`/c/[handle]`** featuring their YouTube videos + free Matrx tools (flashcards, guides) + classes with enroll CTAs. **The creators bring the business.** Free content is instantly usable logged-out (drives signups); paid classes show an enroll/price CTA.

## The model — zero new tables

A "creator" is **an existing `users.profiles` row that has claimed a unique public handle and opted its page public.** We did NOT add a table — we extended the canonical per-user profile (`users.profiles`: PK = auth user id, `display_name`, `avatar_url`, base entity cols, `visibility`, `pub_read`) with creator columns. This is the reuse-first path the CLAUDE.md new-table bar demands (same entity, new facet → columns, not a table).

| Concept | Built on |
|---|---|
| **Creator identity** | `users.profiles` (reuse `display_name`, `avatar_url`) + new `creator_handle`, `creator_tagline`, `creator_bio`, `creator_links` jsonb |
| **Public opt-in** | `creator_public` boolean (the "is my page live + indexable" flag) + `creator_published_at` |
| **Featured content** | `creator_featured` jsonb — an **ordered** array of `{kind:'youtube'|'resource'|'class', …}` items. Order is the page layout; mixed types (a video isn't an entity) → an ordered JSONB list is the right shape, not a junction table |
| **Free tools** | featured `resource` items reference the creator's OWN public resources (`fc_set`, `learn_doc`, …) — resolved + gated on `visibility='public'` at read time |
| **Classes** | featured `class` items reference a class **scope** (the class-model's domain) + a creator-set `accessMode`/`price` |

Migration: [`migrations/education_creator_profiles.sql`](../../../migrations/education_creator_profiles.sql).

## Access model — RPC-gated, anon-safe read

- **Anon read** (the landing page): `public.creator_public_page(p_handle)` — SECURITY DEFINER, granted to `anon`. Returns null for an unknown/unpublished handle; returns ONLY `creator_public=true` rows; **enriches each featured item and DROPS any featured resource that is not itself `visibility='public'`** (a private resource can never leak onto a public page). So we never flip the profile's general `visibility`. Mirrors `get_public_flashcard_set`.
- **Authed writes** (the dashboard): user-owned, gated on `auth.uid()` (NOT super-admin — creators are regular users). `creator_claim_handle` · `creator_handle_available` · `creator_get_mine` · `creator_update_profile` · `creator_set_public`. Handle rules (3–30 chars, `[a-z0-9_-]`, reserved-word list) live in ONE place: `public.creator_normalize_handle`.
- Client mutations go **DIRECT via supabase-js** (`service.ts`) per CLAUDE.md — no Next.js middle tier. The public page is `force-dynamic`, so there is **no cache to bust** on edit (an edit shows on the next load).

## Entry points

| File | Role |
|---|---|
| `types.ts` | `CreatorPublicPage`, `FeaturedItem` union, `CreatorProfileMine`, `CreatorLink` |
| `youtube.ts` | Pure `parseYouTubeId` / `youTubeEmbedUrl` (nocookie) / `youTubeThumbnail` — importable, side-effect-free |
| `queries.ts` | Server public reads: `getCreatorPublicPage(handle)` (via the anon RPC), `listPublicCreatorHandles()` (sitemap) |
| `service.ts` | `"use client"` DIRECT-RPC path: claim/check/get/update/setPublic + `listMyPublicResources()` (owner's public free tools for the picker) |
| `sitemap.ts` | `getCreatorSitemapPaths()` → wired into the education sitemap (`publishing/sitemap.ts`) |
| `components/CreatorLandingPage.tsx` | The public `/c/[handle]` page (server): hero + videos + free tools + classes + funnel + Person/Course JSON-LD |
| `components/YouTubeEmbed.tsx` | Responsive privacy-friendly (nocookie) 16:9 iframe (server) |
| `components/EnrollButton.tsx` | Leaf client island — consumes the `edu_class_join` contract (see below) |
| `components/CreatorDashboard.tsx` | The authed manage UI (claim → editor: identity, links, featured picker, publish) |
| `app/(public)/c/[handle]/page.tsx` | Public route (metadata, canonical, robots:index, notFound) |
| `app/(public)/c/[handle]/opengraph-image.tsx` | Per-creator OG (reuses `renderEduOgImage`) |
| `app/(core)/education/creator/page.tsx` | Authed manage route (server auth gate → dashboard; noindex) |

## SEO surfaces

- **Server-rendered** (`force-dynamic`) — the full page content is in the initial HTML (view-source has the videos, tools, classes). Crawlable + always fresh.
- **Metadata:** `robots: index`, canonical `/c/<handle>`, OG (`type: profile`), Twitter summary_large_image.
- **JSON-LD:** `Person` (name, image, description, `sameAs` links) + one `Course` per featured class (with `Offer` for paid, `isAccessibleForFree` for free).
- **OG image:** per-creator branded card via the shared education OG renderer.
- **Sitemap:** `/c/<handle>` for every published creator (priority 0.7), added to the education sitemap. The authed `/education/creator` manage route is explicitly excluded (noindex).

## The anonymous funnel (acquisition loop)

A logged-out visitor on `/c/[handle]`:
1. Watches the embedded videos and opens any free tool — flashcard sets route to the **existing `/p/e` public viewer** (usable logged-out, with `DuplicateToEditButton` to fork-and-study). No reinvention.
2. Every enroll CTA + the funnel banner routes anon → `/sign-up?redirectTo=/c/<handle>` — sign up, land back on the page, save progress / enroll.

## Consuming the class-join contract (stubbed until landed)

`EnrollButton` consumes the documented `edu_class_join(class, access_mode) → immediate | pending | needs_purchase` contract (CONVERGENCE_C §Fleet contracts). Per `features/education/classes/FEATURE.md`, **the join/roster family is NOT landed yet** (it's Convergence C). So the button is wired against the contract SHAPE and degrades honestly:
- anon → sign-up redirect;
- signed-in + RPC live → call it, route by `outcome`;
- signed-in + RPC absent → an honest "enrollment opens soon" toast (never a fake success).
**When `edu_class_join` lands, no rewire is needed** — the island already calls it. Paid checkout (Stripe Connect) is a separate pending build (CONVERGENCE_C §Monetization) — the price CTA is display + intent only.

## Product decisions (flagged for Arman — reasonable defaults)

1. **Extend `users.profiles`, not a new `creator_profile` table.** One profile per user; reuses avatar/display-name/base-entity/RLS. A creator IS a user who opted in.
2. **Featured content = an ordered JSONB list on the profile**, not `platform.associations`. It needs order + mixed non-entity types (YouTube videos). Associations would fit resources but not videos or page order; a single ordered list is simpler and canonical for "page layout."
3. **Anon read via a SECURITY DEFINER RPC**, not by flipping the profile's `visibility`. Keeps the profile's general visibility untouched and lets us gate/enrich featured items server-side.
4. **Featured resources are gated on their OWN `visibility='public'`** at read time — a creator can't leak a private resource by featuring it.
5. **Avatar reuses the existing profile avatar** (durable CDN URL). The dashboard doesn't yet include an in-page avatar uploader (reuses whatever the profile system already set); adding a `fileHandler` upload is the natural next increment.

## Known gaps / follow-ups

- **`edu_class_join` not landed** — enroll CTA stubbed against the contract (above).
- **Paid checkout** — Stripe Connect payouts + purchase flow pending Arman's decision (CONVERGENCE_C §Monetization). Price CTA is intent-only.
- **Avatar uploader in the dashboard** — reuse `fileHandler` to let creators set a public avatar in-page.
- **`fc_card` count** in `creator_resolve_featured_resource` counts `platform.associations` member edges (best-effort; swallowed on error).
- **Featured resource types** the picker offers today: `fc_set` + `learn_doc` (the creator's public free tools). `note`/`study_media` resolve if hand-added but aren't in the picker yet.

## Change log

- **2026-07-14** — Created (Convergence C). Extended `users.profiles` with creator columns (zero new tables) + 8 creator RPCs (`migrations/education_creator_profiles.sql`); public SEO landing page at `/c/[handle]` (server-rendered, Person/Course JSON-LD, OG, sitemap); authed dashboard at `/education/creator` (claim handle, feature videos/tools/classes, publish); anon funnel reuses `/p/e` + `DuplicateToEditButton`; `EnrollButton` consumes the documented `edu_class_join` contract (stubbed until landed). Registered `creator` in `EDU_TOOLS` + the education admin map.
