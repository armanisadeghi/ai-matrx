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
- **Application tools (interactive).** `/education/<tool>` — flashcards, fastfire, tutor, etc. **`flashcards` + `fastfire` are LIVE**; the rest are coming-soon placeholders. Each built tool graduates from `EduComingSoon` to a real surface at the same slug (server shell, code-split client island). **FastFire** (`/education/fastfire`) is the voice-graded flashcard drill — see [`features/flashcards/fast-fire/`](../flashcards/fast-fire/) (ONE state-machine slice `fastFireSlice`, continuous mic capture, deadline-timer-driven advance, fire-and-forget agent grading on the shared study spine). Its grader / live-help / batch-review agents are **optional settings** (`features/flashcards/fast-fire/config.ts`): the drill runs + records attempts even with no agent configured; grading lights up when an agent id is set.

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

- **Routing contract → [`app/(core)/education/ROUTING.md`](../../app/(core)/education/ROUTING.md). Read it before adding any route.** Marketing/content is **nested + data-driven** (`education/<axis>/[slug]`, `education/learn/[...slug]`); app tools are **FLAT** (`education/<tool>` + sub-routes) — never nest a tool under an axis, never scatter it into `(transitional)`/`(legacy)`/a sibling feature. A tool graduates from its coming-soon placeholder to the real build **at the same slug**.
- **View/edit split (the share-gating fundamental).** Per tool: `[id]` (+ use-modes like `study`/`take`/`results`) is gated by **VIEW** access (the shareable URL); `[id]/edit` is a separate segment gated by **EDIT** permission (view-only sharees redirect to `[id]`). Gate via `iam.has_access` + the permissions registry, not a bespoke check. Models Google Docs / Quizlet.
- **Marketing/content pages never `"use client"`.** Interactivity goes in leaf client components (e.g. `AuthedWorkspaceCTA`), never the page.
- **`SectionRenderer` is the only home for page-body markup.** New block type → extend the `EduSection` union + add one branch. Never inline bespoke JSX in a registry entry.
- **Registry icons must resolve at lucide-react RUNTIME, not just type-level.** Lucide dropped its brand icons (e.g. `Youtube`) — a type-valid-but-runtime-missing icon compiles, passes `tsc`, then **500s every education route** through the shared `registry.ts`. Validate new icons at runtime (`node -e "console.log('Video' in require('lucide-react'))"`), never `tsc` alone.
- **`quick-` prefix = stock/preview content in a non-permanent slot.** `subjects/quick-math` (static route) holds the relocated stock algebra lessons and coexists with the dynamic `subjects/[slug]` (static wins). `subjects/math` **is** a marketing subject entry like every subject; the full interactive math *experience* is a future tool build linked from it — the headroom the `quick-` split reserves. (Open question for the user: should `/subjects/math` instead be reserved as the interactive experience itself? Flagged at demo.)
- **Funnel markers are display-only.** `AccessTierBadge` (free/trial/premium) signals; it does **not** enforce. Enforcement is the forked system — see [`docs/proposals/ENTITLEMENTS_AND_BILLING_REQUIREMENTS.md`](../../docs/proposals/ENTITLEMENTS_AND_BILLING_REQUIREMENTS.md).
- **Taxonomy is evidence-backed** (Khan/IXL/Quizlet/Course Hero, June 2026): subject-first; Levels is a three-band model (per-grade K–5 → bands → professional); Exam Prep is its own flat cross-cutting axis. Don't restructure without re-checking the research + the user.
- **Relocation wired:** old `(public)/education/*` deleted; `nav-data.ts` + `features/math` back-links repoint to `quick-math`; `Target` added to `shellIconMap.ts`.

## Related features

`features/math` (Quick Math) · `features/notes`, `features/podcasts`/`features/audio`, `features/scheduling` (consumed by the Notes / Audio Study / Planner tools when built) · `features/pricing` + the forked entitlements system (funnel) · RAG (AI Tutor grounding) · `features/shell` (`MarketingPageShell`, `AuthedWorkspaceCTA`) · `features/admin` (`FeatureAdminPage`).

## Doctrine compliance

- **Reused, not rebuilt:** `MarketingPageShell`, `utils/route-metadata` (extended with optional `keywords`/`canonicalPath`), `AuthedWorkspaceCTA`, `features/pricing` nudges, `features/math` service+components, `FeatureAdminPage`, `shellIconMap`.
- **Introduced:** the data-driven section/registry page system (`EduSection` + `SectionRenderer` + registries) and the `EduComingSoon` placeholder. **Why the section system:** the hub spans hundreds of marketing/content pages across five axes that parallel agents must fill; a generic, server-only block renderer fed by typed registries makes a new page a data edit, not a component. **Considered & rejected:** per-page bespoke components (doesn't scale to the breadth, can't be safely fanned out); MDX (none configured; content belongs in the DB); and the existing `components/coming-soon/*` family for the tool placeholders — `CominSoonTemplate` is a full-page marketing splash and `ComingSoonCard` is too thin (no status/tier/capabilities/vision-ref), so `EduComingSoon` is the hub's purpose-built placeholder.

