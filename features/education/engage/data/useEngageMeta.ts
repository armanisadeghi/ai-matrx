// features/education/engage/data/useEngageMeta.ts
//
// Read hooks for the engagement surfaces that aren't the live game itself:
// the streak (with forgiveness), earned badges, and the weekly league. All
// read-only + RLS-scoped; the write paths are the DB triggers (streak) and the
// SECURITY DEFINER RPCs (league).
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { studyService } from "@/features/education/study/service/studyService";
import type { StudyStreakRow } from "@/features/education/study/types";
import { gameService, type LeagueEntry } from "./gameService";
import type { GameBadgeRow, LeagueMembershipRow } from "../types";
import { BADGES, type BadgeKey } from "../engine/badges";

// ─── Streak (+ forgiveness) ──────────────────────────────────────────────────
export interface UseStreakResult {
  streak: StudyStreakRow | null;
  loading: boolean;
  error: string | null;
  setRestWeekdays: (weekdays: number[]) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useStreak(): UseStreakResult {
  const [streak, setStreak] = useState<StudyStreakRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    const res = await studyService.getStreak();
    if (res.error) setError(res.error);
    setStreak(res.data);
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      const res = await studyService.getStreak();
      if (!active) return;
      if (res.error) setError(res.error);
      setStreak(res.data);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const setRestWeekdays = async (weekdays: number[]): Promise<void> => {
    const { data, error: rpcErr } = await supabase.rpc(
      "set_streak_rest_weekdays",
      { p_weekdays: weekdays },
    );
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setStreak((data ?? null) as StudyStreakRow | null);
  };

  return { streak, loading, error, setRestWeekdays, refresh: load };
}

// ─── Badges ──────────────────────────────────────────────────────────────────
export interface EarnedBadge {
  key: BadgeKey;
  label: string;
  description: string;
  earnedAt: string;
}
export interface UseBadgesResult {
  earned: EarnedBadge[];
  earnedKeys: Set<BadgeKey>;
  loading: boolean;
}

export function useBadges(): UseBadgesResult {
  const [rows, setRows] = useState<GameBadgeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      const res = await gameService.listMyBadges();
      if (!active) return;
      setRows(res.data ?? []);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const earned: EarnedBadge[] = rows
    .filter((r) => r.badge_key in BADGES)
    .map((r) => {
      const def = BADGES[r.badge_key as BadgeKey];
      return {
        key: def.key,
        label: def.label,
        description: def.description,
        earnedAt: r.earned_at,
      };
    });
  const earnedKeys = new Set(earned.map((e) => e.key));

  return { earned, earnedKeys, loading };
}

// ─── League (opt-in, weekly, mastery-gain) ───────────────────────────────────
export interface UseLeagueResult {
  membership: LeagueMembershipRow | null;
  leaderboard: LeagueEntry[];
  loading: boolean;
  optedIn: boolean;
  weekStart: string;
  setOptIn: (optedIn: boolean, displayName: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useLeague(): UseLeagueResult {
  const [membership, setMembership] = useState<LeagueMembershipRow | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeagueEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async (): Promise<void> => {
    const [mRes, lRes] = await Promise.all([
      gameService.getMyLeagueMembership(),
      gameService.getLeaderboard(),
    ]);
    setMembership(mRes.data);
    setLeaderboard(lRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      const [mRes, lRes] = await Promise.all([
        gameService.getMyLeagueMembership(),
        gameService.getLeaderboard(),
      ]);
      if (!active) return;
      setMembership(mRes.data);
      setLeaderboard(lRes.data ?? []);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const setOptIn = async (
    optedIn: boolean,
    displayName: string,
  ): Promise<void> => {
    const res = await gameService.setLeagueOptIn(optedIn, displayName);
    if (res.data) setMembership(res.data);
    await load();
  };

  return {
    membership,
    leaderboard,
    loading,
    optedIn: membership?.opted_in ?? false,
    weekStart: gameService.currentWeekStart(),
    setOptIn,
    refresh: load,
  };
}
