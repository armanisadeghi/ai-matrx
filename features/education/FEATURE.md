# Education Hub — FEATURE.md

**Status:** scaffolded · **Tier:** 1 · **Last updated:** 2026-06-29

> 🔴 **THE SOURCE OF TRUTH IS THE VISION DOC, NOT THIS FILE.**
> [`app/(core)/education/VISION-education-hub.md`](../../app/(core)/education/VISION-education-hub.md) defines WHAT the Education Hub is and does. This FEATURE.md documents only HOW it is built. **If anything here — or in the code — drifts from the vision, the vision wins, and you must report the drift to the user immediately. Do not silently "fix" the vision to match the code.** When the user approves a change that expands or improves the vision, update the vision doc first, then this file.

---

## Purpose

The AI study platform surface. `/education` is a desktop-first, mobile-responsive hub that attracts learners through SEO-friendly marketing + content pages and funnels them into interactive study tools (flashcards, FastFire, AI tutor, quizzes, practice tests, audio, mind maps).

## Why `(core)`, not `(public)` — load-bearing

The hub lives in `app/(core)/education/`, not `(public)`. `(core)` does **not** auth-gate: `(core)/layout.tsx` builds a guest user and `utils/supabase/middleware.ts` lists only `/administration`, `/api/admin`, `/dashboard`, `/scraper` as `requiresAuth`. So **every `/education/*` page is publicly crawlable** AND inherits the app shell + the `AuthedWorkspaceCTA` sign-up banner + authed continuity. Trade-off: the `(core)` layout reads `headers()`, forcing **dynamic rendering** (no static/ISR). That is fine for SEO (crawlers get full server HTML). For high-traffic content, opt into caching with **`'use cache'` + `cacheTag()`** — never relocate to `(public)` (you'd lose the shell + CTA).

## Two layers, one rule each

- **Marketing / discovery + content (server-only).** The five axes and the `/learn` content engine. **100% server-rendered, zero client logic** — pure SSR for SEO and speed. Page body JSX lives in exactly one place: `SectionRenderer`.
- **Application tools (interactive).** `/education/<tool>` — flashcards, fastfire, tutor, etc. Coming-soon placeholders today; when built, each graduates to the **agents-route server-shell pattern** (server layout + `cache()` data + thin Redux hydrator + per-page `loading.tsx`) at the same slug.

**Content vs app separation** mirrors the industry (Quizlet `/explanations`, Course Hero `/sg`): content pages are keyword-rich, server-rendered, and link **into** the tools (the conversion bridge via each entry's `related.tools`). Tool routes are short, ID-anchored.

## Entry points

- **Routes** (`app/(core)/education/`): `/` (hub) · `subjects` · `levels` · `exam-prep` · `study-aids` · `features` (each `index` + `[slug]` detail) · `learn` + `learn/[...slug]` (content engine) · `subjects/quick-math` (relocated stock lessons) · 9 `<tool>` placeholders · `admin`.
- **Renderers** (`features/education/components/`): `landing/EducationHub`, `AxisIndex`, `AxisDetail`, `LearnArticle`, `EduComingSoon`/`EduToolComingSoon`, `sections/*` (`EduHero`, `SectionRenderer`, `StatusPill`, `AccessTierBadge`).
- **Data** (`features/education/data/`): `subjects` · `levels` · `exam-prep` · `study-aids` · `features` · `tools` · `learn-content`, indexed by `registry.ts`. `constants.ts` holds the axis config; `route-helpers.ts` builds per-route metadata.
- **Admin map:** `/education/admin` ([page](../../app/(core)/education/admin/page.tsx)).

## Data model

- **Page content is data, not JSX.** `AxisEntry` (axis pages), `EduToolEntry` (tool placeholders), `LearnDoc` (content), all built from the composable `EduSection` block union — see [`types.ts`](./types.ts). **Add an entry → a page exists.** A stub (name/tagline/description) renders a clean page; flesh it with `sections`.
- **DB (the `education` schema)**, reached via `.schema('education')`: `study_structured_section` (the production content-engine source for `/learn`), `math_problems` (powers Quick Math via `features/math/service`), `flashcard_data` / `flashcard_sets`, `quiz_sessions`. The seeded registries are the demo; production reads these tables.

## Key flows

- **Discover → study.** Hub or axis index → `[slug]` detail → `related` cross-links → a tool route. Every detail page ends in a funnel CTA (default-injected if the entry didn't author one).
- **Content → convert.** `/learn/[...slug]` article (Article JSON-LD) → "Study this with AI Matrx" → the relevant tool.
- **Tool placeholder → real tool.** `EduComingSoon` reserves the route + lists a builder checklist + pins its `visionRef`; the real build replaces it at the same slug.

## Invariants & gotchas

- **Marketing/content pages never `"use client"`.** Interactivity goes in leaf client components (e.g. `AuthedWorkspaceCTA`), never the page.
- **`SectionRenderer` is the only home for page-body markup.** New block type → extend the `EduSection` union + add one branch. Never inline bespoke JSX in a registry entry.
- **`quick-` prefix = stock/preview content in a non-permanent slot.** `subjects/quick-math` is static and coexists with the dynamic `subjects/[slug]` (static wins); `subjects/math` is reserved for the real, full-functionality build. `math` is NOT in the subjects registry.
- **Funnel markers are display-only.** `AccessTierBadge` (free/trial/premium) signals; it does **not** enforce. Enforcement is the forked system — see [`docs/proposals/ENTITLEMENTS_AND_BILLING_REQUIREMENTS.md`](../../docs/proposals/ENTITLEMENTS_AND_BILLING_REQUIREMENTS.md).
- **Taxonomy is evidence-backed** (Khan/IXL/Quizlet/Course Hero, June 2026): subject-first; Levels is a three-band model (per-grade K–5 → bands → professional); Exam Prep is its own flat cross-cutting axis. Don't restructure without re-checking the research + the user.
- **Relocation wired:** old `(public)/education/*` deleted; `nav-data.ts` + `features/math` back-links repoint to `quick-math`; `Target` added to `shellIconMap.ts`.

## Related features

`features/math` (Quick Math) · `features/notes`, `features/podcasts`/`features/audio`, `features/scheduling` (consumed by the Notes / Audio Study / Planner tools when built) · `features/pricing` + the forked entitlements system (funnel) · RAG (AI Tutor grounding) · `features/shell` (`MarketingPageShell`, `AuthedWorkspaceCTA`) · `features/admin` (`FeatureAdminPage`).

## Doctrine compliance

- **Reused, not rebuilt:** `MarketingPageShell`, `utils/route-metadata`, `AuthedWorkspaceCTA`, `features/pricing` nudges, the `components/coming-soon` family pattern, `features/math` service+components, `FeatureAdminPage`, `shellIconMap`.
- **Introduced:** the data-driven section/registry page system (`EduSection` + `SectionRenderer` + registries). **Why:** the hub spans hundreds of marketing/content pages across five axes that parallel agents must fill; a generic, server-only block renderer fed by typed registries makes a new page a data edit, not a component. **Considered & rejected:** per-page bespoke components (doesn't scale to the breadth, can't be safely fanned out) and MDX (no MDX configured; content belongs in the DB).

## Current work / next

Structure + demos shipped (this pass). Pending: (1) fill all registries from the vision (parallel agents); (2) build the `/learn` content engine on `education.study_structured_section` + a shared JSON-LD helper + a dynamic education sitemap; (3) build the app tools (agents-pattern); (4) the forked Entitlements & Billing system. Awaiting user approval of the demo direction before fan-out.

## Change log

- **2026-06-29** — Initial scaffold: `(core)/education` structure (5 axes + `/learn` content engine + 9 tool placeholders + admin map), data-driven section/registry system, `EduComingSoon` template, relocated `(public)/education/math` → `subjects/quick-math`, nav-data + icon-map wiring, this doc + forked billing requirements. Source of truth: VISION-education-hub.md.
