// features/education/engage/types.ts
//
// P10 ENGAGE — types for the engagement engine (SRS-wired multiplayer game,
// solo arcade, healthy streaks/leagues/badges).
//
// Row types derive from the generated `education` schema — never hand-mirror a
// column. Live game state (roster, per-player score, questions) is EPHEMERAL and
// rides Supabase Broadcast; only finalized results (game_result) + every answer
// (study_attempt via the spine) persist.

import type { Database } from "@/types/database.types";
import type { CardWithDetails } from "@/features/flashcards/data/types";

type Edu = Database["education"]["Tables"];

// ─── Persisted row types (generated source of truth) ─────────────────────────
export type GameRoomRow = Edu["game_room"]["Row"];
export type GameResultRow = Edu["game_result"]["Row"];
export type GameBadgeRow = Edu["game_badge"]["Row"];
export type LeagueMembershipRow = Edu["league_membership"]["Row"];

// ─── Service result (supabase-style; services never throw) ───────────────────
export interface EngageResult<T> {
  data: T | null;
  error: string | null;
}

// ─── The item_type games score against (flashcards for now; generalizes) ─────
export const GAME_ITEM_TYPE = "fc_card";
/** studyService method + session mode provenance for game attempts. */
export const GAME_METHOD = "game";

// ─── Room config (rides game_room.config jsonb) ──────────────────────────────
export interface GameRoomConfig {
  /** Match length in ms (client-authoritative countdown). */
  durationMs: number;
  /** Soft cap on players (P8 entitlement may lower it; default generous). */
  maxPlayers: number;
  /** Score reveal policy — never a public speed-shame screen. */
  leaderboardVisibility: "team" | "private";
  /** Whether the Gimkit-style earn-to-upgrade power-ups are on. */
  powerUpsEnabled: boolean;
  /** item_type the questions score against (fc_card today). */
  itemType: string;
}

export const DEFAULT_ROOM_CONFIG: GameRoomConfig = {
  durationMs: 120_000,
  maxPlayers: 40,
  leaderboardVisibility: "team",
  powerUpsEnabled: true,
  itemType: GAME_ITEM_TYPE,
};

// ─── A single game question (a flashcard turned into a 4-choice item) ─────────
export interface GameQuestion {
  /** The card being reviewed (its id is the study-spine item_id). */
  card: CardWithDetails;
  /** The prompt shown (card front). */
  prompt: string;
  /** Choice texts; exactly one is `correctIndex`. */
  choices: string[];
  correctIndex: number;
  /** True when this card is DUE / weak for this player (SRS-biased). */
  isDue: boolean;
}

export type GameResultKind = "correct" | "incorrect";

// ─── Live (ephemeral, Broadcast-only) player snapshot ────────────────────────
export interface LivePlayer {
  userId: string;
  displayName: string;
  score: number;
  correctCount: number;
  answeredCount: number;
  streak: number;
  /** in-game currency (Gimkit model) — buys power-ups, resets each match. */
  currency: number;
  isHost: boolean;
  /** last score update time (ms) for stale-drop in the UI. */
  updatedAt: number;
}

export type RoomPhase = "lobby" | "active" | "ended";

// ─── Broadcast wire events (channel `edu-game:<roomId>`) ─────────────────────
export type GameBroadcastEvent =
  | { type: "game_started"; startedAt: number; durationMs: number }
  | { type: "game_ended"; endedAt: number }
  | {
      // throttled live-score ping from a player (roster is presence-backed;
      // this carries the mutable scoreboard fields)
      type: "score";
      userId: string;
      score: number;
      correctCount: number;
      answeredCount: number;
      streak: number;
      currency: number;
    };

// ─── Power-ups (pure client engine; costs in in-game currency) ───────────────
export interface PowerUp {
  key: PowerUpKey;
  label: string;
  description: string;
  cost: number;
}
export type PowerUpKey = "double_points" | "shield" | "fifty_fifty";

// ─── Finalized outcome (what we persist to game_result) ──────────────────────
export interface GameOutcome {
  roomId: string | null;
  sessionId: string | null;
  mode: "multiplayer" | "solo";
  score: number;
  correctCount: number;
  answeredCount: number;
  bestStreak: number;
  masteryGain: number;
  currencyEarned: number;
  durationMs: number;
  sourceKind: string | null;
  sourceSetId: string | null;
  sourceTitle: string | null;
}
