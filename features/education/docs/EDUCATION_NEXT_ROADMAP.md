# Education Hub — What to Build Next (roadmap)

> 2026-07-05. FastFire's audio capture + AI grading is **owner-verified live and
> very good** — tested across multiple languages, scoring quality confirmed
> solid. With the study spine, FastFire, sessions history, the gamified
> scorecard, and manual score override all real, the next push is a
> **competitive parity push against Quizlet/Anki/Knowt/StudyFetch**, driven by
> a full gap audit (see `ARMAN_VISION.md` for the aspirational feature set —
> several of its "✅ Live" claims, e.g. SM-2/FSRS and the RAG-grounded tutor,
> were found to be **not actually wired** during the audit; this doc is the
> corrected, code-verified plan). Full plan: see the "Flashcards Competitive
> Parity Push" plan (9 phases, tracked via the todo list in that work session).

## Built ✅ (verified 2026-07-05, updated as the Parity Push lands)
- §1 Flashcards (fc_set/card/detail, browse/detail/edit/study).
- §3 FastFire (PCM capture → WAV, grading, results, spoken fronts) —
  **audio + grading verified live, including multi-language spoken grading.**
- §6 AI grading (spoken; the spine's `response_kind` already supports
  written/typed/handwritten/selected — just needs writers).
- §16 Progress analytics — now includes cross-session trends (Phase 6):
  accuracy-over-time, weekly time studied, per-topic mastery breakdown
  (`StudyTrends`, embedded in `StudyProgress`).
- Sessions CRUD + history, gamified scorecard (`SessionScorecard`,
  `ScoreRing`), manual score override with audit trail (`is_manually_edited`
  + replay).
- Adaptive "Review due" mode + `getCardsByIds` cross-set study primitive.
- **Real FSRS scheduler (Phase 2)** — `lib/srs/fsrs.ts` now the live
  scheduler (`studyService.recordAttempt`/`overrideAttempt` compute
  `nextState` in TS; the RPCs are dumb atomic writers). `mastery_score`
  display is real decaying `retrievability()`, not a box index.
- **Weak-area drill + daily streak (Phase 3)** — worst-first cross-set drill
  at `/education/flashcards/weak-areas`; `education.study_streak` bumped on
  every session, surfaced as a flame counter + "streak ends today" banner
  (in-app only, no push/email).
- **Generalized AI tutor + batch reviewer (Phase 4)** — `fc_help_live` and
  `fc_review_batch` moved out of FastFire-only into
  `features/flashcards/data/tutor/`, with real session/mastery context and
  an "Ask AI" affordance on every study surface via the shared `StudyDeck`.
  Stretch: per-card micro-coaching (`fc_micro_coach`) toasts after grading.
- **Table-stakes UI (Phase 1A)** — CSV/Quizlet import
  (`/education/flashcards/new/import`), folders/tags on `EDGE_ROLE.theme`,
  share-visibility toggle, rich card editor (markdown/LaTeX preview +
  file-handler media attach).
- **RAG-sourced generation with curation UI (Phase 5)** —
  `/education/flashcards/new/from-source`: pick a RAG-indexed document,
  check off which chunks to include, then `fc_generate_from_source`; lineage
  (`processed_document_id`/`chunk_id`/`page`) persisted on each card's
  `source` field.
- **Cross-session analytics + real planner (Phase 6)** — `StudyTrends`
  (above) plus a real `/education/planner`: full CRUD on `study_goal`
  (`StudyPlanner`), goals heuristic-ranked by urgency + struggle count (v1,
  no auto-replan algorithm).
- **Podcast-from-deck (Phase 7)** — a "Generate audio overview" action on set
  detail (`AudioOverviewSection`) feeds the deck (serialized to markdown) into
  the existing generic podcast generator (audio-only run, no images/video),
  and persists the durable `file_id` to the previously-unused
  `fc_set.audio_overview_file_id`, played back via the shared `SessionAudio`.
- **Learn / Test / Match / Write study modes (Phase 1B)** — four new study
  surfaces on the same spine, reachable from a "Study ▾" dropdown on set
  detail: **Learn** (adaptive within-session reshuffle toward weak cards,
  reusing the shared `StudyDeck` verbatim), **Test** (multiple-choice with
  in-set distractors + an `fc_make_quiz_items` AI fallback for small sets),
  **Match** (timed click-to-pair board, 8 cards/round), **Write** (typed
  recall auto-graded via normalized Levenshtein similarity, user
  confirms/overrides). Each writes `study_attempt` with its own `method`.

## Still not live (remaining scope)
- None from the Competitive Parity Push — all 9 phases (1A, 1B, 2–7) shipped
  2026-07-05.

Full evidence-cited detail lives in the three parallel subagent audits run
2026-07-04 (flashcards CRUD/modes/import/sharing/FastFire/mastery; study
spine/sessions/progress/gamification/streaks; AI tutor/RAG/ingestion/audio/
STEM/notes) — see the chat history for the complete file-path-cited reports
if this summary needs re-deriving.

## The Competitive Parity Push (8 confirmed workstreams + split) — status

Recommended order (Phase 0 = this doc update):

1. ✅ **Phase 1A — Table-stakes UI (import/export, folders/tags, share
   toggle, rich editor) — CANNOT LOSE ON THIS, not hard to win.** Shipped:
   CSV/Quizlet paste import + export, folders/tags on `EDGE_ROLE.theme`, a
   share-visibility toggle on set detail/edit, and a rich editor
   (markdown/LaTeX preview + image/audio attach via `fileHandler`).

