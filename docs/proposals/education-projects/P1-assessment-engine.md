# P1 — Assessment Engine (Quizzes + Practice Tests + Learning Gain)

> **Status date:** 2026-07-07 · **Wave 1, priority tier 1** · One agent, human in the loop.
> Read [`README.md`](./README.md) (shared contracts) and
> [`app/(core)/education/VISION-education-hub.md`](../../../app/(core)/education/VISION-education-hub.md)
> §2 (Test/Quiz mode), §8 (Practice Tests & Exam Prep) before starting.

## Objective

Build the auto-generated assessment layer — quizzes and full timed practice tests — that turns any
deck, topic, or uploaded material into graded assessments with item-level feedback and **measured
learning gain** (pre/post delta). This delivers the vision's single most important institutional
differentiator: "we don't optimize for streaks and screen time; we optimize for the pre/post test
delta." It also replaces two of the six placeholder tools with real product.

## Current state (verified — build on this, don't rediscover it)

- **Routes exist as stubs:** `app/(core)/education/quizzes/{page,new,[id],[id]/edit,[id]/results}`
  and `app/(core)/education/practice-tests/{same tree}` — every page renders `EduToolComingSoon`.
  Both are `status: "coming-soon"` in `features/education/data/tools.ts`.
- **Quiz-item generation already exists:** agent `fc_make_quiz_items` (UUID `03ea2bc2-…`) wired at
  `features/flashcards/data/quiz/makeQuizItems.ts` — generates quiz items from cards for the
  flashcards Test mode. Reuse/generalize it; author additional agents (from-topic, from-source,
  practice-test composer) via agent_author following `features/education/docs/AGENT_SPECS.md`.
- **The study spine records everything:** `studyService.recordAttempt` →
  `education.study_attempt` / `study_session` / `item_mastery` (FSRS). The flashcards Test mode
  already records with `method: 'test'`. Assessments record here too — new `method` values
  (`quiz`, `practice_test`), never a parallel attempts table.
- **`education.quiz_sessions` is NOT yours.** Verified: it's the canvas artifact quiz store
  (`features/canvas/artifact-types/persistence/quiz-adapter.ts`, blob `state` JSONB, content-hash
  keyed, 64 rows / 3 users since Oct 2025). Leave it alone; do not build on it, do not migrate it.
- **`StudyDeck`** (`features/flashcards/components/study/StudyDeck.tsx`) is the extracted, shared
  study-session primitive — evaluate reusing it for quiz-taking flow before building a new runner.
- **Voice grading is a reusable primitive** (`gradeSpokenAnswer` / grading-core, agent
  `gradeSpoken` `e0449378-…`) — spoken answers on quiz items are in reach, not a moonshot.

## Scope

