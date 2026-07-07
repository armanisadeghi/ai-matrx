# Education Hub — Delivery Roadmap & Project Decomposition

> ⚠️ **2026-07-07: Execution briefs supersede §3 of this doc.** One standalone, hand-off-ready
> brief per project (re-verified against live code + DB) lives in
> [`education-projects/`](./education-projects/README.md) — assign agents from THERE, not from §3.
> This doc remains the narrative overview.

> **Status date:** 2026-06-29. **Source of truth for scope:** [`app/(core)/education/VISION-education-hub.md`](../../app/(core)/education/VISION-education-hub.md).
> This roadmap is grounded in a live codebase + database audit (not memory). Each project below is
> sized to hand to one capable agent with a human in the loop. Read §1 before assigning anything.

---

## 1. Current status (grounded in code + live DB)

### Architectural facts that shape everything (verified)
- **AI is NOT raw Python.** Every AI action (generation, grading, tutoring) runs through the in-app
  **agent-execution pipeline** — authored agents referenced by UUID + `launchAgentExecution` thunks +
  content-IR streaming + JSON extraction. There is no `fetch()` to a Python endpoint in the education
  code. **Consequence:** every AI-dependent project's first step is to *author its agents* (via the
  agent-builder), then wire them with the proven flashcards pattern (`useGenerateCards`, `gradeCard`).
- **The study spine is built, shared, and populated.** `education.study_session` (147), `study_attempt`
  (190), `item_mastery` (110, FSRS state), `study_streak`, `study_goal` — mode-agnostic, written via
  `studyService.recordAttempt` → `study_record_attempt` RPC, with FSRS computed in TS (`lib/srs/fsrs.ts`).
  **Every study tool records here.** This is a real, reusable foundation.
- **FSRS spaced repetition is end-to-end and real** (compute → persist → Due/Weak-area/override).
- **Content model pattern is proven:** a canonical entity table (`fc_set`/`fc_card`/`fc_detail`) + edges
  via `platform.associations` + a `platform.visibility` enum + a `FcResult`-returning service layer +
  RLS. Every tool's items copy this shape.

### DONE (real, verified — the assets we build on)
- **Flashcards + FastFire tool (~90%).** Canonical content model; all three create paths (AI-from-topic
  streaming, RAG-from-source with lineage, CSV/Quizlet import); all 5 study modes + Review-due +
  Weak-area + full editor (`[setId]/edit`) + set detail + sessions history + progress + streak; FastFire
  with production-grade Web-Audio capture + live per-card grading (on by default) + spoken fronts + batch
  "professor" review + reusable single-card voice test. **`fc_set` 33 / `fc_card` 481** rows.
- **Marketing/discovery hub.** 5 axes (subjects/levels/exam-prep/study-aids/features) fully fleshed with
  rich `sections`; `SectionRenderer`; hub landing; per-page canonical + OG + twitter metadata; the
  routing contract ([`ROUTING.md`](../../app/(core)/education/ROUTING.md)) with the view/edit-gate model.
- **Study Planner v1.** Real `study_goal` CRUD + heuristic ranking (urgency + struggle). *(Vision's AI
  schedule/calendar/re-plan is NOT built.)*
- **`quick-math`** (12 problems, ISR-style server render) and the tool placeholder routes (surface-aware).
- Per-feature admin map.

### IN FLIGHT (owned by the active flashcards agent — do not re-assign)
- Flashcards remaining: view-vs-edit **permission gate** for shared sets + duplicate-to-edit; image/audio
  **card** attachments in the editor; the unwired **enhance/expand** capability (agents exist, no UI);
  `microCoach` (null agent); FastFire **mid-session adaptation**; server-side search/pagination.

### MISSING (the remaining work this roadmap decomposes)
- **6 tools are stubs** (`EduToolComingSoon` placeholders): quizzes, practice-tests, tutor, audio-study,
  mind-maps, notes.
- **`/learn` is demo-grade** — served from a hardcoded TS registry (`LEARN_DOCS`, 8 docs);
  `study_structured_section` is **empty (0 rows)**; no authoring, no DB path, no SSG/ISR.
