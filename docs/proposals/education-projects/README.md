# Education Hub — Project Briefs (Execution Set)

> **Status date:** 2026-07-07. Supersedes the decomposition detail in
> [`EDUCATION_HUB_ROADMAP.md`](../EDUCATION_HUB_ROADMAP.md) (which remains the narrative overview).
> **Scope source of truth:** [`app/(core)/education/VISION-education-hub.md`](../../../app/(core)/education/VISION-education-hub.md).
> Every claim below was re-verified against the live codebase + live DB on 2026-07-07.

Each project has a standalone brief in this folder, written to be handed to one agent **blind** —
the brief plus the repo is everything they need. Assign one agent per brief; all eight can run
simultaneously.

| # | Brief | One-liner |
|---|---|---|
| P1 | [P1-assessment-engine.md](./P1-assessment-engine.md) | Quizzes + practice tests + pre/post learning-gain capture |
| P2 | [P2-ai-tutor.md](./P2-ai-tutor.md) | Persistent, RAG-grounded, voice-first tutor at every surface |
| P3 | [P3-study-media.md](./P3-study-media.md) | Audio study (overviews/debates/panels) + mind maps |
| P4 | [P4-smart-notes.md](./P4-smart-notes.md) | Notes + live lecture capture + one-click convert-to-anything |
| P5 | [P5-study-intelligence.md](./P5-study-intelligence.md) | AI planner completion + analytics + learning-gain dashboards |
| P6 | [P6-content-publishing.md](./P6-content-publishing.md) | `/learn` → DB-backed publishing engine + SEO machinery |
| P7 | [P7-sharing-public-access.md](./P7-sharing-public-access.md) | `useAccess` gate + generic public viewer + duplicate-to-edit |
| P8 | [P8-entitlements-billing.md](./P8-entitlements-billing.md) | Entitlements resolver + usage metering + Stripe |

---

## Current status (verified 2026-07-07 — what changed since the 2026-06-29 roadmap)

**Still true:**
- The 6 tool routes (quizzes, practice-tests, tutor, audio-study, mind-maps, notes) are ALL still
  `EduToolComingSoon` stubs — full route trees exist, every page is the placeholder.
- `/learn` is still the hardcoded `LEARN_DOCS` registry (8 docs); `education.study_structured_section`
  is still **0 rows**; sitemap still hardcodes a single `/education` URL; no `generateStaticParams`,
  no OG-image routes, no axis JSON-LD (nuance: `LearnArticle` DOES emit Article JSON-LD).
- Planner is still v1 (real `study_goal` CRUD + client-side heuristic `priorityScore`; no AI
  schedule, no calendar, no re-planning). `features/scheduling` (sch_task, cron preview) exists
  and is completely unconsumed by education.
- Entitlements/billing is still **greenfield**: no Stripe dependency, no billing tables,
  `features/pricing` is static UI consumed only by dev demos, `AccessTierBadge` is display-only.
- Study spine is live and populated: `study_session` 147, `study_attempt` 190, `item_mastery` 110
  (FSRS), `study_streak`, `study_goal` (0 data rows). All writes via
  `studyService.recordAttempt` → `study_record_attempt` RPC.

**Changed since the roadmap:**
- **Sharing plumbing was overhauled.** Token unification (2026-06-26) + the 2026-07-07
  registry/owner-column fix (`ded0c6ecd`) mean grants actually grant on canonicalized tables.
  There is an **uncommitted token-vs-table registry reconciliation** in `utils/permissions/`
  (4 files) that P7 must own/land first. The three P7 *product* gaps (view/edit gate, generic
  public viewer, duplicate-to-edit) all remain open.
- **Flashcards moved a lot** (voice grading primitives `gradeSpokenAnswer` + `VoiceTestButton`,
  adaptive cross-set Review-due via `useDueReview`, shared `StudyDeck` primitive extracted,
  live-streaming card creation). Its persistence layer split into
  `features/flashcards/services/flashcardPersistenceService.ts` (server-side search done;
  pagination not).
- **`quiz_sessions` flag RESOLVED:** it is the **canvas artifact quiz store**
  (`features/canvas/artifact-types/persistence/quiz-adapter.ts`; blob `state` JSONB,
  content-hash keyed, 64 rows / 3 users since Oct 2025). It is NOT an assessment spine.
  P1 builds new canonical tables and leaves `quiz_sessions` to canvas.

**Flashcards in-flight items (still owned by the active flashcards agent — do NOT absorb):**
view/edit gate + duplicate-to-edit (deferred to P7 as "Wave-5", see coordination note in P7),
image/audio card attachments, enhance/expand UI (agents exist, UI is a toast stub),
`microCoach` (null id, wired as no-op — P2 authors it, see coordination note in P2),
FastFire mid-session adaptation, list pagination.

