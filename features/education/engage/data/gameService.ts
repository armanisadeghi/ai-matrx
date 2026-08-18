// features/education/engage/data/gameService.ts
//
// P10 ENGAGE — persistence service for the engagement engine. Live game state
// rides Broadcast (features/education/engage/realtime); this service persists
// only the DURABLE facts: rooms (coordination), finalized results, earned
// badges, and league standings. Never throws — every method returns
// EngageResult<T>. Reads go direct via supabase-js (RLS-gated); cross-owner
// reads (join-by-code, room scoreboard, league leaderboard) go through the
// SECURITY DEFINER RPCs from edu_engage_game_and_forgiveness.sql.

"use client";

import { supabase } from "@/utils/supabase/client";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import type {
  EngageResult,
  GameRoomRow,
  GameResultRow,
  GameBadgeRow,
  LeagueMembershipRow,
  GameRoomConfig,
} from "../types";
import type { DbRpcRow } from "@/types/supabase-rpc";

const EDU = () => supabase.schema("education");

function fail<T>(where: string, error: unknown): EngageResult<T> {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : ((error as { message?: string } | null)?.message ?? "Unknown error");
  console.error(`[gameService] ${where}:`, message);
  return { data: null, error: `${where}: ${message}` };
}

/** Unambiguous join-code alphabet (no 0/O/1/I) — 5 chars. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateJoinCode(): string {
  let out = "";
  for (let i = 0; i < 5; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

/** The minimal room shape the join-by-code RPC returns (not a full row). */
export interface JoinableRoom {
  id: string;
  host_user_id: string;
  join_code: string;
  status: string;
  source_kind: string;
  source_set_id: string | null;
  source_title: string | null;
  config: GameRoomConfig;
  started_at: string | null;
  created_at: string;
}

/** A finalized scoreboard row (from the game_room_players RPC). */
export interface RoomPlayerResult {
  created_by: string;
  display_name: string | null;
  score: number;
  correct_count: number;
  answered_count: number;
  best_streak: number;
  mastery_gain: number;
  currency_earned: number;
  created_at: string;
}

/** A league leaderboard entry (from the league_leaderboard RPC). */
export interface LeagueEntry {
  created_by: string;
  display_name: string | null;
  mastery_gain: number;
  games_played: number;
  is_me: boolean;
}

/** Healthy-engagement signals rendered at the moment a study session ends. */
export interface EngagementSnapshot {
  session_points: number;
  current_streak: number;
  longest_streak: number;
  badges_earned: number;
  next_badge_key: string;
  next_badge_progress: number;
  next_badge_target: number;
  league_rank: number;
  league_size: number;
  league_mastery_gain: number;
  league_opted_in: boolean;
}
type _CheckEngagementSnapshot =
  EngagementSnapshot extends DbRpcRow<"education_engagement_snapshot">
    ? true
    : false;
declare const _engagementSnapshotMatchesDb: _CheckEngagementSnapshot;
true satisfies typeof _engagementSnapshotMatchesDb;