- **SEO machinery gaps:** the sitemap hardcodes a single `/education` URL (no learn/axis entries); no
  `generateStaticParams`; no per-doc OG images; no axis JSON-LD (the `faq` blocks could power `FAQPage`).
- **Sharing is incomplete:** `visibility` enum + RLS exist, but no view/edit gate, no unauthenticated
  public viewer route, no duplicate-to-edit. **(The #1 gap surfaced by the flashcards audit.)**
- **Entitlements/billing is greenfield** — Stripe dead, no subscription/entitlement tables;
  `features/pricing` is UI-only. See [`ENTITLEMENTS_AND_BILLING_REQUIREMENTS.md`](./ENTITLEMENTS_AND_BILLING_REQUIREMENTS.md).
- **Analytics/learning-gain** is per-set only (flashcards progress); no cross-tool dashboard, no pre/post
  learning-gain, no exportable reports.

### Open flags (resolve before assigning — see §6)
- `education.quiz_sessions` has **64 rows** but the flashcards Test mode records to `study_session`
  (method `test`). Source of the quiz_sessions data is unconfirmed — the Assessment project must
  reconcile whether it's the table to build on or legacy.
- Drift (fixed in this pass): admin map marked `fastfire` "coming soon" (it's live); `tools.ts` marked
  `planner` "coming-soon" (it's live).

---

## 2. Shared contracts — define these on day 1 so projects don't block each other

| Contract | State | Interface the tools build against |
|---|---|---|
| **Study spine** | ✅ built | `studyService.recordAttempt({ session, item, method, grade })` → FSRS + `item_mastery`. Reuse as-is. |
| **Agent-execution AI** | ✅ built | Author agent(s) → `launchAgentExecution({agentId, runtime, config})` + content-IR streaming (copy `features/flashcards/data/useGenerateCards`). Each AI project authors its own agents first. |
| **Content model** | ✅ pattern | canonical table + `platform.associations` edges + `visibility` enum + `*Result` service. Copy `fcService`. |
| **Sharing/Access** (P7) | 🔲 to build | `useAccess(resource, 'view'|'edit')` gate + `/p/…` public viewer + duplicate-to-edit. **Publish this interface Wave-1 day 1** so P1–P5 build against it. |
| **Entitlements** (P8) | 🔲 to build | `useEntitlement(capability) → {allowed, remaining, tier, reason}` + a capability registry. **Publish this interface Wave-1 day 1** so every AI action gates against it while the backend is built. |

---

## 3. Projects (P1–P8) — full specs

### P1 — Assessment Engine (Quizzes + Practice Tests)
**Objective.** The auto-generated assessment layer — quizzes and full practice tests — that turns any
material or deck into graded assessments with item-level feedback and *measured learning gain*. Delivers
the vision's "we optimize for the pre/post test delta" pillar and the standardized-exam surface.
**Scope IN.** Quiz generation across 5 question types (reuse `fc_make_quiz_items` + the flashcards Test
mode); quiz-taking + item-level feedback/explanations; scored results page; practice-tests (timed,
full-length, configurable question mix/difficulty/count/time); **pre/post baseline→post-test
learning-gain** capture; the `/education/quizzes/**` + `/education/practice-tests/**` routes replacing the
placeholders; assessment persistence.
**Scope OUT.** The analytics dashboards (P5 reads this data); the tutor (P2); billing gates (consume P8).
**Deliverables / DoD.** Generate a quiz from topic/deck/upload → take it → item-level feedback + scored
results; build + take a timed practice test; a pre/post delta is recorded to the study spine; assessments
are shareable via the P7 gate.
**Surfaces.** `app/(core)/education/{quizzes,practice-tests}/**`; new `features/education/assessment/**`;
study spine (`studyService`); `education.quiz_sessions` (reconcile — see flags) or a new assessment table;
new authored assessment agents.
**Dependencies / contracts.** Study spine (✅), agent pattern (✅), Sharing (P7), Entitlements (P8).
Reuses the flashcards Test-mode generator. Define the **learning-gain data contract** (baseline vs post)
that P5 consumes.
**Verification.** End-to-end generate→take→grade→results with DB rows; a computed pre/post learning-gain
delta; shared quiz opens for a view-sharee.

### P2 — AI Tutor
**Objective.** The persistent, memory-carrying, RAG-grounded tutor present at *every* study surface —
the platform's #1 differentiator ("AI that knows everything; a personal tutor, not a chatbot").
**Scope IN.** Conversation surface (`/education/tutor` + `[conversationId]`); RAG grounding on the user's
own materials (reuse `features/rag` + the already-generalized flashcards tutor agents `fc_help_live` /
`fc_review_batch`); **cross-session memory** (sets/questions seen, answers, performance trends, exam
dates — reuse `learnerContext` + the study spine); Socratic mode; first-class **voice** Q&A; the shared
inline **"I'm confused"** entry primitive reachable from any card/surface; tunable personality; source
citations.
**Scope OUT.** The grading engine (reuse FastFire's); the study data it reads (owned by the tools/spine).
**Deliverables / DoD.** A persistent tutor conversation grounded in the user's decks/notes *with
citations*; context carried across sessions; Socratic + voice; a shared "Ask the tutor" entry usable from
any study surface; memory persists to DB.
**Surfaces.** `app/(core)/education/tutor/**`; `features/education/tutor/**` (generalize from
`features/flashcards/data/tutor`); `features/rag`; new tutor agents; a shared `AskTutor` primitive.
**Dependencies / contracts.** Agent pattern (✅), RAG (✅), study spine for memory (✅). Sharing/Entitlements.
**Verification.** A grounded answer citing the user's own material; cross-session memory recall; a voice
round-trip; entry launched from a flashcard.

### P3 — Generated Study Media (Audio Study + Visual Maps)
**Objective.** Turn any material into consumable media — broadcast-quality **audio** (overviews, dueling
debates, host/panel, audio review) and **visual** concept maps/diagrams — the auditory + visual learning
pillars, both areas competitors are weak.
**Scope IN.** *Audio Study* (strong reuse: `features/podcasts` + `features/audio` + the aidream
`podcast_*.py` suite; flashcards Phase 7 already wired podcast-gen into a deck — generalize to a standalone
tool): overviews, two-voice debates, multi-host panels, audio review quiz; `/education/audio-study/**`.
*Visual maps* (mind maps, knowledge graphs, diagram types via the content-IR / mermaid render substrate;
clickable nodes linking to cards/explanations); `/education/mind-maps/**`.
**Scope OUT.** The audio pipeline internals (reuse); the diagram render primitives (reuse).
**Deliverables / DoD.** Generate an audio overview + a debate + a panel from a deck/notes → play + share;
generate a mind map from material with clickable nodes → view + share.
**Surfaces.** `app/(core)/education/{audio-study,mind-maps}/**`; `features/education/media/**` (new);
`features/podcasts`/`features/audio`; content-IR/mermaid; new agents.
**Dependencies / contracts.** Agent pattern (✅), the podcast suite (aidream ✅), content-IR (✅).
Sharing/Entitlements.
**Verification.** Generated audio plays; a debate has two distinct voices; a mind map renders with
node→card links; both shareable. **Note:** mind-maps is the lighter, weaker-reuse half — phase it after
audio if capacity is tight.

### P4 — Smart Notes
**Objective.** Notes integrated into the full study loop — capture, then one-click convert to any study
artifact — closing the vision's "nothing is siloed" loop.
**Scope IN.** Rich note editor (reuse `features/notes`); live-lecture transcription into the editor (reuse
`features/transcripts`); **one-click convert** a note/passage → flashcards / quiz / summary / mind map
(calls the flashcards + P1 + P3 generators); `/education/notes/**`; sharing.
**Scope OUT.** The flashcard/quiz/map generators themselves (owned by flashcards/P1/P3 — Notes *calls*
them via a converter contract).
**Deliverables / DoD.** Create/edit a rich note; transcribe a live lecture into it; convert a note to a
deck + a quiz + a mind map in one click; shareable.
**Surfaces.** `app/(core)/education/notes/**`; thin `features/education/notes/**` over `features/notes`;
`features/transcripts`; the converter contracts from flashcards/P1/P3.
**Dependencies / contracts.** `features/notes` + `features/transcripts` (✅). **Define the "convert source
X → kind Y" converter contract** with flashcards/P1/P3 so Notes calls a stable interface. Sharing/Entitlements.
**Verification.** note→deck, note→quiz, note→map all produce real artifacts; live transcription lands in
the editor.

### P5 — Study Intelligence (Planner completion + Progress Analytics & Learning-Gain)
**Objective.** Make the (already-populated) study data actionable — the AI planner + the analytics and
learning-gain dashboards. Delivers the "measurable learning gain" institutional differentiator and the
"tells you exactly what to study next" dashboard.
**Scope IN.** Finish the **Planner** (AI day-by-day schedule from exam dates + per-subject mastery + daily
time; exam-calendar integration via `features/scheduling`; adaptive re-planning on new performance).
**Progress analytics** (per-card/deck/subject mastery %, weak-area surfacing, session/cumulative time,
error-pattern analysis, improvement curves). **Learning-gain reporting** (pre/post delta from P1's
assessments; exportable reports for students/parents/institutions). A **unified study dashboard** ("what
to study next, for how long, and why").
**Scope OUT.** Raw data capture (owned by the tools/spine); the assessment engine (P1 — reads its deltas).
**Deliverables / DoD.** An AI day-by-day plan around real exam dates that re-plans on new performance; a
mastery + weak-area + learning-gain dashboard reading live `study_session`/`attempt`/`item_mastery` +
assessment deltas; an exportable learning-gain report.
**Surfaces.** `app/(core)/education/planner/**` (complete it); a new analytics surface; extend
`features/education/study/studyService`; `features/scheduling`.
**Dependencies / contracts.** Study spine (✅ populated), P1's learning-gain contract, `features/scheduling`.
**Verification.** Plan generates + adapts; the dashboard shows real numbers from live data; a learning-gain
report exports.

### P6 — Content Publishing Engine (`/learn` → DB-backed + SEO growth)
**Objective.** Turn the demo `/learn` registry into a real, DB-backed, SEO-optimized publishing engine —
the top-of-funnel organic-growth surface that ranks and funnels into the app.
**Scope IN.** DB-backed content on `education.study_structured_section` + an authoring/admin CRUD
(draft/publish); render `/learn` from the DB (replace the seeded registry; migrate the 8 seed docs);
`generateStaticParams` + `revalidate` (SSG/ISR) for learn + axis pages; a **dynamic sitemap** enumerating
every learn doc + axis entry; per-doc **OG images** (`opengraph-image` routes); **JSON-LD on axis pages**
(`FAQPage` from `faq` blocks, `Course`); keyword coverage.
**Scope OUT.** The study tools; the marketing axis *content* (done — this adds SEO machinery over it).
**Deliverables / DoD.** Publish a new learn article via the authoring UI *without a deploy*; it renders
from DB, is in the sitemap, has an OG image + valid JSON-LD; axis pages emit `FAQPage` JSON-LD + appear in
the sitemap; ISR revalidates.
**Surfaces.** `app/(core)/education/learn/**`; `app/sitemap*`; new `opengraph-image` routes;
`features/education/data` (registry → DB read); `education.study_structured_section`; a new authoring admin.
**Dependencies / contracts.** None blocking — independent of the study tools. `study_structured_section`
(empty, exists).
**Verification.** Authored doc appears without deploy; sitemap includes all education URLs; OG renders;
JSON-LD validates; ISR revalidates.

### P7 — Sharing & Public Access *(foundational contract — define Wave-1 day 1)*
**Objective.** The platform sharing primitive every study tool needs — clean view-vs-edit gating, an
unauthenticated public viewer, and duplicate-to-edit — so shared study content works like Google
Docs/Quizlet. Closes the flashcards audit's #1 gap and unblocks the entire share/collaborate vision.
**Scope IN.** The **view/edit gate** helper (per ROUTING.md: `[id]` view-gated, `[id]/edit` edit-gated via
`iam.has_access`); **duplicate-to-edit** for view-only sharees; an **unauthenticated public viewer** route
(reconcile with the existing `/p/[slug]` pattern) that serves shared study content signed-out;
per-user/per-org grant sharing where the visibility enum is insufficient; **apply to flashcards as the
reference implementation**. Ship it as a reusable primitive (hook + route pattern + guard) all tools consume.
**Scope OUT.** The tools (they consume this); billing (P8).
**Deliverables / DoD.** A shared deck opens read-only for a view-sharee; `/edit` redirects them to view +
offers duplicate; a public deck is viewable while signed-out at a public URL; the primitive is documented
+ consumed by flashcards.
**Surfaces.** `features/sharing`; `iam.has_access`; `platform.associations`/`visibility`; a public viewer
route; the flashcards sharing components (reference); the tool routes.
**Dependencies / contracts.** Permissions/sharing system (✅) + flashcards visibility (✅) as reference.
**This is a contract others depend on — publish the `useAccess` interface on day 1.**
**Verification.** A view-only sharee can't edit but can duplicate; a signed-out user views a public deck;
a second tool adopts the same primitive unchanged.

### P8 — Entitlements & Billing (monetization + conversion funnel) *(foundational contract — define Wave-1 day 1)*
**Objective.** The forked greenfield monetization layer — free/paid control, trials, usage metering,
Stripe — that converts without hard-walling the free experience, and gates every tool. Per
[`ENTITLEMENTS_AND_BILLING_REQUIREMENTS.md`](./ENTITLEMENTS_AND_BILLING_REQUIREMENTS.md).
**Scope IN.** DB (products/prices; subscriptions on user + org; an **entitlements resolver** like
`iam.has_access`; usage → **enforced caps**; Stripe webhooks); the **`useEntitlement(capability)`**
contract + a capability registry; metered caps on expensive AI actions (generation/grading/audio); two
paywall surfaces (contextual cap-hit modal + `/pricing`); wire `features/pricing` (UI exists) to the real
backend; trial tracking.
**Scope OUT.** The tools (consume the contract); the sharing gate (P7). Reconcile with `account_tiers`
(keep it for compute quotas; billing entitlements are new).
**Deliverables / DoD.** `useEntitlement` returns allowed/remaining/tier; a free user hits a metered cap →
contextual paywall; a Stripe checkout creates a real subscription that flips entitlements; usage metered +
enforced.
**Surfaces.** New billing DB tables; `app/api/stripe/**`; `features/pricing` (wire to backend); a new
entitlements resolver + `useEntitlement` hook; the tool AI-action sites (consumers).
**Dependencies / contracts.** The requirements doc; `account_tiers` (reconcile). **Publish `useEntitlement`
on day 1** so tools build against it while the backend is built.
**Verification.** checkout → subscription → entitlement flip; a metered cap enforced; both paywall
surfaces render.

---

## 4. Convergence points & fan-out

**Convergence A — Access & Monetization Integration.**
*Feeds:* P7 + P8 + every tool (P1–P5) + flashcards. *Glue:* each tool wires the `useAccess` view/edit gate
at its edit/share points and `useEntitlement` at its expensive AI actions. *DoD:* every shareable item
respects view vs edit; every metered AI action checks entitlements and shows the paywall on cap.
*Unlocks:* real sharing/collaboration + monetization across the whole hub.

**Convergence B — The Connected Study Loop.**
*Feeds:* P4 (converters) + P1 + P3 + P5 + flashcards. *Glue:* the one-click cross-tool converters
(note→deck→quiz→map→audio) + a unified "study dashboard" (next best action across all tools) +
cross-tool learning-gain. *DoD:* content flows note→flashcards→quiz→spaced-review→planner→analytics with
nothing siloed; one dashboard surfaces the next action across tools. *Unlocks:* the "all-in-one ecosystem"
differentiator.

**Convergence C — Institutional Readiness.**
*Feeds:* P5 (learning-gain) + P7 (sharing) + P8 (billing) + the fan-out below. *Glue:* teacher assignment
+ class analytics + LMS embed + compliance + exportable reports. *DoD:* a teacher assigns content to a
class, sees class-level learning-gain, embeds via LMS, under FERPA/COPPA. *Unlocks:* B2B / district sales.

**Fan-out (new parallel work unlocked once the tools + analytics exist):**
- **Gamification & Social/Collaboration** — leaderboards, streaks (`study_streak` ✅), badges, head-to-head
  (Kahoot-style), class/group rooms, real-time co-study, teacher tools. Unlocked after Convergence B.
- **Institutional** — teacher assignment/dashboards, LMS (Google Classroom/Canvas, LTI 1.3/OneRoster),
  FERPA/COPPA, exportable learning-gain reports. Feeds Convergence C.
- **Multi-format Ingestion breadth** — unify PDF/video/YouTube/live-lecture/photo-OCR/whiteboard into one
  "source → study material" service feeding every tool (enhancement — tools generate from topic/docs today).
- **Cross-platform** — native mobile parity, offline, the browser extension.

---

## 5. Waves (ordered by impact on the core vision)

**Wave 1 — maximum parallelism (8 projects + flashcards in flight).**
All of P1–P8 start together; the shared foundations (study spine, agent pattern, content model) already
exist, and **P7 + P8 publish their contract interfaces on day 1** so P1–P5 build against them without
waiting. Priority ordering *within* the wave (by vision impact):
1. **P2 AI Tutor** + **P1 Assessment Engine** + **P7 Sharing** — the top differentiators + the current #1 gap.
2. **P5 Study Intelligence** + **P8 Entitlements** — the learning-gain/institutional edge (data's already
   there) + monetization.
3. **P3 Media** + **P4 Notes** + **P6 Content Publishing** — strong differentiators/growth, strong reuse.

→ **Convergence A (Access & Monetization Integration).**

**Wave 2 — fan-out** (Gamification & Social, Institutional, Ingestion breadth, Mobile), overlapping with
→ **Convergence B (Connected Study Loop).**

→ **Convergence C (Institutional Readiness).**

---

## 6. Assumptions & flags to resolve before assigning
1. **`quiz_sessions` (64 rows)** — reconcile whether it's the assessment table to build on or legacy; P1
   is blocked on this decision. *(Owner: you / P1 kickoff.)*
2. **Agents-first workflow** — each AI project (P1–P4) must author its agents via the agent-builder before
   wiring. Assumes the agent-builder + runner are available to every project (they are). Confirm who owns
   authoring vs consuming the agents.
3. **Mind-maps horizon** — folded into P3 as the lighter half; vision §10 + the audit call it weak-reuse.
   Confirm: build now with audio, or defer mind-maps to a later wave.
4. **Public viewer** — reuse the platform `/p/[slug]` route or a new education-specific public viewer? (P7.)
5. **Entitlements vs `account_tiers`** — confirmed separate (account_tiers = compute quotas; billing
   entitlements = new). Confirm no consolidation is wanted. (P8.)
6. **Horizon of the fan-out** (Gamification/Social, Institutional, Mobile) — in scope for this roadmap or a
   later cycle? They're placed as Wave-2/Convergence-C.
7. **Flashcards ownership** — the in-flight items (§1) stay with the active agent; P7's sharing gate should
   land in flashcards *as the reference*, which means P7 and the flashcards agent must coordinate on that
   one surface. Confirm the hand-off.

## Change log
- **2026-07-07 (later)** — Competitive research merged into the execution set: the master plan in
  [`education-projects/README.md`](./education-projects/README.md) now supersedes this doc's §4–§6
  (waves/priorities) as well — 11 projects (P0 TRUST, P9 ONBOARD, P10 ENGAGE added; P6 expanded
  with the exam hub + community library; P8 reframed as billing integrity and moved up; P5 elevated).
- **2026-07-07** — Execution briefs created in [`education-projects/`](./education-projects/README.md)
  after a fresh live re-audit. §6 flag 1 RESOLVED: `quiz_sessions` is the canvas artifact quiz store
  (`features/canvas/artifact-types/persistence/quiz-adapter.ts`) — P1 builds new canonical tables.
  Sharing plumbing materially improved since 2026-06-29 (grants really grant; uncommitted
  token-vs-table registry reconciliation pending — P7 owns landing it); all three P7 product gaps
  still open.
- **2026-06-29** — Created from a live code + DB audit. 8 projects, 3 convergence points, waves.
