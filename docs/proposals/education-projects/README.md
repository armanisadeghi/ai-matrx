# Education Hub — MASTER PLAN (single source of truth for execution)

> **Status date:** 2026-07-07 (v2 — competitive research merged).
> **This is the one document.** It merges the vision
> ([`VISION-education-hub.md`](../../../app/(core)/education/VISION-education-hub.md)), the
> delivery roadmap ([`EDUCATION_HUB_ROADMAP.md`](../EDUCATION_HUB_ROADMAP.md)), and the
> competitive research
> ([`COMPETITIVE_INSIGHTS_AND_REPRIORITIZATION.md`](../COMPETITIVE_INSIGHTS_AND_REPRIORITIZATION.md))
> into one prioritized, fully-assignable project set. Every brief in this folder is standalone —
> hand it to one agent blind using the copy-paste prompt in [`ASSIGN.md`](./ASSIGN.md). Every
> factual claim was re-verified against live code + live DB on 2026-07-07.

---

## 1. The strategic thesis (why this plan is shaped this way)

The market is in trust collapse: incumbents (Quizlet 1.4★ consumer Trustpilot, Chegg −99% +
FTC $7.5M, Course Hero 1.6★) imploded on **paywall ambushes and billing dark patterns**, while
the AI-native wave (NotebookLM 17M MAU, Knowt, StudyFetch, Gizmo) proved demand for
one-upload-to-study-kit and grounded audio — but **every one of them is a generation toy, not a
study system**. NotebookLM users export to Anki for real spaced repetition; Knowt's SRS is fake.

**We already own what they don't: the study loop** — a real FSRS engine, a populated study spine
(mastery/sessions/attempts), and measured learning gain. The position:

> **The all-in-one study system that is provably grounded in your own material, honest about
> what it doesn't know, generous and honest on price, and that proves it makes you smarter.**

Four consequences drive the plan: **TRUST** becomes a P0 layer gating every AI feature; **billing
integrity** turns P8 from plumbing into a marketing weapon; **onboarding/import** (ONBOARD) and
**engagement** (ENGAGE) become their own projects; and P6 absorbs the **exam hub + community
library** growth engines.

## 2. What the system is (one paragraph)

A single hub at `/education`: a student uploads or imports anything (P9) → grounded study
artifacts fan out (flashcards ✅, quizzes/tests P1, audio P3, mind maps P3, notes P4) → every
study action (classic modes ✅, FastFire ✅, games P10, audio review P3, assessments P1) records
to ONE study spine (FSRS mastery, sessions, attempts ✅) → intelligence reads the spine (tutor
P2, planner + analytics + learning-gain P5) → everything is shareable (P7), metered honestly
(P8), trust-enveloped (P0), and fed by an SEO/community acquisition engine (P6). Nothing is
siloed; every tool makes every other tool smarter.

## 3. Current foundation (verified 2026-07-07 — what agents build ON)

- **Built + live:** flashcards ~90% (all create paths incl. Quizlet/CSV import, 5 study modes,
  FastFire w/ voice grading, editor, adaptive Review-due); the study spine (`study_session` 147 /
  `study_attempt` 190 / `item_mastery` 110 FSRS / `study_streak`); the agent-execution pipeline
  (UUID-authored agents + content-IR streaming — NO raw Python calls); the content-model pattern
  (`fc_*` + associations + visibility + RLS); the marketing hub (5 content-complete axes);
  planner v1 (heuristic); voice primitives (`gradeSpokenAnswer`, `VoiceTestButton`); podcast/
  audio pipeline (1–20 speakers, recovery); RAG; sharing plumbing (grants really grant as of
  2026-07-07).
- **Stubs:** all 6 tool routes (quizzes, practice-tests, tutor, audio-study, mind-maps, notes)
  are `EduToolComingSoon` placeholders with full route trees.
- **Empty/greenfield:** `/learn` is a hardcoded 8-doc registry (`study_structured_section` 0
  rows); SEO machinery absent; view/edit gate + public viewer + duplicate-to-edit absent;
  billing/entitlements fully greenfield (no Stripe, no tables); no trust surfaces (citations/
  confidence/refusals) despite RAG being live.
