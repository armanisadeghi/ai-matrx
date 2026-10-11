# Voice interactions — one engine behind "speak your answer"

Every voice surface (single-card Test me, FastFire, spoken practice) is the same three moves:
capture audio, grade it against a rubric, respond. They share one engine.

**The invariant: a new voice surface is a new prompt/rubric plus new orchestration UI, never a
new capture or grading path.** Re-implementing audio slicing or grade parsing means extend the
core instead.

## The layers (all under `features/flashcards/fast-fire/`)

1. Capture: `audio/continuousCapture.ts` (PCM to WAV clips over one warm mic stream).
2. Grading: `agents/grading-core.ts`. `runSpokenGrader` is the only grader call; it sends
   `front`, `back`, `seconds_allowed`, optional `rubric` and the offered value `answer_audio`
   (`messageParts` is not a spoken-grading input). Fix output shape in the bound agent's DB
   definition, never in code.
3. Answer primitive: `agents/gradeSpokenAnswer.thunk.ts` (upload, grade, record on the study
   spine, return the grade). Takes an optional `itemType`/`itemId` so any prompt counts toward
   mastery.
4. Experience and entry: `voice-test/SingleCardVoiceTest.tsx`, dropped onto any surface via
   `voice-test/VoiceTestButton.tsx`.

Grader mandate: `flashcards.grade_spoken`. Spoken questions (TTS) read their text and style
from `spoken-front/variations.ts`. Spoken practice has its own mode-aware mandates (see
`../spoken-practice/FEATURE.md`).

## Consumers

Study surfaces pass `voiceTestForCard` to `StudyDeck`; the chat flashcard block renders
`VoiceTestButton` per card. Not built: a per-card Test me in the set-detail grid, a window
panel/overlay entry, a whole-set quiz-me loop.
