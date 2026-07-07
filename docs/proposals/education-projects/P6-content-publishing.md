# P6 — LIBRARY: Growth Content Engine (Publishing + SEO + Exam Hub + Community)

> **Status date:** 2026-07-07 (expanded from the original P6 per the competitive research —
> `LIBRARY` merged in) · **Wave 1, priority tier 5; internal phases ordered so nothing blocks.**
> Read [`MASTER_PLAN.md`](./README.md),
> [`../COMPETITIVE_INSIGHTS_AND_REPRIORITIZATION.md`](../COMPETITIVE_INSIGHTS_AND_REPRIORITIZATION.md)
> §3 (C1–C3), and [`app/(core)/education/ROUTING.md`](../../../app/(core)/education/ROUTING.md).

## Objective

Build the compounding-acquisition machine: (A) the DB-backed `/learn` **publishing engine + SEO
machinery** (the original P6 — articles publish without deploys, every education URL enumerated,
OG-imaged, structured-data annotated; Course Hero's LitCharts model drives >50% of their traffic);
(B) the **free exam hub** — AP/SAT/ACT/etc. landing surfaces with real study content and mock
exams with AI-graded free-response (Knowt's 700k-users-per-AP-season engine, mapped onto our
already-built exam-prep axis); (C) the **community library** — living shared decks, an ethical
contribution flywheel, and a "Certified" verified-content tier (the AnKing/Brainscape models,
minus their lock-in).

**Internal phasing (strict):** A first (zero dependencies), B when P1's assessment contract lands,
C when P7's sharing primitives land. Never blocked — always building.

## Current state (verified)

- **`/learn` is a hardcoded TS registry:** `features/education/data/learn-content.ts`
  (`LEARN_DOCS`, 8 docs; header says production reads `education.study_structured_section` — that
  table exists with **0 rows** and is queried nowhere). No authoring UI. `LearnArticle.tsx` DOES
  emit Article JSON-LD (keep).
- **SEO gaps (all verified):** `app/sitemap.xml/route.ts` hardcodes a single `/education` URL; no
  `generateStaticParams` anywhere under education; no `opengraph-image` routes; axis pages
  (subjects/levels/**exam-prep**/study-aids/features) emit zero JSON-LD despite having `faq`
  blocks ready-made for `FAQPage`.
- **The marketing hub is content-complete:** 5 axes with rich `sections` + `SectionRenderer` +
  full metadata. The **exam-prep axis is your exam hub's skeleton** — it exists, it's marketing
  copy today.
- **Community raw material:** `platform.visibility` (`public`) + the sharing registry + fc_ decks
  exist; there is no browse/discover surface, no certification concept, no contribution mechanics.

## Scope

**Phase A — Publishing + SEO (start day 1, no dependencies)**
- DB-backed content: finalize `education.study_structured_section` (or successor) — sections
  typed to the existing `SectionRenderer` vocabulary, draft/publish, slugs, SEO metadata, RLS
  (public read published / admin write).
- Authoring/admin UI (create/edit/preview/publish); migrate the 8 seed docs; **delete
  `LEARN_DOCS`** (no dual path).
- Rendering with `'use cache'` + `cacheTag()`/`revalidateTag()` on publish;
  `generateStaticParams` for learn docs AND the five axis families.
- Dynamic sitemap (every axis entry, learn doc, hub page); per-doc + per-axis `opengraph-image`
  routes; `FAQPage` JSON-LD from axis `faq` blocks (+ `Course` where apt); keyword pass.
- **SEO study-guide content engine:** an agent-assisted authoring flow (author → structured
  sections draft → human review → publish) so the guide library can scale to hundreds of
  keyword-targeted docs — the LitCharts flywheel. (Agent-assisted drafting, human-approved
  publishing; never auto-publish.)

**Phase B — Free Exam Hub (starts when P1 publishes its assessment contract)**
- Upgrade the exam-prep axis pages from marketing → product: per-exam hubs (AP Bio, SAT, …) with
  free study content (Phase-A engine), curated decks, and **mock exams** generated/served through
  P1's assessment engine — including **AI-graded free-response (FRQs)** via P1's written-response
  grading (P0 grade-on-meaning under it).
- Free-tier by design: the exam hub is the generosity showcase (coordinate the capability list
  with P8 — Knowt won a season with free AP mocks; this is our version, without their ads/bugs).
- Exam-season SEO: sitemap + JSON-LD + OG for every exam hub.

**Phase C — Community Library + Certified tier (starts when P7's primitives land)**
- **Browse/discover:** a public library surface over `visibility='public'` decks (and later
  quizzes) — search, subject/exam facets, popularity; served signed-out via P7's public viewer.
- **Living shared decks:** follow/duplicate a community deck; surface the AnKing-style model
  (maintained decks that improve over time) using P7's grants + duplicate-to-edit.
- **"Certified" tier:** an editorial verification mark (admin-granted first; process documented)
  displayed across library + study surfaces — Brainscape's trust signal, our integrity framing.
- **Ethical contribution flywheel:** contribute improvements to decks you use (suggest-edit to
  the owner), enrich your own/class corpus — explicitly NOT an answer marketplace
  (integrity-positive per the competitive doc §3 P1).

**OUT**
- The study tools; the assessment engine (P1 — you consume); sharing internals (P7 — you
  consume); paid content sales; scraped/copyrighted third-party content (integrity line);
  standards-alignment tagging (Wave 2).

## Deliverables / Definition of done

- **A:** publish a new article via the UI without a deploy → in sitemap, OG image, valid JSON-LD;
  the 8 seeds served from DB, registry deleted; axis `FAQPage` passes the Rich Results test;
  ISR proven live.
- **B:** a signed-out visitor lands on an AP exam hub from search-shaped URLs, studies free
  content, takes a free mock exam, gets an AI-graded FRQ with grounded feedback — and hits the
  signup/aha flow at the right moment (funnel per P8's model).
- **C:** a public deck is discoverable in the library, viewable signed-out, duplicable-to-edit;
  a Certified badge renders; a suggest-edit round-trips to a deck owner.
- Admin map, feature docs, and `tools.ts`/axis registries updated throughout.

## Surfaces touched

- `app/(core)/education/learn/**`, the 5 axis families (SEO layers), `app/sitemap.xml/route.ts`,
  new `opengraph-image` routes
- New `features/education/publishing/**` (authoring + agent-assisted drafting) + admin surface
- Exam-prep axis pages → per-exam hubs; new `features/education/library/**` (browse, certified,
  contribution)
- `education.study_structured_section` + community/certification columns/tables + migrations
- P1's assessment service (consume), P7's public viewer + grants (consume)

## Dependencies & contracts

- **Phase A:** none — start immediately.
- **Phase B:** P1's assessment-generation contract (published day 1 by P1; integrate when its
  engine goes live). **Publish to P1 early:** the exam-hub requirements (exam types, mock-exam
  config shape) so P1 keeps exam-type metadata first-class.
- **Phase C:** P7's `useAccess` + public viewer + duplicate-to-edit.
- **Consumes:** P0 TrustEnvelope (all agent-drafted content cites sources), P8 free-tier
  philosophy (the hub is the generosity showcase).

## Build guidance

- Reuse `SectionRenderer` types as the DB serialization — one content schema, ever.
- Caching: this repo is dynamic-by-default — opt in deliberately (`'use cache'` + tags);
  `nextjs-patterns` skill for SSG/ISR + metadata.
- Authoring is admin-gated (`requireSuperAdmin` default; Arman lowers deliberately).
- Community writes via `SECURITY DEFINER` RPCs; certification is a protected-style admin grant.
- `db-change`, `type-safety`, `dataviz` for any stats, `finalize-and-ship`.

## Verification

- A: publish-without-deploy live test; Rich Results validation; sitemap URL-count diff vs
  registries; Lighthouse SEO.
- B: full signed-out exam-hub journey including a real AI-graded FRQ (no mocked grading).
- C: three-persona library test (owner / community member / signed-out) on real decks.
Hand Arman exact URLs per phase.