2. ✅ **Phase 1B — Learn / Test / Match / Write study modes — SPLIT OFF FROM
   1A, TRACKED SEPARATELY SO IT IS NOT LOST.** Shipped: four new study
   surfaces on the existing spine (`method='learn'|'test'|'match'|'write'`),
   reachable from a "Study ▾" dropdown on set detail. Learn reuses the shared
   `StudyDeck` (generalized `useFlashcardStudy` with a `reshuffleWeighted`
   working-queue mode). Test uses free in-set distractors first, falling back
   to `fc_make_quiz_items` only when a set is too small to have enough
   siblings. Match is click-to-pair (not drag-and-drop — identical
   interaction on desktop/mobile, no custom touch plumbing), capped at 8
   cards/round; mismatches are gameplay, not graded attempts. Write grades
   typed recall via normalized Levenshtein similarity
   (`features/flashcards/utils/textSimilarity.ts`) with a user
   confirm/override step before it's recorded.

3. ✅ **Phase 2 — Real FSRS scheduler.** Shipped: `lib/srs/fsrs.ts` is now
   the live scheduler, called from `studyService.ts`; the RPCs
   (`study_record_attempt`/`study_override_attempt`) are dumb atomic writers
   of whatever FSRS state they're given. `mastery_score` display is real
   `retrievability()`, not `(box-1)/5`.

4. ✅ **Phase 3 — Weak-area drill + in-app daily streak.** Shipped:
   worst-first query (`struggle_flag` / lowest retrievability) reusing the
   existing `getCardsByIds` + arbitrary-card `StudyDeck` path
   (`/education/flashcards/weak-areas`). `education.study_streak` bumped on
   session completion, shown as an in-app flame counter + "streak ends
   today" banner. In-app only — no push/email infra.

5. ✅ **Phase 4 — Generalize the AI tutor + batch reviewer beyond FastFire.**
   Shipped: `fc_help_live` relocated to `features/flashcards/data/tutor/`
   with real session/mastery context populated, "Ask AI" affordance on every
   study surface via the shared `StudyDeck`. `fc_review_batch` runs at the
   end of any completed session. Stretch shipped too: cheap/fast-model
   per-card micro-coaching (`fc_micro_coach`) toast right after grading.

6. ✅ **Phase 5 — RAG-sourced generation with a curation UI.** Shipped:
   `/education/flashcards/new/from-source` — pick a RAG-indexed doc, check
   off which retrieved chunks go in, then `fc_generate_from_source`. Lineage
   (`processed_document_id`/`chunk_id`/`page`) persists on each card.

7. ✅ **Phase 6 — Cross-session analytics + planner.** Shipped:
   accuracy-over-time, weekly time studied, per-topic mastery breakdown
   (`StudyTrends`, embedded in `StudyProgress`). Real CRUD on `study_goal`
   (`StudyPlanner`) replacing the `/education/planner` placeholder — v1
   heuristic ranking (urgency + struggle count), no auto-replan algorithm.

8. ✅ **Phase 7 — Podcast-from-deck.** Shipped: "Generate audio overview" on
   `SetDetailView.tsx` (`AudioOverviewSection`), calling the existing generic
   podcast generator (`usePodcastRun`) with the deck serialized to markdown
   (`podcastOverview.ts`) and `max_images: 0, max_videos: 0` (audio-only).
   Persists the durable `file_id` (from `audio_stream_end`, extended into
   `PodcastRunState.audioFileId`) to `fc_set.audio_overview_file_id`; playback
   via the shared `SessionAudio`.

## Later (still deferred, no change from prior pass)
- §10 Mind maps / knowledge graphs, §13 broader gamification (leaderboards/
  XP/achievements), §14 collaboration/class tools, §17 deeper STEM (step-by-
  step math grading), LMS/FERPA/institutional — deferred per the vision,
  not part of this push.

## Cross-cutting, do alongside
- Keep `features/education/FEATURE.md` and this doc's Change Log current as
  each phase lands — stale docs here have already caused one full
  vision-vs-reality drift (see "Corrected" section above); don't repeat it.
- Mobile-first pass is still owed (owner-flagged priority, not yet done) —
  fold into whichever phase touches a given surface's UI, don't treat as a
  separate 10th phase.

## Change log
- 2026-07-05 (final push) — Phase 1B landed, completing all 9 phases of the
  Competitive Parity Push: Learn (adaptive reshuffle via a generalized
  `useFlashcardStudy`), Test (MC quiz, in-set distractors + AI fallback),
  Match (timed click-to-pair game), and Write (typed recall, Levenshtein
  auto-grade) — each a new `/education/flashcards/[setId]/<mode>` route off
  a "Study ▾" dropdown on set detail, writing the same study spine with its
  own `method`.
- 2026-07-05 (later same day) — Phases 1A–7 of the Competitive Parity Push
  landed: table-stakes import/folders/share/rich-editor, real FSRS scheduler,
  weak-area drill + daily streak, generalized AI tutor/reviewer +
  micro-coaching, RAG-sourced generation with chunk curation, cross-session
  analytics + a real `study_goal` planner, and podcast-from-deck audio
  overviews. Remaining: Phase 1B (Learn/Test/Match/Write modes) — the only
  workstream left, deliberately tracked so it isn't dropped.
- 2026-07-05 — Rewritten after the 2026-07-04 competitive gap audit (3
  parallel subagent deep-dives) found several vision-doc "✅ Live" claims
  were not actually wired (FSRS, RAG-grounded tutor, multi-format ingestion).
  Replaced the prior cheap-next list with the 8-workstream Competitive
  Parity Push (+ split-off Phase 1B) approved by the owner. FastFire audio +
  multi-language grading confirmed verified-live by direct owner testing.
- 2026-07-01 — Created after the foundation shipped. Adaptive Review-due
  shipped as recommended; superseded by the plan above.
