# Education AI lanes — the mandate index

**Agents resolve via MANDATES now.** No education/flashcards code names an agent id: every AI
lane names a mandate key, and the DATABASE decides which agent fulfils it (system default → org
binding → user binding). **Inspect or swap the live agent** behind any lane at
`/agents/mandates` (user bindings) or `/administration/agents/mandates` (system pins). Agent
definitions, prompts, schemas and variable shapes live on the DB agents themselves, never in
this repo.

The pre-mandate raw agent-export dump that used to live in this file (2026-06-30, 630 lines of
UUIDs and prompt text) is deleted per WP2 — it documented ids code no longer contains.

## Mandate keys per feature (constants in each feature's `mandates.ts`)

| Feature module | Constant | Keys |
|---|---|---|
| `features/flashcards/data/mandates.ts` | `FC_MANDATES` | `flashcards.generate_cards`, `flashcards.generate_from_source`, `flashcards.enrich_card`, `flashcards.expand_card`, `flashcards.grade_spoken`, `flashcards.grade_typed_answer`, `flashcards.help_live`, `flashcards.review_batch`, `flashcards.micro_coach`, `flashcards.make_quiz_items`, `flashcards.verify_against_source` |
| `features/flashcards/fast-fire/spoken-front/generateSpokenFront.thunk.ts` | `SPOKEN_FRONT_TTS_MANDATE` | `flashcards.spoken_front_tts` |
| `features/flashcards/components/study/VoiceTutorPanel.tsx` | `EDUCATION_VOICE_TUTOR_MANDATE` | `education.voice_tutor` |
| `features/education/spoken-practice/mandates.ts` | `SPOKEN_PRACTICE_MANDATES` | `education.spoken_practice_design`, `education.spoken_practice_design_language`, `education.spoken_practice_grade`, `education.spoken_practice_grade_pronunciation`, `education.spoken_practice_review` |
| `features/education/assessment/data/mandates.ts` | `ASSESSMENT_MANDATES` | `education.quiz_generate`, `education.quiz_generate_from_source`, `education.quiz_deepen_item`, `education.grade_handwritten` (+ reuses the three flashcards grading/verify keys) |
| `features/education/study/planner/mandates.ts` | `STUDY_MANDATES` | `education.plan_generate`, `education.analytics_narrate` |
| `features/education/memory/mandates.ts` | `EDU_MEMORY_MANDATES` | `education.memory_generate`, `education.memory_hint` |
| `features/education/convert/mandates.ts` | `CONVERT_MANDATES` | `education.summarize` (+ deck rides `flashcards.generate_from_source` — D-WP2-3) |
| `features/education/tutor/mandates.ts` | `EDU_TUTOR_MANDATES` | `education.tutor_message` |
| `features/education/notes/mandates.ts` | `NOTES_MANDATES` | `education.notes_generate` |
| `features/education/media/mindmap/mandates.ts` | `EDU_MEDIA_MANDATES` | `education.mindmap_generate` |

## Rules

- 🚨 A raw agent UUID in code is a platform-law violation (root `CLAUDE.md`;
  `features/agents/mandates/FEATURE.md`). An unresolved mandate REFUSES — never a fallback id,
  never a hardcoded prompt.
- Need a NEW AI step? Declare the mandate in aidream `services/mandates/client_mandates.py`,
  then add its key to the owning feature's `mandates.ts`.
- Variable shapes and output contracts per lane: `AGENT_SPECS.md` (contracts) and each feature's
  `FEATURE.md`; the live definition is always the DB agent behind the binding.

*Slimmed 2026-08-18 (WP2 mandate migration; formerly a raw agent-export dump).*