---

## Shared contracts — published day 1 so nobody blocks

| Contract | State | Interface |
|---|---|---|
| **Study spine** | ✅ built | `studyService.recordAttempt({session, item, method, grade})` → FSRS + `item_mastery`. Every tool records here. Extend `method` values; never fork the tables. |
| **Agent-execution AI** | ✅ built | Author agents via agent_author → wire with `launchAgentExecution` + content-IR streaming. Copy `features/flashcards/data/useGenerateCards` + `data/agents.ts` (UUID registry) + `AGENT_SPECS.md` pattern. No raw Python `fetch()`. |
| **Content model** | ✅ pattern | Canonical table + `platform.associations` edges + `platform.visibility` enum + `*Result` service. Copy the `fc_set`/`fc_card` + `flashcardPersistenceService` shape. New tables follow the `db-change` / `db-canonicalize-table` skills. |
| **Access gate** (P7) | 🔲 day-1 contract | `useAccess(resourceType, id)` → `{level: 'none'\|'view'\|'edit'\|'admin', isOwner, loading}` + a server-side `requireAccess` guard + duplicate-to-edit + public viewer route pattern. P1–P5 wire edit routes against this signature immediately; P7 ships the implementation. |
| **Entitlements** (P8) | 🔲 day-1 contract | `useEntitlement(capability)` → `{allowed, remaining, tier, reason}` + capability registry. P1–P5 wrap every expensive AI action in it immediately (P8 ships a permissive stub on day 1, real enforcement later). |
| **Converter contract** (P4↔P1/P3/flashcards) | 🔲 day-1 contract | `convertContent({source, targetKind})` — P4 defines the interface; flashcards/P1/P3 each expose their generator behind it. |
| **Learning-gain contract** (P1→P5) | 🔲 day-1 contract | Baseline/post assessment rows keyed `(user, topic/deck, phase: baseline\|post, score, taken_at)` — P1 defines + persists, P5 reads. |

---

## Waves & convergence

**Wave 1 — all of P1–P8 in parallel** (+ flashcards agent in flight). Priority within the wave:
1. **P2 Tutor · P1 Assessment · P7 Sharing** — top differentiators + the #1 audit gap.
2. **P5 Study Intelligence · P8 Entitlements** — the institutional/learning-gain edge + monetization.
3. **P3 Media · P4 Notes · P6 Publishing** — strong reuse, strong growth.

**Convergence A — Access & Monetization Integration.** Every tool wires `useAccess` at its
edit/share points and `useEntitlement` at its metered AI actions. DoD: every shareable item
respects view-vs-edit; every metered action shows the paywall on cap.

**Convergence B — The Connected Study Loop.** P4's converters + a unified study dashboard (P5) +
cross-tool learning gain. DoD: note → deck → quiz → spaced review → planner → analytics with
nothing siloed.

**Convergence C — Institutional Readiness.** Teacher assignment, class analytics, LMS embed
(LTI 1.3/OneRoster), FERPA/COPPA, exportable reports. Feeds off P5 + P7 + P8.

**Wave 2 fan-out (unlocked after Convergence B):** Gamification & Social (leaderboards,
head-to-head, class rooms — `study_streak` already exists), Institutional, multi-format
ingestion breadth, mobile parity.

---

## Open flags for Arman (resolve at assignment, not blocking day 1)

1. ~~`quiz_sessions` reconciliation~~ **RESOLVED** — canvas-owned; P1 builds new tables.
2. **Public viewer route shape** (P7): extend the per-feature `/p/[slug]` + `/share/[token]`
   pattern into one generic registry-driven viewer, or keep per-feature routes behind a shared
   guard? P7's brief recommends a generic `/p/e/[resourceType]/[id]` viewer — confirm.
3. **microCoach authorship** (P2): the null-id no-op is flashcards plumbing, but it's a tutor
   agent — P2's brief claims it. Confirm the flashcards agent agrees.
4. **Mind-maps timing** (P3): folded in as the lighter second half; P3 phases audio first.
   Confirm mind-maps ships in this wave.
5. **Entitlements vs `account_tiers`** (P8): kept separate (operational vs commercial) per the
   requirements doc. Confirm.
6. **P7 × flashcards coordination**: P7 lands the gate in flashcards as the reference
   implementation (the flashcards agent's "Wave-5" items). Confirm the hand-off.
7. **Uncommitted `utils/permissions/` diff**: P7 takes ownership of landing it (it's the registry
   token-vs-table reconciliation P7 builds on). If another session owns it, resolve before P7 starts.
