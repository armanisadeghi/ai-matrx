/**
 * Quiz persistence adapter for the artifact system.
 *
 * Domain table: quiz_sessions (one row per user attempt/session).
 * Link: { externalSystem: 'quiz_sessions', externalId: <session uuid> }
 *
 * Architecture decision — onMaterialize is a no-op:
 *   The quiz DEFINITION is the artifact (its rawContent). A quiz_sessions row
 *   represents a user's ATTEMPT/PLAY — it is created lazily when the user first
 *   starts answering (via the MultipleChoiceQuiz component's useQuizPersistence
 *   hook). Materializing an artifact should NOT create a session; that would
 *   register an empty attempt for every viewer. The adapter therefore returns void.
 *
 *   Deduplication at play-time is handled by quiz_sessions.quiz_content_hash
 *   (see findExistingQuizByHash in actions/quiz.actions.ts).
 *
 * State shape: QuizArtifactState wraps the latest quiz_sessions row keyed by
 *   the artifactId stored in quiz_metadata.
 *
 * Keying strategy:
 *   quiz_sessions has no artifact_id / message_id column. We store the artifactId
 *   in quiz_metadata->>'artifact_id' on insert and query by it for load/save.
 *   This is an inline query — no new service method was added.
 *
 * GAP: quiz.actions.ts uses "use server" (Next.js Server Actions) + createClient()
 *   from @/utils/supabase/server, which means those functions are NOT callable
 *   from client-side service code. The adapter uses the browser supabase client
 *   directly for all DB ops (identical SQL; no server-action wrapper needed here).
 *
 * GAP: quiz_sessions has no artifact_id column. We embed it in quiz_metadata JSONB.
 *   A future migration adding quiz_sessions.artifact_id (with an index) would be
 *   cleaner and more queryable — flag this for Wave D follow-up.
 */

import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import type { QuizState } from "@/components/mardown-display/blocks/quiz/quiz-types";
import type {
  ArtifactPersistenceAdapter,
  ArtifactLink,
  MaterializedArtifactInfo,
} from "./artifact-adapters";

// ── State shape ────────────────────────────────────────────────────────────────

export interface QuizArtifactState extends Record<string, unknown> {
  /** quiz_sessions.id for the current user's active or last session. */
  sessionId: string | null;
  /** Whether the user has completed the quiz. */
  isCompleted: boolean;
  /** The full quiz state (answers, progress, results). */
  quizState: QuizState | null;
  /** ISO timestamp of completion, or null. */
  completedAt: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Find the most-recent quiz_sessions row for the given artifactId,
 * preferring an in-progress session over a completed one.
 */
async function findSessionByArtifactId(
  userId: string,
  artifactId: string,
): Promise<{
  id: string;
  state: QuizState;
  is_completed: boolean | null;
  completed_at: string | null;
} | null> {
  // quiz_metadata is JSONB; use the ->> operator via PostgREST filter syntax.
  // `quiz_metadata->>'artifact_id'` is not directly filterable via .eq, so we
  // use a raw filter. PostgREST supports `cs` (contains) on JSONB columns.
  const { data, error } = await supabase
    .from("quiz_sessions")
    .select("id, state, is_completed, completed_at")
    .eq("user_id", userId)
    .contains("quiz_metadata", { artifact_id: artifactId })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[QUIZ_ADAPTER] findSessionByArtifactId error:", error);
    return null;
  }
  return data as typeof data & {
    state: QuizState;
    is_completed: boolean | null;
    completed_at: string | null;
  } | null;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const QUIZ_ADAPTER: ArtifactPersistenceAdapter<QuizArtifactState> = {
  /**
   * No-op: quiz sessions are created lazily when the user plays the quiz.
   * The artifact (canvas_items row) IS the definition; no domain record
   * needs to exist before the user starts.
   */
  async onMaterialize(
    _info: MaterializedArtifactInfo,
  ): Promise<ArtifactLink | void> {
    // Intentional no-op — see module docblock.
    return;
  },

  /**
   * Load the current user's most-recent quiz session for this artifact.
   * The link is typically void at this layer (sessions are lazy); fall back
   * to searching by artifactId stored in quiz_metadata.
   */
  async loadState(
    artifactId: string,
    _link?: ArtifactLink,
  ): Promise<QuizArtifactState | null> {
    try {
      const userId = requireUserId();
      const row = await findSessionByArtifactId(userId, artifactId);

      if (!row) {
        // No session yet — user has not played. Return a blank slate.
        return {
          sessionId: null,
          isCompleted: false,
          quizState: null,
          completedAt: null,
        };
      }

      return {
        sessionId: row.id,
        isCompleted: row.is_completed ?? false,
        quizState: row.state,
        completedAt: row.completed_at,
      };
    } catch (err) {
      console.error("[QUIZ_ADAPTER.loadState] error:", err);
      return null;
    }
  },

  /**
   * Persist the current quiz state for a session.
   *
   * patch.sessionId:
   *   - If provided and matches an existing session → UPDATE.
   *   - If null → INSERT a new session embedding artifactId in quiz_metadata.
   *
   * patch.quizState must be present; all other fields are derived from it.
   */
  async saveState(
    artifactId: string,
    patch: Partial<QuizArtifactState>,
    _link?: ArtifactLink,
  ): Promise<boolean> {
    try {
      const userId = requireUserId();

      if (!patch.quizState) {
        console.warn("[QUIZ_ADAPTER.saveState] patch.quizState is missing");
        return false;
      }

      const quizState = patch.quizState;
      const isCompleted = patch.isCompleted ?? quizState.results !== null;
      const completedAt =
        isCompleted && quizState.results
          ? new Date(quizState.results.completedAt).toISOString()
          : null;

      const existingSessionId = patch.sessionId ?? null;

      if (existingSessionId) {
        // UPDATE existing session.
        const { error } = await supabase
          .from("quiz_sessions")
          .update({
            state: quizState as unknown as import("@/types/database.types").Json,
            is_completed: isCompleted,
            ...(completedAt ? { completed_at: completedAt } : {}),
          })
          .eq("id", existingSessionId)
          .eq("user_id", userId);

        if (error) {
          console.error("[QUIZ_ADAPTER.saveState] update error:", error);
          return false;
        }
      } else {
        // INSERT a new session. Embed artifactId in quiz_metadata for future lookup.
        const { error } = await supabase.from("quiz_sessions").insert({
          user_id: userId,
          state: quizState as unknown as import("@/types/database.types").Json,
          is_completed: isCompleted,
          ...(completedAt ? { completed_at: completedAt } : {}),
          quiz_metadata: { artifact_id: artifactId } as unknown as import("@/types/database.types").Json,
        });

        if (error) {
          console.error("[QUIZ_ADAPTER.saveState] insert error:", error);
          return false;
        }
      }

      return true;
    } catch (err) {
      console.error("[QUIZ_ADAPTER.saveState] error:", err);
      return false;
    }
  },
};
