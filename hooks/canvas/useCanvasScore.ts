import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { withOrganizationRefusalShown } from "@/lib/organizations/organizationRefusalToast";
import { isOrganizationRequiredError } from "@/lib/organizations/organizationRequiredError";
import { toast } from "@/lib/toast";
import type {
  SubmitScoreRequest,
  SubmitScoreResponse,
  CanvasScore,
} from "@/types/canvas-social";

export function useCanvasScore(canvasId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  // Get user's best score
  const { data: bestScore } = useQuery({
    queryKey: ["canvas-best-score", canvasId],
    queryFn: async () => {
      const userId = requireUserId();

      const { data } = await supabase
        .schema("canvas").from("canvas_scores")
        .select("*")
        .is("deleted_at", null)
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
      requireUserId();

      // canvas.canvas_scores refuses client writes (SECURITY-SWEEP 2026-09-21);
      // canvas.submit_canvas_score is the one door. The attempt is always the
      // caller's own (and carries the name from their own profile), on a canvas
      // they can see, in the organization named here. Rank, high score and
      // personal best come back from the door, which sees every score — the
      // browser can read only its own rows.
      const organizationId = await withOrganizationRefusalShown(
        // A score that silently fails to record is the worst possible
        // lie on a leaderboard — the person played and the board forgot.
        "recorded",
        () => ensureOrgId(undefined),
        { subject: "Your score" },
      );
      const { data, error } = await supabase
        .schema("canvas")
        .rpc("submit_canvas_score", {
          p_canvas_id: canvasId,
          p_score: request.score,
          p_max_score: request.max_score,
          p_completed: request.completed,
          p_organization_id: organizationId,
          p_time_taken: request.time_taken,
          p_data: request.data || {},
        });

      if (error) throw error;
      if (!isScoreDoorResult(data)) {
        throw new Error("The score was recorded but the result came back unreadable.");
      }

      // Calculate XP (simplified)
      let xpEarned = 5; // Base XP for playing
      if (request.completed) xpEarned += 10;
      if (data.is_high_score) xpEarned += 50;
      if (data.rank <= 10) xpEarned += 25;

      return {
        score: data.score,
        rank: data.rank,
        is_high_score: data.is_high_score,
        is_personal_best: data.beats_own_best,
        xp_earned: xpEarned,
        achievements_unlocked: [],
      } as SubmitScoreResponse;
    },
    onError: (err: unknown) => {
      // The refusal is already spoken by `withOrganizationRefusalShown`; this
      // is here so every OTHER failure is spoken too, rather than leaving the
      // board silently unchanged.
      if (isOrganizationRequiredError(err)) return;
      toast.error("Your score was not recorded", {
        description:
          err instanceof Error ? err.message : "The leaderboard was not updated.",
      });
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

/** The jsonb canvas.submit_canvas_score returns. */
interface ScoreDoorResult {
  score: CanvasScore;
  rank: number;
  is_high_score: boolean;
  beats_own_best: boolean;
  attempt_number: number;
}

function isScoreDoorResult(value: unknown): value is ScoreDoorResult {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    !!v.score &&
    typeof v.score === "object" &&
    typeof v.rank === "number" &&
    typeof v.is_high_score === "boolean" &&
    typeof v.beats_own_best === "boolean"
  );
}
