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

## Built ✅ (verified 2026-07-05)
- §1 Flashcards (fc_set/card/detail, browse/detail/edit/study).
- §3 FastFire (PCM capture → WAV, grading, results, spoken fronts) —
  **audio + grading verified live, including multi-language spoken grading.**
- §6 AI grading (spoken; the spine's `response_kind` already supports
  written/typed/handwritten/selected — just needs writers).
- §16 Progress analytics (mastery distribution, accuracy, due, streak) — basic
  version; cross-session trends still missing (see Phase 6 below).
- Sessions CRUD + history, gamified scorecard (`SessionScorecard`,
  `ScoreRing`), manual score override with audit trail (`is_manually_edited`
  + replay).
- Adaptive "Review due" mode + `getCardsByIds` cross-set study primitive.

## Corrected: what's actually NOT live (found by the 2026-07-04 gap audit)
- **Spaced repetition is NOT SM-2/FSRS today** — `study_record_attempt` runs a
  fixed 6-box Leitner scheduler in SQL. `lib/srs/fsrs.ts` is a complete, pure
  FSRS implementation that is **completely unused** (zero imports). See
  Phase 2 below — this is the single highest-leverage fix, the math is
  already written.
- **The AI tutor only exists as a one-shot, non-RAG, ephemeral text button
  inside FastFire** (`helpLive.thunk.ts`) — not present in classic/adaptive
  study, not persistent, not grounded in the learner's materials.
- **No content ingestion → cards path exists except typed topic.** PDF/notes/
  video/audio → flashcards is 100% vision; `fc_generate_from_source` is a
  fully-specced agent with **zero FE callers**.
- **No CSV/Quizlet import, no folders/tags, no share UI, no rich card editor**
  (plain `<Textarea>` today) — these are Quizlet/Anki table stakes, not
  differentiators, and losing on them is not acceptable.
- **No daily habit streak** — the only "streak" concepts today are in-session
  (consecutive correct answers) and per-card mastery streak; neither is
  "studied N days in a row."
- **No cross-session analytics, no planner** — `study_goal` table exists,
  zero code touches it; `/education/planner` is a coming-soon placeholder.
- **Podcast/debate audio generation is a completely separate product**
  (`features/podcasts/`) with zero connection to flashcard sets.

Full evidence-cited detail lives in the three parallel subagent audits run
2026-07-04 (flashcards CRUD/modes/import/sharing/FastFire/mastery; study
spine/sessions/progress/gamification/streaks; AI tutor/RAG/ingestion/audio/
STEM/notes) — see the chat history for the complete file-path-cited reports
if this summary needs re-deriving.

## Cheap-next — the Competitive Parity Push (8 confirmed workstreams + split)

Recommended order (Phase 0 = this doc update, already done by having this
section exist):

1. **Phase 1A — Table-stakes UI (import/export, folders/tags, share toggle,
   rich editor) — CANNOT LOSE ON THIS, not hard to win.** CSV/Quizlet paste
   import + export, folders/tags (extend `EDGE_ROLE.theme` on
   `platform.associations`, don't add a new table), a share-visibility toggle
   on set detail/edit, and a real rich editor (markdown/LaTeX preview +
   image/audio attach via `fileHandler`) replacing the plain textareas in
   `EditSetView.tsx`. Runs in parallel with Phase 2 (independent).

2. **Phase 1B — Learn / Test / Match / Write study modes — SPLIT OFF FROM
   1A, TRACKED SEPARATELY SO IT IS NOT LOST.** Each is a new study surface on
   the existing spine (`method='learn'|'test'|'match'|'write'`) — UI + a
   method string, no new foundation. Match (timed drag-drop) is the most
   UI-heavy and comes last within this phase. Scheduled after Phase 7 in the
   overall sequence, but do not let it silently disappear from planning.

3. **Phase 2 — Real FSRS scheduler.** Move the box-scheduler logic out of
   `study_record_attempt`'s SQL and into `lib/srs/fsrs.ts` (already written,
   unused) called from `studyService.ts`; the RPC becomes a dumb atomic
   writer of whatever FSRS state it's given. `study_override_attempt`'s
   replay logic moves to TS the same way. `mastery_score` becomes real
   `retrievability()`, not `(box-1)/5`.

4. **Phase 3 — Weak-area drill + in-app daily streak.** Worst-first query
   (`struggle_flag` / lowest retrievability) reusing the existing
   `getCardsByIds` + arbitrary-card `StudyDeck` path. Daily streak: new
   `education.study_streak` table (`current_streak`, `longest_streak`,
   `last_active_date`), bumped on session completion, shown as an in-app
   flame counter + "streak ends today" banner. **In-app only — no push/email
   infra this phase** (explicit scope decision).

5. **Phase 4 — Generalize the AI tutor + batch reviewer beyond FastFire.**
   Move `fc_help_live` out of the FastFire-only lane, actually populate its
   context fields (today stubbed to empty arrays), add an "Ask AI" affordance
   to classic + adaptive study. Generalize `fc_review_batch` (the "professor"
   reviewer) to run at the end of any completed session, not just FastFire.
   Stretch: cheap/fast-model per-card micro-coaching tips right after
   grading, not just end-of-session.

6. **Phase 5 — RAG-sourced generation with a curation UI.** The real blocker
   isn't the agent (`fc_generate_from_source` is already specced/registered)
   — it's giving the user a checklist to pick which retrieved
   chunks/sections go into the deck, rather than blindly feeding a whole
   document. Build that picker, then wire the existing agent.

7. **Phase 6 — Cross-session analytics + planner.** Accuracy-over-time,
   weekly time studied, per-topic mastery breakdown on `StudyProgress`. Real
   CRUD on `study_goal` replacing the `/education/planner` placeholder (v1:
   heuristic ranking, no auto-replan algorithm yet).

8. **Phase 7 — Podcast-from-deck.** New `flashcard_set` source resolver on
   the existing podcast generator (`features/podcasts/generator/`), writing
   to the already-existing-but-unused `fc_set.audio_overview_file_id`.

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
- 2026-07-05 — Rewritten after the 2026-07-04 competitive gap audit (3
  parallel subagent deep-dives) found several vision-doc "✅ Live" claims
  were not actually wired (FSRS, RAG-grounded tutor, multi-format ingestion).
  Replaced the prior cheap-next list with the 8-workstream Competitive
  Parity Push (+ split-off Phase 1B) approved by the owner. FastFire audio +
  multi-language grading confirmed verified-live by direct owner testing.
- 2026-07-01 — Created after the foundation shipped. Adaptive Review-due
  shipped as recommended; superseded by the plan above.
