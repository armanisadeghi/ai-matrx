# Education Hub — What to Build Next (roadmap)

> 2026-07-01. Now that the **foundation is real** — canonical flashcards
> (`fc_*`), the mode-agnostic **study spine** (`study_session`/`study_attempt`/
> `item_mastery`), FastFire (voice-graded, timed), sessions history, study
> progress, and the file/agent/TTS primitives — most of the vision's remaining
> areas are *cheap composition*, not new foundations. This maps
> `VISION-education-hub.md` (17 areas) to **built / cheap-next / later**, with a
> recommended order. Every "cheap-next" reuses what exists.

## Built ✅
- §1 Flashcards (fc_set/card/detail, browse/detail/edit/study).
- §3 FastFire (PCM capture → WAV, grading, results, spoken fronts [pending live
  verify], "Next card").
- §6 AI grading (spoken; the spine's `response_kind` already supports
  written/typed/handwritten/selected — just needs writers).
- §16 Progress analytics (mastery distribution, accuracy, due, streak).
- Sessions CRUD + history. Study spine + FSRS (`lib/srs/fsrs.ts`) + `listDue`.

## Cheap-next (highest value per effort — recommended order)

1. **Adaptive "Review due" mode (§2 Learn, §16 "what to study next") — the
   north-star, MEDIUM.** `studyService.listDue('fc_card')` already returns the due
   `item_mastery` rows. Add `fcService.getCardsByIds(ids)` + a study surface that
   studies an ARBITRARY cross-set card list (today `useFlashcardStudy` is
   set-scoped) → a "Review due (N)" entry on the flashcards home + progress page.
   This is the single most differentiating cheap win — surfaces the exact cards a
   learner needs, across all sets, on the FSRS schedule.

2. **Weak-areas drill (§16) — SMALL.** Extend `StudyProgress` to list the
   struggling cards (`struggle_flag` / low `mastery_score`) with a "Drill these"
   action (reuses #1's arbitrary-card study surface). "Smallest subset causing the
   most errors."

3. **Enhance / expand (the set-detail placeholder) (§1, §11) — MEDIUM, AI.** Wire
   the "Enhance" button to the `fc_enrich_card` / `fc_expand_card` agents (specs in
   `AGENT_SPECS.md`) → generate rich `fc_detail` (helper/example/mnemonic) +
   expand-on-struggle sub-cards (`fc_card→fc_card` `expands_into` edges). The
   "I'm confused" pre-generated helper AUDIO reuses the exact spoken-fronts TTS
   pipeline (once that's live-verified).

4. **Learn / Test / Match / Write modes (§2) — MEDIUM each, all on the spine.**
   Each is a new study surface writing `study_attempt` with a different `method`
   (`learn`/`test`/`match`/`write`). Test/Quiz uses the `fc_make_quiz_items` agent
   for distractors. Match is a timed drag-drop (highest engagement per the vision).
   The spine + mastery + FSRS are already there — these are UI + a method string.

5. **Confidence-based rating (§2) — SMALL.** A pre-flip confidence tap on the
   classic study surface, fed into the FSRS weighting (the attempt already carries
   a score).

## Later (own content or bigger lifts)
- §4 AI Tutor (generalize `fc_help_live` — context-aware help everywhere, RAG-grounded).
- §8 Practice tests / exam prep (own content + spine, `method='practice_test'`).
- §5 Multi-format ingestion → cards (RAG + docproc lineage edges already modeled).
- §7 Notes ↔ study loop (reuse `features/notes`).
- §9 Audio study (reuse `features/podcasts`; audio-review quiz writes the spine).
- §10 Mind maps / knowledge graphs, §12 planner (reuse scheduling + `study_goal`),
  §13 gamification, §14 collaboration, §17 STEM — deferred per the vision.

## Cross-cutting, do alongside
- **Verify spoken-front TTS live** (see FASTFIRE_SPOKEN_FRONTS_SPEC.md) + the iOS
  autoplay fix (play via the Start-resumed AudioContext).
- **Polished FastFire UI** via `ui-bakeoff` once UX requirements are locked.
- The `getCardsByIds` + arbitrary-card study surface from #1 is the shared
  primitive that unlocks #1, #2, and the adaptive engine — build it once, well.

## Change log
- 2026-07-01 — Created after the foundation shipped. #1 (adaptive Review-due) is
  the recommended next build: highest differentiation, mostly composition.
</content>
