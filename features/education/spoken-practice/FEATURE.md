# Spoken Practice — FEATURE.md

**Route:** `/education/practice-oral` (flat tool route; deep-link a mode via `?mode=oral_exam|interview_prep|debate`)
**Status:** Live. Tool registry entry `practice-oral` (`features/education/data/tools.ts`), admin map at `/education/admin`.
**Vision:** VISION-education-hub.md "Features Coming Soon" — Oral exam / viva voce, Interview prep, Debate & argumentation — now shipped. Also §4 (Tutor grounding) + §6 (AI Grading — spoken).

The signature differentiator: **real-time spoken grading of open-ended answers in three practice modes.** The student answers OUT LOUD; an AI examiner / interviewer / debate opponent poses grounded prompts and grades every spoken answer on meaning, then closes with an examiner's batch review.

---

## The one rule: reuse the voice + grading + spine stack, never fork it

This feature is almost entirely composition. It adds a state machine and one new agent; everything hard is reused (the VOICE_INTERACTIONS invariant: "new voice surface = new prompt/rubric + new orchestration UI, NOT a new capture or grading path").

| Concern | Reused primitive | Location |
|---|---|---|
| Mic capture (one warm mic, sample-accurate clips) | `continuousCapture` singleton (`startContinuousCapture` / `startCardClip` / `stopCardClip` / `stopContinuousCapture`) | `features/flashcards/fast-fire/audio/continuousCapture.ts` |
| Per-answer grade + spine record | `gradeSpokenAnswer` thunk (upload → grade → `recordAttempt`) → `SpokenGrade` | `features/flashcards/fast-fire/agents/gradeSpokenAnswer.thunk.ts` |
| The grader agent (crown jewel) | `FC_AGENTS.gradeSpoken` (`fc_grade_spoken`) | `features/flashcards/data/agents.ts` |
| End-of-session "professor" review | `reviewSession` lane (writes `study_session.session_review`) | `features/education/tutor/lanes/reviewSession.ts` |
| The study spine | `studyService.createSession` / `updateSession` (+ `recordAttempt` via the grader) | `features/education/study/service/studyService.ts` |
| Read prompts aloud | `useCartesiaSpeaker` | `features/tts/hooks/useCartesiaSpeaker.ts` |
| Trust rendering | `ConfidenceBadge`, `SourceCitations`, `GradeVerdict` | `features/education/trust/` |
| Metering (pre-visible limit) | `useEntitlementGuard` + `EntitlementMeter` (`education.spoken_practice`) | `features/entitlements/` |

**The ONLY new agent:** `Education: Spoken Practice Session Designer` — `e1d9c1f7-c523-4e7a-8090-a74495cdc58f` (gemini-3.5-flash). See `agents.ts`.

---

## The three modes

One shared loop; the mode changes the persona, the rubric, and (for debate) whether prompts counter-attack. All configured in `constants.ts#MODE_CONFIG`.

