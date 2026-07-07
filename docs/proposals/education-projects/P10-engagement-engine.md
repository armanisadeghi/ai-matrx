# P10 — ENGAGE: The Engagement Engine (SRS-Wired Game + Healthy Streaks)

> **Status date:** 2026-07-07 · **Wave 1, priority tier 4.**
> Read [`MASTER_PLAN.md`](./README.md) and the competitive doc §3 (E1, E2) + §2 rows for
> Quizlet/Kahoot/Duolingo. The market gap: Quizlet killed Gravity (its beloved game), Kahoot taxes
> live play at 10 players and induces leaderboard anxiety, **no game product has spaced
> repetition**, and Duolingo's guilt-algorithm made "healthy streaks" a differentiator. The wedge
> is a game where **play IS review** — SRS-scheduled items, mastery-scored, anxiety-safe.

## Objective

Build the engagement layer that drives daily active use *and* actually teaches: a real-time
multiplayer study game (filling the Gravity/Kahoot void) whose question queue is fed by the FSRS
engine so every round is real review; plus solo arcade play, and a **healthy** streak/league
system with forgiveness, rest days, and outcomes-over-vanity framing — the explicit
"anti-Duolingo" stance. Every answer records to the study spine: fun that shows up in mastery.

## Current state (verified — build on this)

- **The scoring/scheduling brain exists:** FSRS end-to-end (`lib/srs/fsrs.ts`), `item_mastery`
  (110 rows), `useDueReview` (the adaptive cross-set due queue — your game-feed primitive),
  `studyService.recordAttempt` (the write path — game answers are attempts, `method: 'game'`).
- **A solo game already exists inside flashcards:** the Match/game study mode (one of the 5
  shipped modes) — reuse its interaction patterns; the game engine here is new.
- **Streaks exist as data:** `education.study_streak` (table live, 1 row; written by the spine).
  No streak UI beyond flashcards progress, no forgiveness mechanics, no leagues.
- **Realtime is a solved platform problem:** Supabase **Broadcast** is the canonical choice for
  ephemeral game state/presence (CLAUDE.md realtime rule — Broadcast for ephemeral, Postgres
  Changes only when RLS-authorized persistence matters). Rooms/lobbies fit Broadcast channels.
- **No leaderboard, badge, or league infrastructure exists** — greenfield within this project.

## Scope

**IN**
- **The multiplayer game** (working name; no emojis, enterprise-clean visuals): host creates a
  room from a deck/topic → players join by code (like Kahoot, minus the player tax) → timed
  rounds. **SRS-wired:** each player's questions bias toward THEIR due/weak items (per-player
  queues — the innovation no rival has). **Anxiety-safe by design:** score = mastery-gain +
  personal-best, not raw speed-rank; leaderboards private/team/opt-in; no public shame screen.
  **Comeback + earn-to-upgrade mechanics** (Gimkit model): in-game currency from correct answers
  buys power-ups, keeping late players in the match.
- **Solo arcade mode:** the same engine single-player against your due queue (Gravity's
  replacement) — the daily-habit surface.
- **Healthy streaks & leagues:** streak UI over `study_streak` with **forgiveness** (streak
  freezes, rest days that don't break streaks, a "recovery plan" re-entry instead of guilt),
  optional small leagues (opt-in, mastery-scored), badges for outcome milestones (mastery/learning
  gain, not hours). Push/notification nudges only through explicit user opt-in — no guilt
  algorithm, ever. Document the ethics stance in the feature doc (it's a brand asset).
- **Spine integration:** every game answer → `recordAttempt` → FSRS/mastery; game sessions are
  study sessions (visible in P5's analytics).
- Persistence: rooms/results/badges/leagues on canonical `education.` tables (content-model
  pattern); live state over Broadcast.
- P7 access on shared rooms/decks; P8 metering where AI generates game content.

**OUT**
- Live *classroom* mode with teacher controls (Convergence C / institutional). Class/group
  persistent rooms (Wave-2 social). Grade-adaptive reward theming (K-5 stickers — Wave 2).
  The Match mode inside flashcards (stays; you may later unify — flag, don't absorb now).

## Deliverables / Definition of done

1. Two real users in two browsers play a live multiplayer round from a real deck: join by code,
   per-player SRS-biased questions, comeback mechanics, mastery-scored results — no public
   speed-shame anywhere.
2. Solo arcade against the due queue is playable and *fun* (Arman judges), and demonstrably
   moves `item_mastery`.
3. Game attempts appear in the spine + P5 dashboards as study activity.
4. Streak UI with working freeze/rest-day forgiveness; an opt-in league scores by mastery gain;
   badges award on outcome milestones.
5. Refresh/disconnect mid-game recovers gracefully (Broadcast rejoin).
6. Tools registry + admin map + feature docs updated; the ethics stance documented.

## Surfaces touched

- New `app/(core)/education/game/**` (or Arman's preferred route name — flag at kickoff) —
  lobby/host/join/play/results
- New `features/education/engage/**` (game engine, realtime sync, streaks/leagues/badges)
- New `education.` tables (rooms, results, badges, leagues) + migrations
- `studyService` (additive `method: 'game'`), `study_streak` (consume + forgiveness fields via
  migration), Supabase Broadcast channels
- `features/education/study` progress surfaces (streak/badge display hooks for P5 to place)

## Dependencies & contracts

- FSRS ✅, `useDueReview` ✅, spine ✅, Broadcast ✅, `study_streak` ✅.
- **Consumes:** P7 `useAccess` (shared/room decks), P8 `useEntitlement` (multiplayer room size is
  a plausible premium capability — wire the check; generous default per the P8 free-tier
  philosophy: do NOT recreate the "Kahoot tax" resentment).
- Independent of P1–P6 — fully parallel. P5 displays what you record.

## Build guidance

- Realtime: Broadcast for game state/presence; persist only results (attempt rows + a results
  row) — never callback functions or large state through Redux.
- Per-player question queues: `useDueReview`'s selection logic generalized to game context —
  extend it, don't fork FSRS selection.
- Latency-tolerant design (client-authoritative timing with server reconciliation on results) —
  this is a study game, not an esport; bias to fairness + feel.
- Heavy game UI is exactly the code-splitting bloat class — `code-splitting` skill, dynamic +
  conditional.
- `db-change` for tables; `type-safety`; `finalize-and-ship`.

## Verification

A real two-browser multiplayer session end-to-end (the no-fake-verification rule applies doubly
to realtime); SQL-verify attempts/mastery movement; kill a client mid-round and rejoin; verify a
streak freeze actually preserves a streak across a missed day (manipulate dates via test rows,
not clock hacks in prod code). Hand Arman a two-player test script.
