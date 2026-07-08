# P6 → P1: Exam-Hub Requirements (published early per the brief)

> From **P6 (Growth Content Engine)** to **P1 (Assessment Engine)**. P6 Phase B (the
> free exam hub) consumes P1's assessment-generation service. This is the "publish
> to P1 early so it keeps exam-type metadata first-class" note the P6 brief mandates.
> **Status 2026-07-07: P1 already satisfies all of this — see "Verified against live P1" below.**

## What Phase B needs from P1

The exam hub upgrades the marketing `exam-prep` axis pages (AP Bio, SAT, ACT, …) into
product surfaces where a visitor takes a **free mock exam** with **AI-graded
free-response (FRQ)**. For that, P1's service must keep the following first-class:

1. **Exam type is a first-class field**, not buried in freeform config — so an exam hub
   can request "generate a mock exam for `<examType>`" and list/filter assessments by it.
   - `examType` on the create input; `exam_type` column on the row; queryable.
2. **Mock-exam config shape** — a mock exam is an assessment with:
   - `assessmentKind` = practice-test (timed, multi-section),
   - `examType` set (e.g. `ap-biology`, `sat`),
   - `depth: "exam"` (exam-grade difficulty, not recall),
   - `timeLimitSeconds` for the timed run,
   - a mix of `questionTypes` including a **free-response / written** type.
3. **AI-graded free-response** — a written-response grading path that grades **meaning**
   (P0 grade-on-meaning under it), returns a verdict + grounded feedback + score, and is
   callable on a single item. No mocked grading (the DoD requires a real graded FRQ).
4. **Learning-gain capture** — baseline/post rows `(user, topic/deck, phase, score,
   taken_at)` so the exam hub can show "you improved" (P5/P6-B consume).
5. **Generation as a service** — a generate-mock-exam entry the hub can call from a hub
   page (copying the flashcards `useGenerate*` + agents pattern), returning items streamed
   via content-IR.

## Verified against live P1 (2026-07-07)

`features/education/assessment/` already provides all of the above:

- `data/types.ts`: `AssessmentConfig.examType`, `NewAssessmentInput.examType`, `exam_type`
  in `AssessmentPatch`, `Depth = "recall" | "applied" | "exam"`, `timeLimitSeconds`,
  `questionTypes`.
- `data/assessmentService.ts`: `createAssessment` persists `exam_type`, `depth`,
  `time_limit_seconds`, `config`, `visibility` (shareable), plus items.
- `data/useGenerateQuiz.ts`: generation hook (agent-execution + content-IR).
- `data/grading.ts` + `data/learningGain.ts`: written-response grading + learning-gain rows.

**Conclusion:** no changes requested of P1. P6 Phase B integrates against the existing
`assessmentService` + `useGenerateQuiz` + grading surface. If P1 refactors, keep
`examType`/`exam_type` and the single-item written-response grading path stable — the exam
hub binds to them.

## One small ask (forward-compatible, non-blocking)

Phase B shipped exam-hub CTAs on the exam-prep pages that deep-link into P1's create
surface with query params:

```
/education/practice-tests/new?examType=<slug>&topic=<Exam Name>&depth=exam
/education/quizzes/new?examType=<slug>&topic=<Exam Name>&depth=exam
```

`AssessmentCreate` doesn't read these yet, so today the user re-selects the exam. **When
convenient**, prefill the create surface from these params (seed `topic`, `examType`,
`depth` from `useSearchParams`, wrapped in a Suspense boundary). Harmless until then — the
links just land on the create page. This is the only P1-side wiring the exam hub wants.

## Contract P6 Phase B will consume

```ts
// Generate a free mock exam for an exam hub (signed-in; guest funnel per P8):
assessmentService.createAssessment({
  assessmentKind: "practice-test",
  title: `${examName} — Free Mock Exam`,
  examType,                    // e.g. "ap-biology"
  depth: "exam",
  timeLimitSeconds,
  config: { questionTypes: [/* incl. a written/FRQ type */], examType, depth: "exam" },
});
// then generate items via useGenerateQuiz(...) and grade FRQs via the written-response path.
```
