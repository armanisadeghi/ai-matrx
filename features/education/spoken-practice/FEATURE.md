# Spoken Practice — FEATURE.md

**Route:** `/education/practice-oral` (deep-link a mode with `?mode=oral_exam|interview_prep|debate|pronunciation`; server shell → client island, entry registered in `features/education/data/tools.ts` as `practice-oral`).
**Status:** Live. Product: common-docs/systems/education/VISION.md (oral exam, interview prep, debate, pronunciation; spoken AI grading).

Real-time spoken grading of open-ended answers in four modes. The student answers OUT LOUD; a
mode-framed examiner / interviewer / debate opponent / language coach poses grounded prompts,
grades every answer on meaning, then closes with a batch review.

## The one rule: reuse the voice + grading + spine stack, never fork it

New voice surface = new prompt/rubric + orchestration UI, NOT a new capture or grading path.
Reused: the `continuousCapture` singleton (`features/flashcards/fast-fire/audio/`), the spoken-grade
primitives in `features/flashcards/fast-fire/agents/grading-core.ts` (`uploadResponseClip`,
`runSpokenGrader`, `coerceSpokenGrade` → `SpokenGrade`), `studyService` (session + `recordAttempt`),
`useCartesiaSpeaker` for reading prompts aloud, and `features/education/trust`
(`ConfidenceBadge`, `SourceCitations`, `GradeVerdict`). In-feature: `data/gradePracticeAnswer.ts`
(upload → grade → record) and `data/reviewPracticeSession.ts` (writes `session_review`).

**Dedicated mode-aware mandates** (`mandates.ts`, `SPOKEN_PRACTICE_MANDATES`; the DB picks the
agent). Never reuse the FastFire flashcard grader or review lane: they carry flashcard and
tool-narration framing. Designer (`design`) and, for `pronunciation`,
`design_language` (same plan shape, target-language phrase in guillemets + English gloss);
grader (`grade`, mode rides as FACTUAL data on the first line of `rubric`; persona rules live in the
DB agent) and `grade_pronunciation` (same `SpokenGrade` plus an optional `pronunciation` object
`{accuracy, fluency, intelligibility, prosody, notes}`, null in other modes); reviewer
(`review`, tools disabled so it cannot narrate DB discovery, output `{summary, strengths[], weaknesses[]}`).
Pronunciation is holistic transcript-level judgement, never phoneme scores — the UI says so.
Mode config (persona, rubric focus, copy): `constants.ts#MODE_CONFIG`; icon-free vocabulary the
manifest and validators read: `vocabulary.ts`.

## Data model — no new table

- Session = one `education.study_session` (`mode` = practice mode; free-form, no check constraint).
  `settings.prompts[]` jsonb holds the designed plan; `source_kind` is `set` or `topic`;
  `session_review`, `aggregate_score`, `session_audio_file_id` are set at the end.
- Each answer = one `study_attempt` via `gradeSpokenAnswer` → `study_record_attempt`: `item_type`
  `spoken_prompt` (`SPOKEN_PROMPT_ITEM_TYPE`), `item_id` a client-minted uuid per prompt (polymorphic,
  no FK), `method` = the mode, `response_kind` `spoken`. Prompts are ephemeral per session, so they
  do not belong in a shared questions table.

## Flow and invariants

- `useSpokenPractice` phase machine: generating → warm mic → create session → per prompt: asking
  (TTS) → answering (press Done; `ANSWER_MAX_SECONDS` runaway guard only) → grading → result →
  reviewing → summary. Local state, not a Redux slice; audio never enters state (only `file_id`s and grades).
- **Completion is terminal-FIRST:** `endSession` marks the session `completed` + `ended_at` +
  `aggregate_score` as its first await, before the audio upload and review (both best-effort,
  loud-recovered). A failed upload or review never leaves an `active` session.
- Every prompt carries a `TrustEnvelope` (`data/grounding.ts#promptTrust`): the designer's honest
  per-prompt confidence plus a citation to the source actually supplied. Grades are on meaning
  (`SpokenGrade.verdict` is a `GradeVerdict`); never string-match.
- Verdicts render through `AnswerGradeBlock` and the review through `BatchReviewBlock` (shared kind
  components); `PronunciationCard` is the runner's own extra. The three runs stream inline with
  `LiveRunDisplay` (the wait is the whole screen), via `onConversationCreated` + `useLiveRunHandle`.
- Metered by `education.spoken_practice` (pronunciation reuses it): `useEntitlementGuard` +
  `EntitlementMeter` before the cap. Limits and enforcement: `billing.capability*` (header of
  `features/entitlements/registry.ts`).
- Surface `matrx-user/education-practice-oral`: `setupSnapshot.ts` keeps `getScope` synchronous;
  two `ask` write targets (`practice_mode`, composite `practice_setup`, validated in `setupWrites.ts`
  against the result of the patch) register only while `phase === "idle"`. Starting a session is NOT
  agent-writable (it spends a run, opens the mic and meters); `session_prompts` is the answer key
  (`autoContext: false`).
- The setup form opts into `matrx-touch-targets`.
- Runs reuse sibling source-feature tags (`education-assessment`, `education-assessment-grade`,
  `education-tutor`); add `education-spoken-practice*` when `features/agents` is next touched.

Open: debate prompts are designed up front; a per-turn live rebuttal agent is a possible follow-up.

Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/education/STATE.md — read it before touching this feature in ANY repo.
