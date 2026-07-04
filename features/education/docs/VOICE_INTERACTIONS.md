# Voice Interactions — the platform behind "speak your answer"

> 2026-07-04. The single-card "Test me" voice quiz is the FIRST of many voice
> interaction surfaces (debate practice, role-play classes, oral exams). They are
> all the same three moves — **capture spoken audio → grade it against a rubric →
> respond** — so they share one hardened engine. This doc is the map so the next
> ones are cheap and consistent.

## The layers (bottom-up, all reusable)

1. **Capture core** — `features/flashcards/fast-fire/audio/continuousCapture.ts`.
   Web-Audio PCM → sample-accurate WAV clips over one warm mic stream. `startContinuousCapture`
   / `startCardClip` / `stopCardClip` / `stopContinuousCapture` / `subscribeLevel`.
2. **Grading core** — `features/flashcards/fast-fire/agents/grading-core.ts`.
   Slice-DECOUPLED: `uploadResponseClip` (durable file_id) + `runSpokenGrader`
   (launch grader agent → attach audio → execute → wait → `coerceSpokenGrade` →
   return a `SpokenGrade`). The no-audio guard lives here. **Every voice surface
   grades through this** — it is the crown jewel, kept in one place.
3. **Answer primitive** — `agents/gradeSpokenAnswer.thunk.ts`. `upload → grade →
   record on the study spine → RETURN the grade` (awaited). Takes an optional
   `itemType`/`itemId` so any prompt (a card, a debate turn, a role-play beat) can
   be graded and counted toward mastery.
4. **Experience** — `voice-test/SingleCardVoiceTest.tsx`. The self-contained state
   machine + UI: Start → Preparing → ask (spoken if cached) → timed answer
   (countdown ring + mic glow) → grade → Go again. Owns its mic lifecycle + timer.
5. **Entry** — `voice-test/VoiceTestButton.tsx` (+ `CardVoiceTestDialog`). One
   import, give it a card. **This is what goes on any surface.**

## Built
- Single-card "Test me" on the classic study surface + the adaptive Review-due
  surface (via `StudyDeck`'s `renderCardExtra`, pulling each card's cached
  spoken-front so the question is asked aloud). Records a `study_attempt`
  (`method='voice_test'`) toward mastery.

## Next — fan out the button (cheap; it's a drop-in)
- Set-detail card grid: a "Test me" per card.
- **Chat flashcard blocks** (`components/mardown-display/blocks/flashcards/`): the
  in-chat card renderer — add `<VoiceTestButton card={…} />`.
- **Window panels**: render `SingleCardVoiceTest` directly in a panel, or register
  a `cardVoiceTest` overlay so it's dispatchable from anywhere without a button.
- A "quiz me on this whole set, one at a time" loop = `VoiceTestButton` walking a
  card list (a thin wrapper over the same component).

## Then — the bigger voice surfaces (same engine)
- **Debate practice**: two-sided timed turns; each turn is a `gradeSpokenAnswer`
  with a debate rubric (persuasiveness, evidence, rebuttal). The capture core +
  grading core are unchanged — only the prompt/rubric + a turn-based state machine
  are new.
- **Role-play classes** (student-teaches-student with an AI): a multi-party session
  where each spoken turn is captured + optionally graded/coached. Reuses capture +
  grading; adds role/turn orchestration + a live AI participant (the agent stream).
- **Oral exams** (VISION §6 "grade anything"): the same, with a formal rubric and
  the full-session review (`fc_review_batch`-style professor pass).

The invariant: **new voice surface = new prompt/rubric + new orchestration UI, NOT
a new capture or grading path.** If you find yourself re-implementing audio slicing
or grade parsing, stop — extend the core instead.

## Grading agent + voice (for tuning)
- Grader agent: the FastFire grader in `fast-fire/config.ts` (`FC_AGENTS`), called
  variables-only (`front`/`back`/`seconds_allowed`/`rubric?`). Fix output in the
  agent DB (`agent_author`), never in code.
- Spoken questions (TTS): agent `04f69dff` ("Generate custom speech",
  `gemini-3.1-flash-tts-preview`, voice = `settings.tts_voice`). The text + style
  are `fast-fire/spoken-front/variations.ts`.

## Change log
- 2026-07-04 — Created with the single-card "Test me" landing. Layered the reusable
  capture/grading/answer/experience/entry stack so debate + role-play are additive.
</content>
