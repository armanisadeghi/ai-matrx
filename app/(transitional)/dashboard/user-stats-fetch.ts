// useUserStats — dashboard user statistics hook
"use client";

import { useState, useEffect } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { supabase } from "@/utils/supabase/client";

export interface UserStats {
  user_conversation_count: number;
  total_conversation_count: number;
  user_recipe_count: number;
  total_recipe_count: number;
  user_tables_count: number;
  total_tables_count: number;
}

function isUserStatsPayload(data: unknown): data is UserStats {
  if (typeof data !== "object" || data === null) return false;
  const o = data as Record<string, unknown>;
  return (
    typeof o.user_conversation_count === "number" &&
    typeof o.total_conversation_count === "number" &&
    typeof o.user_recipe_count === "number" &&
    typeof o.total_recipe_count === "number" &&
    typeof o.user_tables_count === "number" &&
    typeof o.total_tables_count === "number"
  );
}

export function useUserStats() {
  const userId = useAppSelector(selectUserId);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  console.log(userId);

  useEffect(() => {
    const fetchStats = async () => {
      if (!userId) return;

      setLoading(true);
      try {
        const { data, error: rpcError } = await supabase.rpc("get_user_stats", {
          p_user_id: userId,
        });

        if (rpcError) throw rpcError;
        if (!isUserStatsPayload(data)) {
          throw new Error(
            "get_user_stats returned an unexpected payload shape",
          );
        }
        setStats(data);
      } catch (err) {
        console.error("Error fetching user stats:", err);
        setError(err instanceof Error ? err : new Error("Unknown error"));
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [userId]);

  return { stats, loading, error };
}