- **Resolved:** `education.quiz_sessions` is the canvas artifact quiz store — NOT an assessment
  spine; P1 builds fresh.

## 4. The project set — 11 briefs + 1 addendum, all assignable now

| # | Brief | One-liner | Tier |
|---|---|---|---|
| **P0** | [P0-trust-layer.md](./P0-trust-layer.md) | **NEW.** TrustEnvelope: citations, confidence, honest refusals, grade-on-meaning, verify-against-source — contract + primitives + brand surface | **1** |
| **P7** | [P7-sharing-public-access.md](./P7-sharing-public-access.md) | `useAccess` gate + generic public viewer + duplicate-to-edit (unblocks community) | **1** |
| **P8** | [P8-entitlements-billing.md](./P8-entitlements-billing.md) | **REFRAMED + MOVED UP.** Billing integrity + generous free tier + no-dark-patterns pledge + Stripe + `useEntitlement` | **1** |
| **P9** | [P9-universal-ingest.md](./P9-universal-ingest.md) | **NEW.** One upload → grounded kit; Quizlet/Anki/CSV import; export + data ownership | **2** |
| **P2** | [P2-ai-tutor.md](./P2-ai-tutor.md) | Grounded, cited, voice-first tutor with cross-session memory (fills Quizlet's abandoned tutor hole) | **2** |
| **P1** | [P1-assessment-engine.md](./P1-assessment-engine.md) | Quizzes + practice tests + depth-on-demand + AI-graded free-response + learning-gain capture | **3** |
| **P5** | [P5-study-intelligence.md](./P5-study-intelligence.md) | **MOVED UP.** AI planner + "prove it makes you smarter" analytics + anti-burnout intelligence | **3** |
| **P10** | [P10-engagement-engine.md](./P10-engagement-engine.md) | **NEW.** SRS-wired multiplayer game (play IS review) + healthy anti-Duolingo streaks/leagues | **4** |
| **P3** | [P3-study-media.md](./P3-study-media.md) | Audio study (NotebookLM-floor naturalness, adaptive to weak areas) + mind maps | **4** |
| **P6** | [P6-content-publishing.md](./P6-content-publishing.md) | **EXPANDED.** Publishing/SEO engine + free exam hub (AI-graded FRQs) + community library + Certified tier | **5** |
| **P4** | [P4-smart-notes.md](./P4-smart-notes.md) | Notes + live lecture capture + the cross-tool converter contract | **5** |
| **F1** | [F1-flashcards-feature-adds.md](./F1-flashcards-feature-adds.md) | Addendum for the ACTIVE flashcards agent (confidence-tap, make-this-deeper, cloze, mastery viz) — not a new assignment | — |

Tiers are assignment priority, not sequencing — **all 11 run in parallel** (foundations exist;
contracts below decouple them). If agent capacity is constrained, staff tiers 1→5 in order.

## 5. The contracts — published day 1 so nobody waits on anybody

| Contract | Owner | Consumers | Interface |
|---|---|---|---|
| Study spine | ✅ built | every study tool | `studyService.recordAttempt({session, item, method, grade})` → FSRS + mastery. Extend `method`, never fork. |
| Agent-execution AI | ✅ built | every AI project | author via agent_author → `launchAgentExecution` + content-IR streaming (copy flashcards `useGenerateCards` + `data/agents.ts`). |
| Content model | ✅ pattern | P1, P3, P10 | canonical table + associations + `visibility` + `*Result` service (copy `fc_*`). Tables via `db-change` skills. |
| **TrustEnvelope** | **P0** | P1–P4, P6, P9 | `{citations[], confidence: 'grounded'\|'inferred'\|'not_in_material'}` in content-IR kinds + `<SourceCitations/>` + grade-on-meaning verdict shape. |
| **Access gate** | **P7** | all tools, P6-C, P10 | `useAccess(type, id)` → `{level, isOwner}` + `requireAccess` server guard + public-viewer route + duplicate-to-edit. |
| **Entitlements** | **P8** | all metered actions | `useEntitlement(capability)` → `{allowed, remaining, tier, reason}` + capability registry (permissive stub day 1). |
| **Converter** | **P4** (w/ P9 week-1) | P9 kit flow, flashcards, P1, P3 | `convertContent({source, targetKind})` — one dispatch for note-convert AND upload-kit fan-out. |
| **Learning gain** | **P1** | P5, P6-B | baseline/post rows `(user, topic/deck, phase, score, taken_at)`. |
| **Exam-hub service** | **P1** | P6-B | exam-type-first-class assessments + mock-exam generation as a service. |

## 6. The TRUST mandate (cross-cutting, enforced at Convergence A)

Every AI output in the hub carries the TrustEnvelope (citations + confidence + refusal path);
every grading path grades meaning, not strings; every cap/paywall is visible before, never
during, an action; no ads, ever; streaks forgive; metrics headline outcomes (mastery, learning
gain) over vanity (hours, streaks). **At Convergence A, any AI surface without the envelope and
any metered action without a pre-visible limit is a defect.**

## 7. Waves, convergences, fan-out

**Wave 1 (now):** all 11 projects in parallel + F1 with the flashcards agent. Day-1 contract
publications: P0 (TrustEnvelope), P7 (useAccess), P8 (useEntitlement), P4+P9 (converter), P1
(learning-gain + exam-hub shapes).

**→ Convergence A — Trust, Access & Monetization Integration.** Every tool: TrustEnvelope on AI
outputs, `useAccess` at edit/share points, `useEntitlement` at metered actions. DoD: the §6
audit passes hub-wide; the pledge/comparison pages are live and true.

**→ Convergence B — The Connected Study Loop.** Converter fan-out (note→deck→quiz→map→audio),
the unified dashboard (P5) surfacing next-best-action across ALL tools (incl. game + audio
review), cross-tool learning gain. DoD: one upload flows through every tool with nothing siloed;
NotebookLM's "features without a system" gap is demonstrably closed.

**→ Convergence C — Institutional & Community Readiness.** Teacher assignment + class analytics
(P5+P7), LMS embed (LTI 1.3/OneRoster), FERPA/COPPA, exportable reports (P5), certified/community
library at scale (P6-C), live classroom mode (P10 fan-out).

**Wave 2 fan-out (unlocked by B):** per-class hub (scopes-native — vision ADD pending approval),
class/group social rooms, study songs/mnemonics, talk-to-the-hosts audio, offline mode + browser
extension clipper, native mobile parity, standards alignment, grade-adaptive theming (K-5).

## 8. Flags — DECISIONS RECORDED (Arman, 2026-07-07)

1. **Vision additions**: pending Arman's direct answer (asked in-session 2026-07-07); the six
   competitive additions are baked into the briefs regardless — the open question is only
   whether `VISION-education-hub.md` gets amended and whether per-class hub enters this wave.
2. **Free-tier generosity: APPROVED** ("we need to be competitive and a generous free tier is
   fine"). P8 designs the matrix on that mandate; exact numbers get one FYI-with-veto look.
3. **Public viewer: DECIDED — two lanes.** The just-built `/s/[token]` (token links, noindex)
   stays; P7 builds `/p/e/[resourceType]/[id]` for indexable `visibility='public'` resources.
4. **F1 hand-offs: APPROVED, effective now** (nothing had been passed yet) — view/edit gate →
   P7, `microCoach` → P2, import/export → P9. Briefs updated; the flashcards agent reads F1.
5. **Uncommitted `utils/permissions/` diff: CONFIRMED** — P7 owns landing it.
6. **Game route name + mind-maps timing: proceed** — P10 picks the route at kickoff; P3 phases
   audio first, mind-maps in-wave.
7. **Stripe: proceed** — P8 starts; request test keys when checkout testing begins.
8. **Audio naturalness: RESOLVED** — we use Google's best TTS (same or better than NotebookLM);
   no escalation. P3's bar is script/pacing quality, not model quality.

## Change log
- **2026-07-07 v2** — Competitive research merged: added P0/P9/P10, expanded P6 (exam hub +
  community), reframed P8 (billing integrity, moved up), elevated P5, mandate sections added to
  P1/P2/P3/P4/P7, F1 addendum for the flashcards agent, TRUST mandate + updated contracts/waves.
- **2026-07-07 v1** — Initial 8 briefs from the live re-audit of the 2026-06-29 roadmap.