## Current work / next

Structure, demos, AND the full marketing/content fanout are shipped + live-verified — every axis registry entry (subjects/levels/exam-prep/study-aids/features) and 8 `/learn` study guides are fleshed with vision-faithful sections. Pending: (1) build the `/learn` content engine on `education.study_structured_section` + a shared JSON-LD helper + a dynamic education sitemap; (2) build the app tools (agents-pattern server shell); (3) the forked Entitlements & Billing system.

## Change log

- **2026-06-30** — **Study-spine `createSession` hardened (logging + transient retry).** Investigated the `/education/flashcards/{setId}/study` "study-session write fails on load" report (`[studyService] createSession: [object Object]` / `createSession: Unknown error`). **Verified against the live DB:** the `education.study_session` insert + canonical `entity` RLS + `_stamp_org_default` org-fill all work for authenticated users (minimal, app-shape, real + cross-org `source_set_id`, and through the capture-proxy wrapper); the browser also creates sessions successfully on hard load and cross-org. So this was **not** a schema/RLS bug. Two real defects fixed in `study/service/studyService.ts`: (1) **logging swallowed the cause** — `fail()` passed the raw error as a console arg (serialized to `[object Object]`) and `describeError()` collapsed any unrecognized shape to `"Unknown error"`; now `describeError` emits message/details/hint/code or JSON-dumps non-PostgREST shapes, and `fail` logs the described string. (2) **the session-open POST is not retried on transient edge errors** — `postgrest-js` auto-retries idempotent GETs on transient 5xx/520/503 but never POSTs, so a transient gateway/network hiccup (a non-PostgREST, message-less response — the exact shape that produced "Unknown error") surfaced as a hard failure while reads recovered. `createSession` now does a loud, transient-only bounded retry (3 attempts, backoff; transient statuses only so deterministic 4xx fail fast). Retry is scoped to session-open (a duplicate session row is harmless) and **must never** be lifted to `recordAttempt` (non-idempotent ledger append). Mastery persistence was never affected — it runs through `recordAttempt`, independent of the session.
- **2026-06-30** — **FastFire built + shipped LIVE** (`/education/fastfire`, `tools.ts` `coming-soon → live`), rebuilt ground-up on the canonical study spine after the prior attempt failed on real-time state plumbing. New module `features/flashcards/fast-fire/`: ONE `fastFireSlice` state machine (`idle→setup→countdown→card_recording→advancing→finalizing→complete`, audio blobs in a module-scoped ref store NOT Redux), a single-rAF **deadline timer** with a per-card close-once guard (kills the double-advance/dropped-card class), ONE warm continuous mic stream + 250ms-timeslice MediaRecorder with per-card ±1s-overlap slicing + 880/440Hz buzzers (reuses `features/audio/{micStream,captureLock,audioContext}`), and **fire-and-forget** per-card grading (`launchAgentExecution` json_schema → `selectFirstExtractedObject` → `gradeResolved` dispatch → `study_record_attempt`) that is never awaited in the drill loop — the grade reaches the UI only through Redux. Grader / help / batch-review agents are optional (`config.ts`); the drill runs + records attempts without them. Deleted the 5 legacy `(transitional)/flash-cards/fast-fire/*` components + 2 old hooks (kept `REQUIREMENTS.md`). Verified live: exactly ONE mic prompt/session, clean 1→2→3→4→complete advance with no double/dropped cards, `study_session` + durable `session_audio_file_id` persisted. Found a DB-side study-spine bug (logged D28: `study_record_attempt` rejects a NULL result) — DDL fix correctly blocked (DB locked), so result-less attempt writes are pending that fix.
- **2026-06-29** — Marketing/content fanout (6 parallel agents): every axis registry entry + 6 new `/learn` study guides fleshed with vision-faithful sections; the header `AuthedWorkspaceCTA` was moved into the shell header slot (compact pill, no banner collision). Build-breaker fixed: lucide dropped the `Youtube` brand icon (type-valid, runtime-missing → 500'd all routes) → swapped to `Video`. Committed per-file to survive a recurring concurrent-`main` tree reset that wiped the first fanout pass. Verified: 0 emojis, 0 missing icons, 24-route runtime sweep clean, per-file scoped tsc clean (full-repo tsc OOMs by design).
- **2026-06-29** — Adversarial-review fixes: related-link/breadcrumb labels now resolve real entry names (not slug-humanized); `AuthedWorkspaceCTA` mobile left-clearance for the shell hamburger; 44px touch targets on related pills; favicon-letter collisions fixed (ap-chemistry, elementary); `keywords` + self-referential `canonical` wired through the metadata helpers + `metadataBase` set at root; dead `getAxisParams`/`EduLink.variant` removed; doc accuracy. MathProblem code-split spun off as a separate task.
- **2026-06-29** — Initial scaffold: `(core)/education` structure (5 axes + `/learn` content engine + 9 tool placeholders + admin map), data-driven section/registry system, `EduComingSoon` template, relocated `(public)/education/math` → `subjects/quick-math`, nav-data + icon-map wiring, this doc + forked billing requirements. Source of truth: VISION-education-hub.md.