export const gameService = {
  /** Outcome-based points, streak, badge progress, and private league standing. */
  async getEngagementSnapshot(
    sessionId: string | null,
  ): Promise<EngageResult<EngagementSnapshot>> {
    try {
      const args = sessionId ? { p_session_id: sessionId } : {};
      const { data, error } = await supabase.rpc(
        "education_engagement_snapshot",
        args,
      );
      if (error) return fail("getEngagementSnapshot", error);
      const row = Array.isArray(data) ? data[0] : data;
      return { data: row ?? null, error: null };
    } catch (e) {
      return fail("getEngagementSnapshot", e);
    }
  },

  // ─── ROOMS ─────────────────────────────────────────────────────────────
  /** Host creates a room. Retries once on a (rare) join-code collision. */
  async createRoom(input: {
    sourceKind: "set" | "topic" | "due";
    sourceSetId?: string | null;
    sourceTitle?: string | null;
    config: GameRoomConfig;
    hostUserId: string;
  }): Promise<EngageResult<GameRoomRow>> {
    try {
      const orgId = await ensureOrgId(null);
      for (let attempt = 0; attempt < 3; attempt++) {
        const payload = {
          organization_id: orgId,
          host_user_id: input.hostUserId,
          join_code: generateJoinCode(),
          status: "lobby",
          source_kind: input.sourceKind,
          source_set_id: input.sourceSetId ?? null,
          source_title: input.sourceTitle ?? null,
          config: input.config as never,
        } as never;
        const { data, error } = await EDU()
          .from("game_room")
          .insert(payload)
          .select("*")
          .single();
        if (!error) return { data: data as GameRoomRow, error: null };
        // 23505 = unique_violation on the live join-code index → retry a new code.
        if ((error as { code?: string }).code === "23505" && attempt < 2)
          continue;
        return fail("createRoom", error);
      }
      return fail("createRoom", "exhausted join-code retries");
    } catch (e) {
      return fail("createRoom", e);
    }
  },

  /** Look up a joinable (lobby/active) room by its code — cross-owner via RPC. */
  async findRoomByCode(
    code: string,
  ): Promise<EngageResult<JoinableRoom | null>> {
    try {
      const { data, error } = await supabase.rpc("game_room_by_code", {
        p_code: code.trim(),
      });
      if (error) return fail("findRoomByCode", error);
      const row = Array.isArray(data) ? data[0] : data;
      return { data: (row ?? null) as JoinableRoom | null, error: null };
    } catch (e) {
      return fail("findRoomByCode", e);
    }
  },

  /** Host-only room lifecycle transitions (owner RLS permits the UPDATE). */
  async setRoomStatus(
    roomId: string,
    status: "lobby" | "active" | "ended",
    patch: { started_at?: string; ended_at?: string } = {},
  ): Promise<EngageResult<GameRoomRow>> {
    try {
      const { data, error } = await EDU()
        .from("game_room")
        .update({ status, ...patch } as never)
        .eq("id", roomId)
        .select("*")
        .single();
      if (error) return fail("setRoomStatus", error);
      return { data: data as GameRoomRow, error: null };
    } catch (e) {
      return fail("setRoomStatus", e);
    }
  },

  /** The host's own rooms (RLS-scoped), newest first. */
  async listMyRooms(limit = 20): Promise<EngageResult<GameRoomRow[]>> {
    try {
      const { data, error } = await EDU()
        .from("game_room")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) return fail("listMyRooms", error);
      return { data: (data ?? []) as GameRoomRow[], error: null };
    } catch (e) {
      return fail("listMyRooms", e);
    }
  },

  // ─── RESULTS ───────────────────────────────────────────────────────────
  /**
   * Finalize one owned game session. IC-14 deliberately accepts no score-like
   * inputs: Postgres derives the durable result from the unedited attempt ledger.
   */
  async finalizeResult(
    sessionId: string,
    displayName: string,
  ): Promise<EngageResult<GameResultRow>> {
    try {
      const { data, error } = await supabase.rpc("game_finalize_result", {
        p_session_id: sessionId,
        p_display_name: displayName,
      });
      if (error) return fail("finalizeResult", error);
      if (!data) return fail("finalizeResult", "RPC returned no result");
      return { data, error: null };
    } catch (e) {
      return fail("finalizeResult", e);
    }
  },

  /** The finalized scoreboard for a room — cross-owner via RPC. */
  async getRoomScoreboard(
    roomId: string,
  ): Promise<EngageResult<RoomPlayerResult[]>> {
    try {
      const { data, error } = await supabase.rpc("game_room_players", {
        p_room_id: roomId,
      });
      if (error) return fail("getRoomScoreboard", error);
      return { data: (data ?? []) as RoomPlayerResult[], error: null };
    } catch (e) {
      return fail("getRoomScoreboard", e);
    }
  },

  /** The current user's recent game results (history), newest first. */
  async listMyResults(limit = 20): Promise<EngageResult<GameResultRow[]>> {
    try {
      const { data, error } = await EDU()
        .from("game_result")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) return fail("listMyResults", error);
      return { data: (data ?? []) as GameResultRow[], error: null };
    } catch (e) {
      return fail("listMyResults", e);
    }
  },

  // ─── BADGES ────────────────────────────────────────────────────────────
  /** The current user's earned badges. */
  async listMyBadges(): Promise<EngageResult<GameBadgeRow[]>> {
    try {
      const { data, error } = await EDU()
        .from("game_badge")
        .select("*")
        .is("deleted_at", null)
        .order("earned_at", { ascending: false });
      if (error) return fail("listMyBadges", error);
      return { data: (data ?? []) as GameBadgeRow[], error: null };
    } catch (e) {
      return fail("listMyBadges", e);
    }
  },

  // ─── LEAGUES (opt-in, weekly, mastery-gain-scored) ─────────────────────
  /** Monday (UTC) of the current league week, as a YYYY-MM-DD date string. */
  currentWeekStart(): string {
    const now = new Date();
    const utc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    // getUTCDay: 0=Sun..6=Sat → shift to Monday-based week start.
    const dow = utc.getUTCDay();
    const diff = (dow + 6) % 7; // days since Monday
    utc.setUTCDate(utc.getUTCDate() - diff);
    return utc.toISOString().slice(0, 10);
  },

  /** The current user's league membership row for this week (or null). */
  async getMyLeagueMembership(): Promise<
    EngageResult<LeagueMembershipRow | null>
  > {
    try {
      const { data, error } = await EDU()
        .from("league_membership")
        .select("*")
        .eq("week_start", this.currentWeekStart())
        .is("deleted_at", null)
        .maybeSingle();
      if (error) return fail("getMyLeagueMembership", error);
      return {
        data: (data ?? null) as LeagueMembershipRow | null,
        error: null,
      };
    } catch (e) {
      return fail("getMyLeagueMembership", e);
    }
  },

  /**
   * Opt in (or out) through IC-14. The RPC assigns a private weekly cohort from
   * recent eligible study activity; clients cannot write league totals.
   */
  async setLeagueOptIn(
    optedIn: boolean,
    displayName: string,
  ): Promise<EngageResult<LeagueMembershipRow>> {
    try {
      const { data, error } = await supabase.rpc("league_set_opt_in", {
        p_opted_in: optedIn,
        p_display_name: displayName,
      });
      if (error) return fail("setLeagueOptIn", error);
      return { data, error: null };
    } catch (e) {
      return fail("setLeagueOptIn", e);
    }
  },

  /** The current week's league leaderboard (cross-user via RPC). */
  async getLeaderboard(): Promise<EngageResult<LeagueEntry[]>> {
    try {
      const { data, error } = await supabase.rpc("league_leaderboard", {
        p_week_start: this.currentWeekStart(),
      });
      if (error) return fail("getLeaderboard", error);
      return { data: (data ?? []) as LeagueEntry[], error: null };
    } catch (e) {
      return fail("getLeaderboard", e);
    }
  },
};
