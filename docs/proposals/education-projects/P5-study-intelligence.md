# P5 — Study Intelligence (AI Planner + Analytics + Learning Gain)

> **Status date:** 2026-07-07 · **Wave 1, priority tier 2** · One agent, human in the loop.
> Read [`README.md`](./README.md) and the vision doc §12 (Planner), §16 (Progress Analytics).

## Objective

Make the already-populated study data actionable. Two halves: (1) finish the **Planner** — an AI
day-by-day schedule built around real exam dates, per-subject mastery, and available time, that
re-plans itself when performance changes; (2) build **Progress Analytics + Learning-Gain
reporting** — the mastery/weak-area/improvement dashboards and the exportable pre/post
learning-gain report that is the key unlock for institutional buyers. Plus the unified study
dashboard: "exactly what to study next, for how long, and why."

## Current state (verified — build on this)

- **Planner v1 is live but heuristic-only:**
  `features/education/study/components/StudyPlanner.tsx` (557 lines, the whole planner) with real
  `study_goal` CRUD via `studyService` (`createGoal`/`listGoals`/`updateGoal`/`deleteGoal`) and a
  client-side `priorityScore()` = urgency (days-until) + struggling×5. Goal targeting rides in
  `study_goal.metadata` (`{itemType:"fc_card", topic}`). Its own header says "no auto-replanning
  algorithm." No calendar, no generated schedule, no AI. (`study_goal` currently has 0 data rows —
  the CRUD is real, usage hasn't started.)
- **The analytics components exist but are wired to exactly one route:** `StudyProgress` +
  `StudyTrends` (accuracy-over-time, weekly time, per-topic mastery) render only at
  `app/(core)/education/flashcards/progress/page.tsx` with `itemType="fc_card"`. They are already
  mode-agnostic over the spine — they need a home, breadth, and depth, not a rewrite.
- **The data is real:** `study_session` 147 / `study_attempt` 190 / `item_mastery` 110 (full FSRS
  state) / `study_streak`. Every tool (P1–P4) records here, so your dashboards get richer as the
  wave lands.
- **`features/scheduling` exists and is unconsumed by education:** `sch_task` CRUD, cron
  validation + fire-preview endpoints, runs model, realtime hooks. A planner can register
  recurring study tasks / reminders against it.

## Scope

**IN**
- **AI Planner completion:** author a planner agent that takes exam dates (`study_goal`),
  per-topic mastery (`item_mastery` FSRS), and daily available time → produces a persisted
  day-by-day plan (plan + plan-day/block rows — new `education.` tables on the canonical
  pattern); a calendar/agenda view; **adaptive re-planning** triggered by new performance data
  (post-session/assessment deltas) — a plan is a living document; optional reminders via
  `features/scheduling`.
- **Progress analytics:** a real analytics surface — mastery % per card/deck/subject and
  platform-wide, weak-area identification ("smallest subset of content causing the most errors"),
  session + cumulative time, improvement curves, error-pattern analysis (author an analysis agent
  for the narrative layer over the numbers).
- **Learning-gain reporting:** read P1's baseline/post contract → clear pre/post delta displays +
  an **exportable report** (PDF/print view) for students/parents/institutions.
- **The unified study dashboard:** one surface answering "what should I study next, for how long,
  and why" — combining due FSRS reviews (`useDueReview` exists), weak areas, plan-of-the-day, and
  goal urgency. This becomes the education home's authenticated centerpiece.
- Generalize `StudyProgress`/`StudyTrends` beyond `fc_card` as other item types land.

**OUT**
- Raw data capture (tools/spine own it). The assessment engine (P1 — you read its deltas).
  Teacher/class-level analytics (Convergence C). Gamification displays (Wave 2 — but keep streak
  data visible where natural).

## Deliverables / Definition of done

1. Enter exam dates + availability → an AI-generated day-by-day plan persists and renders on a
   calendar/agenda view.
2. Tank a practice session → the plan visibly re-plans (and says why).
3. An analytics dashboard shows real numbers from live `study_session`/`study_attempt`/
   `item_mastery` — mastery, weak areas, time, trends — not per-deck-only.
4. A learning-gain report renders from P1's contract data and exports cleanly.
5. The unified dashboard tells a real user what to study next with a justification, and its
   recommendations link straight into the study surfaces.
6. Planner flipped from v1-heuristic to AI in `tools.ts` metadata; admin map + feature docs
   updated.

## Surfaces touched

- `app/(core)/education/planner/**` (complete), a new analytics/dashboard surface under
  `app/(core)/education/` (recommend `/education/progress` promoted out of flashcards, keeping a
  redirect-level entry from the flashcards page)
- `features/education/study/**` (extend `studyService`, `StudyPlanner`, `StudyProgress`,
  `StudyTrends`; new plan components)
- New `education.` plan tables + migrations; new planner/analysis agents
- `features/scheduling` (consume for reminders)

## Dependencies & contracts

- Study spine ✅ populated. `useDueReview` ✅. `features/scheduling` ✅.
- **Consumes:** P1's learning-gain contract (published day 1 — build the report against the
  contract shape immediately, with seed fixtures until P1's real rows land); P7/P8 signatures at
  share/export and AI-plan-generation call sites.
- Independent of P2/P3/P4 — no waiting.

## Build guidance

- Agents first (planner agent, error-pattern narrative agent) via agent_author +
  `AGENT_SPECS.md`; wire with the standard launch/streaming pattern.
- New tables via the `db-change` skill family; RLS via `iam.apply_rls` only.
- Dashboards: invoke the `dataviz` skill before writing any chart; semantic tokens, dark+light.
- Redux: extend existing education/study state; every selector memoized; ask before new
  slices.
- `type-safety`, `finalize-and-ship`.

## Verification

Use the real study history (147 sessions exist): generate a plan against real goals, verify plan
rows in SQL, force a re-plan with a real bad session, export the learning-gain report, and confirm
dashboard numbers reconcile with direct SQL aggregates (no invented numbers). Provide Arman exact
routes + what to check.
