# FEATURE.md — Assessment Engine (P1)

> **Status:** Live (2026-07-07). Quizzes + Practice Tests. One engine, two tools.
> Owner project: `docs/proposals/education-projects/P1-assessment-engine.md`.

## Purpose

Turn any topic, flashcard deck, or uploaded document into a **graded assessment** —
5 question types, depth-on-demand, grade-on-meaning free-response, grounded/cited
questions — and **measure learning gain** (pre/post delta). Replaces the two
`EduToolComingSoon` placeholders (`quizzes`, `practice-tests`) with real product.
Quizzes and practice tests are ONE content model (`assessment_kind`) and ONE
component set (`kindConfig` parameterizes labels/routes/timer/capability).

## Entry points

- Routes (thin server shells → client islands):
  - `/education/quizzes` + `/education/practice-tests` — list (`AssessmentHome`, `kind` prop)
  - `…/new` — generate (`AssessmentCreate`): topic / deck / document, depth, type mix, exam-type, (tests) time limit
  - `…/[id]` — detail + shareable take URL (`AssessmentDetail`). `?start=1` renders the taker; `?phase=baseline|post`+`?gain=<uuid>` drive learning-gain takings
  - `…/[id]/results?r=<resultId>` — scored report (`AssessmentResults`)
  - `…/[id]/edit` — inline edit + "make deeper" (`AssessmentEdit`, EDIT-gated)
- Feature code: `features/education/assessment/` (`data/`, `components/`).
- Agents (authored via `agent_author`, verified via `agent_run`, gemini-3.5-flash):
  `ASSESSMENT_AGENTS` in `data/agents.ts` — `generateQuiz` `afb89a8f…`, `generateQuizFromSource`
  `04acfd83…`, `deepenItem` `00ae6c89…`; grading REUSES `FC_AGENTS.gradeTypedAnswer`
  (`b39183d1…`, grade-on-meaning), `gradeSpoken`, `verifyAgainstSource`.

## Admin map

Enumerated in the Education Hub map — `app/(core)/education/admin/page.tsx` (quizzes +
practice-tests entries, `status: Live`, per-route `notes`). Update it when adding a route.

## Data model

`education` schema (base-entity pattern; migration `migrations/edu_assessment_tables.sql`,
canonical-OK verified live):

- **`assessment`** (root entity, shareable) — `assessment_kind` (quiz|practice_test),
  `title`/`description`/`status`, provenance `source_kind`(deck|note|topic|source)+`source_id`+`source_title`,
  `topic`, `exam_type`, `depth`, `time_limit_seconds`, `config` jsonb, `trust` jsonb.
- **`assessment_item`** (component of assessment; org inherited) — `question_type` (multiple_choice
  |true_false|fill_blank|short_answer|written_response), `prompt`, `options`, `correct_answer`,
  `acceptable_answers`, `explanation`, `rubric`, `depth`, `points`, `topic`, per-item `trust`.
- **`assessment_result`** (root entity, owned by the TAKER) — one scored taking. `assessment_id`,
  `session_id` (→ study spine), **`phase`** (standalone|baseline|post) + **`gain_group_id`** (the
  learning-gain pair), denormalized `topic`/`source_*`, `score_value`, counts, `points_*`,
  `duration_seconds`, `detail` jsonb (per-item breakdown snapshot).

RLS via `iam.apply_rls` (entity/component/entity). Registered in `entity_types`,
`entity_relationships` (assessment_item→assessment composition), `shareable_resource_registry`
(`assessment` → `/education/quizzes/{id}`). Types: `data/types.ts` (rows from generated `education` schema).

**Study spine is REUSED — no new attempts/mastery table.** Every answered question records via
`studyService.recordAttempt({ itemType: 'assessment_item', method: 'quiz'|'practice_test', … })`
→ `study_attempt` ledger + `item_mastery` (FSRS). Quiz misses feed weak-area review + the planner.

## Key flows

- **Generate** (`useGenerateQuiz`, mirrors flashcards `useGenerateCards`): `launchAgentExecution`
  (autoRun/direct, jsonExtraction) → poll `selectFirstExtractedObject` → drift-tolerant coercion
  (MC `correct_answer` repaired to match an option) → `assessmentService.createWithItems`. Deck mode
  feeds `### Card <id>` markers; document mode feeds `### Chunk <id>` markers (grounded → cited).
- **Take** (`useTakeAssessment` + `AssessmentTaker` + `QuestionView`): open session + result → per
  question grade (`gradeAnswerLocal` for MC/TF/fill; `gradeAnswerAI` grade-on-meaning for
  short/written) → record to spine → feedback (correct answer, explanation, citations, misconception,
  grade-override) → finalize result + close session → results page. Practice tests add a countdown
  that auto-submits at zero.
- **Learning gain** (`data/learningGain.ts`): "Measure my learning gain" starts a `baseline` taking
  with a fresh `gain_group_id`; the baseline results page CTAs into the `post` taking; the post
  results page shows the persisted **delta**. `pairLearningGain` is the read P5 consumes.
- **Depth-on-demand**: depth is first-class config on every generation path; per-item "make deeper"
  (`deepenItem` agent) appends an applied/exam-grade version in the editor.

