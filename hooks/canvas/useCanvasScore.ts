import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectDisplayName } from "@/lib/redux/slices/userSlice";
import type {
  SubmitScoreRequest,
  SubmitScoreResponse,
  CanvasScore,
} from "@/types/canvas-social";

export function useCanvasScore(canvasId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const displayName = useAppSelector(selectDisplayName);

  // Get user's best score
  const { data: bestScore } = useQuery({
    queryKey: ["canvas-best-score", canvasId],
    queryFn: async () => {
      const userId = requireUserId();

      const { data } = await supabase
        .schema("canvas")
        .from("canvas_scores")
        .select("*")
        .eq("canvas_id", canvasId)
        .eq("user_id", userId)
        .order("score", { ascending: false })
        .limit(1)
        .single();

      return data as CanvasScore | null;
    },
    enabled: !!canvasId,
  });

  // Submit score mutation
  const submitScoreMutation = useMutation({
    mutationFn: async (request: Omit<SubmitScoreRequest, "canvas_id">) => {
      const userId = requireUserId();

      // Get attempt number
      let attemptNumber = 1;
      const { count } = await supabase
        .schema("canvas")
        .from("canvas_scores")
        .select("*", { count: "exact", head: true })
        .eq("canvas_id", canvasId)
        .eq("user_id", userId);

      attemptNumber = (count || 0) + 1;

      // Insert score
      const { data: score, error } = await supabase
        .schema("canvas")
        .from("canvas_scores")
        .insert({
          canvas_id: canvasId,
          user_id: userId,
          username: displayName,
          display_name: displayName,
          score: request.score,
          max_score: request.max_score,
          time_taken: request.time_taken,
          completed: request.completed,
          attempt_number: attemptNumber,
          data: request.data || {},
        })
        .select()
        .single();

      if (error) throw error;

      // Get rank
      const { count: rankCount } = await supabase
        .schema("canvas")
        .from("canvas_scores")
        .select("*", { count: "exact", head: true })
        .eq("canvas_id", canvasId)
        .gt("score", request.score);

      const rank = (rankCount || 0) + 1;

      // Check if high score
      const { data: canvas } = await supabase
        .from("shared_canvas_items")
        .select("high_score")
        .eq("id", canvasId)
        .single();

      const isHighScore =
        !canvas?.high_score || request.score > canvas.high_score;
      const isPersonalBest = !bestScore || request.score > bestScore.score;

      // Calculate XP (simplified)
      let xpEarned = 5; // Base XP for playing
      if (request.completed) xpEarned += 10;
      if (isHighScore) xpEarned += 50;
      if (rank <= 10) xpEarned += 25;

      return {
        score,
        rank,
        is_high_score: isHighScore,
        is_personal_best: isPersonalBest,
        xp_earned: xpEarned,
        achievements_unlocked: [],
      } as SubmitScoreResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["canvas-best-score", canvasId],
      });
      queryClient.invalidateQueries({
        queryKey: ["canvas-leaderboard", canvasId],
      });
      queryClient.invalidateQueries({ queryKey: ["shared-canvas"] });
    },
  });

  return {
    bestScore,
    submitScore: submitScoreMutation.mutate,
    submitScoreAsync: submitScoreMutation.mutateAsync,
    isSubmitting: submitScoreMutation.isPending,
    scoreResult: submitScoreMutation.data,
  };
}
