# Engagement Engine (P10) — `features/education/engage`

> **Status:** Live (2026-07-07). Route base `/education/game`. Part of the
> Education Hub. The wedge: **play IS review** — a game whose questions are
> FSRS-scheduled, mastery-scored, and anxiety-safe. No rival game product has
> spaced repetition.

## What it is

A real-time multiplayer study game (host a room, players join by code) plus a
solo arcade, both fed by the study spine's FSRS engine so every round is genuine
review. Around them: a **healthy** streak system (freezes + rest days), an
opt-in weekly **league** scored by mastery gain, and **outcome** badges. Every
answer records to the shared study spine (`method='game'`) → mastery + P5
analytics. Nothing is a toy: fun shows up in `item_mastery`.

## Entry points

| Route | What |
|---|---|
| `/education/game` | List-first home: Solo / Host / Join + streak + league + badges |
| `/education/game/solo` | Solo arcade against your due/weak queue (the daily-habit surface) |
| `/education/game/host` | Create a multiplayer room from a deck or your due queue |
| `/education/game/join` | Join a room by 5-char code |
| `/education/game/play/[roomId]?code=XXXXX` | The live game: lobby → play → results |

The heavy play surfaces (`SoloArcadeImpl`, `MultiplayerGameImpl`) are code-split
behind `next/dynamic({ ssr: false })` via thin wrappers — browser-only (timers,
Broadcast, presence) and must never enter a server/SSR render path.

## Architecture

```
engine/          PURE, deterministic, unit-testable (no I/O, no Date/random)
  scoring.ts       correctness-first score + currency + power-ups + comeback assist
  queue.ts         per-player SRS-biased MC queue (generalizes useDueReview selection)
  badges.ts        outcome-badge catalog + qualify rules
data/
  gameService.ts   rooms / results / badges / leagues persistence (never throws)
  useGamePlay.ts   THE game engine — the answer loop both solo + MP share
  finalizeGame.ts  round-over side effect: save result + award badges + league
  useEngageMeta.ts read hooks: useStreak / useBadges / useLeague
  useCurrentPlayer.ts  userId + display name
realtime/
  useGameChannel.ts  ONE Supabase Broadcast channel per room (roster + start/end/score)
components/       play/ · solo/ · multiplayer/ · lobby/ · results/ · streak/ · badges/ · league/ · EngageHome
```

### Data model (all `education.` schema, canonical base-entity + RLS)

- `game_room` — coordination row for a match (join_code, status, source, config).
- `game_result` — one finalized result per player per game (room_id NULL = solo).
- `game_badge` — earned outcome badges (unique per user/key).
- `league_membership` — opt-in weekly cohort, scored by mastery_gain.
- `study_streak` (extended) — forgiveness columns: `freezes_available`,
  `freezes_used`, `rest_weekdays`, `frozen_dates`.

### Realtime invariant

Live game state (roster, per-player score, start/end) rides **Supabase
Broadcast**, never Postgres (CLAUDE.md realtime rule). Only *results* persist
(`game_result` + every answer via the spine). Presence backs the roster and
auto-recovers it on reconnect. Cross-owner reads (join-by-code, room scoreboard,
league leaderboard) go through SECURITY DEFINER RPCs in `public` (the
`supabase.rpc` convention): `game_room_by_code`, `game_room_players`,
`league_leaderboard`, `league_add_result`, `set_streak_rest_weekdays`.

### Reconnect recovery

On mount the play surface re-fetches the room by code; if it is already
`active`, the countdown **syncs to the host's original `started_at`** so a
refreshed/dropped client rejoins mid-round instead of restarting.

## The ethics stance (brand asset — deliberately, not incidentally)

This is the **anti-Duolingo / anti-Kahoot** engagement layer. The design
enforces it in code, not copy:

1. **No speed-shame, ever.** Score is correctness-first: base points + a *small*
   decaying speed bonus + a capped personal-streak bonus. A slow, correct
   learner out-scores a fast, wrong one. Wrong answers score 0 — never negative,
   never punished. Multiplayer scoreboards are team/private, framed around
   everyone's mastery gain; there is no public "you came last" screen.
2. **Streaks forgive.** Miss a day and a banked **freeze** auto-covers it (you
   earn one every 7 days, capped at 5). Mark **rest days** and they never break a
   streak. A broken streak restarts with a clean slate — no guilt, no dark
   pattern. Forgiveness lives in the *shared* `bump_study_streak()` trigger, so
   every study mode hub-wide gets it, not just the game.
3. **Outcomes over vanity.** Badges and leagues reward mastery gained and healthy
   habit — never hours logged or raw win-count for its own sake. The results
   screen headlines *mastery gained*, not score.
4. **No guilt notifications.** Any nudge is explicit opt-in only (leagues are
   opt-in and off by default). No re-engagement guilt algorithm.
5. **Generous free tier (P8).** Room size is gated by
   `education.game_room_size` with a generous default — we deliberately do NOT
   recreate Kahoot's "player tax" resentment.

## Contracts consumed

- **Study spine** (`studyService.recordAttempt`, `method='game'`) — every answer
  advances FSRS/mastery. Game sessions are study sessions (visible in P5).
- **FSRS + `useDueReview` selection** — generalized in `engine/queue.ts`; not
  forked.
- **P7 access boundary** — enforced today via `fc_set`/`fc_card` RLS directly
  (a private deck's cards 404 for non-owners), surfaced inline in Host setup
  with a lock/globe hint. Does NOT call the `useAccess` hook — no such import
  exists in this feature. Migrate to `useAccess` once P7 ships if a richer
  shared-state (not just public/private) is needed for cross-account rooms.
- **P8 `useEntitlement("education.game_room_size")`** — max players shown BEFORE
  hosting (TRUST mandate: no mid-workflow ambush), generous default.

## Verification (2026-07-07)

- Streak forgiveness verified at the DB level with test rows (not clock hacks):
  freeze-covered gap (streak survives, 1 freeze spent, frozen date recorded),
  rest-day gap (survives, 0 freezes spent), too-large gap (guilt-free reset to
  1, longest preserved).
- Solo arcade + multiplayer flows: see the two-browser test script in the P10
  handoff / the deliverables report.

## Known follow-ups / open

- The Match mode inside flashcards (`useMatchGame`) still exists — a candidate to
  unify with this engine later (flagged, not absorbed now, per brief scope-OUT).
- Comeback badge uses a lightweight "was ever last → finished not-last" signal;
  could be richer.
- Live *classroom* mode with teacher controls is Convergence C (out of scope).

## Change Log

- **2026-07-07** — Initial build (P10): game/league/badge tables + streak
  forgiveness; pure engine (SRS queue, scoring, badges); Broadcast realtime;
  solo + multiplayer surfaces; streak/league/badge UI; routes; tools + admin map.