**IN**
- Canonical assessment content model: new `education.` tables following the `fc_set`/`fc_card`
  pattern — an assessment (quiz or practice-test config), its items (5 question types: MC, T/F,
  fill-in-blank, short answer, written response), and results. Base columns, `platform.visibility`,
  `platform.associations` edges (assessment ↔ source deck/note/topic), RLS via the canonical
  generator (`iam.apply_rls` — never hand-write policies), registration in
  `platform.shareable_resource_registry` + the TS mirror (coordinate with P7's registry work).
- Generation paths: from a flashcard deck (generalize `makeQuizItems`), from a topic prompt, and
  from an uploaded/RAG source (copy the flashcards `CreateFromSource` lineage pattern).
- Quiz-taking flow with item-level feedback + explanations and a scored results page
  (`[id]/results`).
- Practice tests: timed, full-length, configurable question mix / difficulty / count / time limit;
  detailed post-test analysis (why each wrong answer was wrong, what to review).
- **Pre/post learning-gain capture:** a baseline assessment before study, a post assessment after,
  and a persisted delta. Define and publish the **learning-gain data contract** on day 1
  (rows keyed `(user, topic/deck, phase: baseline|post, score, taken_at)`) — P5 reads it.
- Every attempt recorded to the study spine (`recordAttempt`, new methods) so quiz misses feed
  FSRS mastery and weak-area review.
- Edit routes wired against the P7 `useAccess` signature; expensive generation calls wrapped in
  the P8 `useEntitlement` capability check (permissive stub until P8's backend lands).

**IN — competitive mandates (added 2026-07-07 from the market research)**
- **Depth on demand:** tiered generation — rote recall → applied → exam/clinical depth — as a
  first-class config on every generation path, plus a per-item "make this deeper" action. (Gizmo/
  StudyFetch/NotebookLM are all hated for shallow "X is Y" items; the med/law cohort hand-edits
  every AI card today. This wins them.)
- **Free-response is first-class, not an afterthought:** short-answer + written-response graded
  on meaning via P0's grade-on-meaning verdict shape (NotebookLM's wedge-exposing weakness is
  MCQ-recognition-only; Knowt's is exact-string grading). AI-graded FRQs are also what P6's exam
  hub serves — keep the grading path reusable.
- **TrustEnvelope compliance (P0):** every generated item carries citations to its source
  deck/material; explanations cite; grading feedback is grounded.
- **Exam-hub contract (publish early for P6):** exam-type metadata is first-class on assessments
  (AP Bio, SAT, …) and mock-exam generation is exposed as a service (config in → assessment out)
  so P6's free exam hub can serve mocks without reaching into your internals.

**OUT**
- Analytics dashboards (P5 reads your data). The tutor (P2). Sharing internals (consume P7).
  Billing internals (consume P8). Canvas `quiz_sessions`. Curated exam content libraries and the
  exam hub surface itself (P6 — you provide the engine + contract).

## Deliverables / Definition of done

1. Generate a quiz from a topic, from a deck, and from an uploaded source → take it → item-level
   feedback → scored results page. Real DB rows at every step.
2. Configure + take a timed practice test → detailed item-level post-test analysis.
3. A baseline→post pair produces a persisted, queryable learning-gain delta.
4. Quiz attempts appear in `item_mastery` / weak-area surfacing (spine integration proven).
5. Both tools flipped to `status: "live"` in `tools.ts`; admin map updated; FEATURE.md written.
6. A shared quiz opens for a view-sharee (once P7 lands; until then, the gate call sites exist).

## Surfaces touched

- `app/(core)/education/quizzes/**`, `app/(core)/education/practice-tests/**` (replace stubs)
- New `features/education/assessment/**` (components, service, agents registry, types)
- `features/education/study/service/studyService.ts` (extend methods — small, additive)
- New `education.*` assessment tables + migrations (Supabase MCP, ledger, `pnpm db-types`)
- New authored agents (agent_author) + `features/education/docs/AGENT_SPECS.md` /
  `LIVE_AGENTS.md` updates

## Dependencies & contracts

- Study spine ✅, agent-execution pipeline ✅, content model pattern ✅ — all live, copy flashcards.
- **Publishes:** the learning-gain contract (day 1, in this brief's feature doc) → P5; the
  exam-hub/mock-exam service contract → P6 (early, before the engine is finished).
- **Consumes:** P7 `useAccess` signature; P8 `useEntitlement` signature; P0 TrustEnvelope +
  grade-on-meaning verdict shape (all published day 1).
- **Exposes for P4/P9:** quiz generation behind the converter contract
  (`convertContent({source, targetKind: 'quiz'})`).

## Build guidance

- DB work: invoke the `db-change` skill family; migrations idempotent, applied via MCP, verified
  live, ledger-recorded, `pnpm db-types` after. RLS only via `iam.apply_rls`.
- Types: invoke `type-safety` before any `.from()`/`.rpc()` code. No `any`, no casts.
- Agents first: author the agents, verify them with agent_run, then wire — the flashcards
  `useGenerateCards` streaming pattern is the reference for streamed generation UX.
- UI: Lucide only, semantic color classes, `<PageHeader>` + `h-full overflow-hidden` body
  (core-shell contract), component-library loading states.
- Finish with the `finalize-and-ship` skill.

## Verification

End-to-end in the browser (form login `admin@admin.com`): generate → take → grade → results for
both tools; confirm DB rows (`execute_sql`) for assessment, items, attempts, spine writes, and a
learning-gain delta; confirm a second user with a view grant can open but not edit (post-P7).
Give Arman exact routes to test and what to look for.

## Open questions

- Question-type depth for v1 written-response grading (rubric-derived AI grading per vision §6) —
  recommend shipping MC/TF/fill-in/short-answer graded fully, written-response graded by the
  `gradeSpoken`-style agent pattern, and flagging rubric-aware grading as a fast-follow.