- **`oral_exam`** — an examiner conducts a viva on the subject; escalating-depth questions. Graded on accuracy · articulation · completeness. Grounds in the student's own deck (the headline capability).
- **`interview_prep`** — an interviewer for the given interview type (college / med-school / job); behavioral + role questions. Graded on content substance + delivery.
- **`debate`** — the student is assigned a position; later prompts are pointed AI counter-challenges that steelman the other side. Graded on argument structure · evidence · reasoning. (The debate "counter-argument" is genuine: prompts escalate into rebuttals; the grader's meaning-based feedback responds to what the student actually said.)

---

## Data model — NO new table (session-shaped content model)

Everything rides the shared study spine. `mode` and `method` are free-form on the spine (no DB check constraint — verified live), so extending the vocabulary is a value, not a migration.

- **The session** = one `education.study_session`, `mode` = the practice mode. `settings.prompts[]` jsonb holds the full designed plan (prompt, reference answer, rubric, focus area, confidence, trust) — the durable "session-shaped content model". `source_kind` = `set` (deck) or `topic`; `session_review` = the examiner summary; `aggregate_score` = the rollup; `session_audio_file_id` = the full-session clip.
- **Each answer** = one `education.study_attempt` written by `gradeSpokenAnswer` → `study_record_attempt` RPC: `item_type` = `spoken_prompt`, `item_id` = a client-minted uuid per prompt (the spine's `item_id` is polymorphic — no FK), `method` = the mode, `response_kind` = `spoken`, plus transcript / audio file / score / result / graded_by. Mastery advances via FSRS like any other mode.

Why not `assessment`/`assessment_item`? The prompts are ephemeral (AI-generated per session, never re-surfaced), so they belong in the session's own jsonb, not a shared durable questions table — and this keeps the feature self-contained (no cross-feature coupling, no `assessment_kind` migration).

---

## Flow (`useSpokenPractice`)

`generating` → warm mic → create session → **for each prompt:** `asking` (TTS reads intro+prompt) → `answering` (mic clip; press **Done**, no short timer — long-form answers; `ANSWER_MAX_SECONDS` runaway guard only) → `grading` (`gradeSpokenAnswer`) → `result` (verdict + trust + reference) → next → `reviewing` (`reviewSession`) → `summary`.

Local-state orchestrator (like `AudioReviewSession` / `SingleCardVoiceTest`) — NOT a parallel Redux slice (the fast-fire slice is drill-specific). Audio never enters state (only `file_id`s + grades). Grades reach the UI only after the agent resolves.

---

## TRUST mandate compliance

- Every prompt carries a `TrustEnvelope` (`data/grounding.ts#promptTrust`): the designer agent emits an honest per-prompt `confidence` (`grounded` / `inferred` / `not_in_material`); we attach a `SourceCitation` to the source we actually handed it. Rendered by `ConfidenceBadge` + `SourceCitations` on each result.
- Grading is grade-on-meaning: `SpokenGrade.verdict` IS a `GradeVerdict` (shared core); feedback is `verdict.explanation`, never string-matching.
- Metered with a pre-visible limit: `education.spoken_practice` (`enforced:false` today), gated by `useEntitlementGuard`, `EntitlementMeter` shown before the cap.

---

## Files

```
features/education/spoken-practice/
  agents.ts                         SPOKEN_PRACTICE_AGENTS (designer id + reused grader) + SPOKEN_PROMPT_ITEM_TYPE
  types.ts                          modes, PracticePlan/Prompt, PracticeConfig/Source, PromptResult, RunnerPhase
  constants.ts                      MODE_CONFIG (per-mode copy/icons/rubric focus) + tunables
  data/generateSession.ts           the designer-agent run thunk + coercePracticePlan
  data/grounding.ts                 buildDeckSource / buildTopicSource / promptTrust
  hooks/useSpokenPractice.ts        the orchestrator (phase machine; composes capture + grader + review + spine)
  components/
    SpokenPracticeClient.tsx        code-split boundary (ssr:false)
    SpokenPracticeSurface.tsx       home → setup → runner → summary router
    SpokenPracticeHome.tsx          mode picker (list-first)
    PracticeSetup.tsx               config form + entitlement guard/meter
    PracticeRunner.tsx              the live loop UI
    PracticeSummary.tsx             scorecard + examiner review
```

Route: `app/(core)/education/practice-oral/page.tsx` (server shell → client island).
Shared edits: `features/entitlements/registry.ts` (+`education.spoken_practice`), `features/files/utils/folder-conventions.ts` (+`SYSTEM_SPOKEN_PRACTICE_*`), `features/education/data/tools.ts` (+`practice-oral`), `app/(core)/education/admin/page.tsx` (route + component).

---

## Open / future

- **Real-time debate rebuttal:** today debate prompts are designed up-front (the grader's meaning feedback responds to the actual answer). A follow-up could add a per-turn rebuttal agent that reads the student's transcript and generates the next counter-challenge live.
- **No dedicated `SourceFeature`:** the designer run reuses `education-assessment` (adding a new value lives in the frozen `features/agents` module). Add `education-spoken-practice` when that module is next touched.
- **Enforcement:** `education.spoken_practice` ships `enforced:false`; flip only after a `billing.capability_limit` row + the aidream re-check exist and the number is approved.

## Change Log
- **2026-07-14** — Shipped. Three modes (oral exam / interview / debate), new session-designer agent (live-verified oral + debate on gemini-3.5-flash), full reuse of the FastFire capture + spoken grader + study spine + tutor review lane. No new table; `study_attempt` method vocabulary extended (`oral_exam`/`interview_prep`/`debate`) with no DB migration (method is free-form).