## Invariants & gotchas

- **Route pages are Server Components** — pass the `kind` STRING to client components, never the
  `KindConfig` object (its Lucide `icon` is a function → RSC serialization error). Client resolves
  `KIND_CONFIG[kind]`.
- **One grading path.** Free-response grades on MEANING via `gradeTypedAnswer` (P0 contract); never
  add exact-string grading. MC/TF/fill grade locally (normalized). `written_response` grades against
  its `rubric`.
- **TrustEnvelope passthrough.** Agents emit `trust` per item; consumers `coerceTrustEnvelope` + render
  `<SourceCitations>`/`<ConfidenceBadge>` — never re-derive. Topic gen = `inferred`, no citations;
  deck/document gen = `grounded` with real `sourceId`/`excerpt`.
- **Spine RPC needs FSRS state.** `studyService.recordAttempt` computes it in `lib/srs/fsrs.ts` before
  the RPC; a raw RPC call with a graded result errors by design. Always go through the service.
- **`education.quiz_sessions` is NOT ours** (canvas artifact store). This engine is independent.
- Metering: generation wrapped in `useEntitlement("education.quiz_generate" | "…practice_test_generate")`
  — permissive stub until P8 flips enforcement; remaining count shown BEFORE the action.
- Access: `useAccess("assessment", id)` gates edit vs view; view-sharees get duplicate-to-edit
  (`assessmentService.duplicate`). RLS is the real boundary.

## Related features

- Study spine + FSRS + weak-area/planner: `features/education/study/` (consumer of our attempts).
- Trust: `features/education/trust/` (P0 — envelope, grade-on-meaning, citations UI).
- Access gate: `utils/permissions/` (P7). Entitlements: `features/entitlements/` (P8).
- Flashcards: `features/flashcards/` (the pattern we copied; deck source for generation).
- **Published contracts:** learning-gain rows (→ P5); exam-type-first-class assessments +
  mock-exam generation as a service (→ P6 exam hub).

## Doctrine compliance

- **Reused, didn't fork:** the study spine (new `item_type`/`method` only), the flashcards agent
  round-trip + streaming pattern, the P0/P7/P8 contracts, the trust UI. New primitives are generic:
  one `assessment` model serves both tools; `kindConfig` is the extension point for a third kind.
- No parallel Redux slice (grading/deepen are thunks over the existing execution-system slice).
- Types from the generated `education` schema; no `any`, no hand-mirrored shapes.

## Current work / migration state

- Shipped + live-verified (2026-07-07): DB (canonical-OK), 3 agents (real cited output via
  `agent_run`), full write path (RLS insert → spine RPC → `item_mastery` → learning-gain delta +0.40),
  routes render 200. Both tools flipped to `status: "live"` in `features/education/data/tools.ts`.
- Open / fast-follow: rubric-aware written-response grading (currently rubric-as-expected-answer);
  live streaming question preview during generation (hook exposes `activeRequestId`, UI shows a
  spinner today); spoken-answer capture on questions (reuse `gradeSpoken`); server-side
  search/pagination for the list at scale.

## Change log

- **2026-07-07** — Initial build: `assessment`/`assessment_item`/`assessment_result` tables + RLS +
  registration; 3 agents; service + `useGenerateQuiz` + grading + learning-gain contract; full
  quizzes + practice-tests UI (list/create/take/results/edit); tools flipped live; verified live.
- **2026-07-10** — Converter contract: registered real `quiz` + `practice_test` `ConvertGenerator`s
  (`data/quizGenerator.ts`, reusing `generateQuizFromSource` + exported `coerceGeneratedQuiz` +
  `assessmentService`) — replaces the P1 "coming soon" placeholders, lighting up P9 upload-kit
  fan-out and P4 note→quiz. Exam-hub deep-link prefill: `AssessmentCreate` seeds topic/examType/depth
  from `?examType=&topic=&depth=` via `useSearchParams` (route pages Suspense-wrapped).
- **2026-07-10** — Live DB-loop re-verification (real Supabase session, real RLS/triggers/RPC, via the
  actual `assessmentService`/`studyService` modules): quiz + practice_test assessments created →
  taken → spine-recorded (`study_attempt` `method=quiz`/`practice_test`) → results finalized →
  `item_mastery` advanced → learning-gain baseline 0 → post 0.6875 delta paired by `pairLearningGain`.
- **2026-07-10 (post-outage)** — **LLM generation + AI free-response grading now VERIFIED LIVE** (the
  D39 aidream outage recovered). Real supabase-js session driving the true client contract (`POST
  /ai/agents/{id}` → `parseNdjsonStream` → `coerceGeneratedQuiz` → `assessmentService`): deck-grounded
  `generateQuizFromSource` → 4 questions, **all 4 `trust.confidence='grounded'` with citations**;
  persisted under RLS; the take path graded 2 free-response answers on MEANING via the reused
  `gradeTypedAnswer` agent (`b39183d1…`; recorded to `study_attempt.graded_by=b39183d1…`); result
  finalized (75%). P2 converter verified live from a paste source (registry shows `quiz` available →
  5 grounded items → `education.assessment` `source_kind='source'`). Supersedes the outage note for P1.
