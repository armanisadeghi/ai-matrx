import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/utils/supabase/client";
import { getUserId } from "@/utils/auth/getUserId";
import type { LeaderboardEntry } from "@/types/canvas-social";

export function useLeaderboard(canvasId: string, limit: number = 10) {
  const supabase = createClient();
  const userId = getUserId();

  return useQuery({
    queryKey: ["canvas-leaderboard", canvasId, limit],
    queryFn: async () => {
      // Get top scores
      const { data: scores, error } = await supabase
        .schema("canvas").from("canvas_scores")
        .select("*")
        .eq("canvas_id", canvasId)
        .order("score", { ascending: false })
        .order("time_taken", { ascending: true }) // Tiebreaker: faster time
        .limit(limit);

      if (error) throw error;

      // Transform to leaderboard entries with ranks
      const entries: LeaderboardEntry[] = scores.map((score, index) => ({
        rank: index + 1,
        username: score.username || "Anonymous",
        display_name: score.display_name,
        avatar_url: null, // Can be fetched from user profiles later
        score: score.score,
        time_taken: score.time_taken,
        created_at: score.created_at,
        is_current_user: score.user_id === userId,
      }));

      // Get current user's rank if not in top N
      let userRank: number | null = null;
      if (userId) {
        const userInTop = entries.some((e) => e.is_current_user);
        if (!userInTop) {
          // Get user's best score
          const { data: userScore } = await supabase
            .schema("canvas").from("canvas_scores")
            .select("score")
            .eq("canvas_id", canvasId)
            .eq("user_id", userId)
            .order("score", { ascending: false })
            .limit(1)
            .single();

          if (userScore) {
            // Count how many scores are better
            const { count } = await supabase
              .schema("canvas").from("canvas_scores")
              .select("*", { count: "exact", head: true })
              .eq("canvas_id", canvasId)
              .gt("score", userScore.score);

            userRank = (count || 0) + 1;
          }
        }
      }

      return {
        entries,
        userRank,
        total: entries.length,
      };
    },
    enabled: !!canvasId,
    staleTime: 1000 * 30, // 30 seconds
  });
}
