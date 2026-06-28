/**
 * canvasItemStateService — per-viewer interactive state for artifacts that use
 * GENERIC persistence (no dedicated domain table).
 *
 * Reads/writes `canvas_item_state(canvas_id, user_id, state)` for the current
 * user. Custom-table types (flashcards, quiz, tasks) do NOT use this — they
 * persist through their feature's service via a custom adapter.
 */

import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";

export const canvasItemStateService = {
  /** Current user's saved state for an artifact, or null if none. */
  async getState(canvasId: string): Promise<Record<string, unknown> | null> {
    try {
      const userId = requireUserId();
      const { data, error } = await supabase
        .schema("canvas").from("canvas_item_state")
        .select("state")
        .eq("canvas_id", canvasId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        console.error("[canvasItemStateService.getState] error:", error);
        return null;
      }
      return (data?.state as Record<string, unknown> | undefined) ?? null;
    } catch (err) {
      console.error("[canvasItemStateService.getState] error:", err);
      return null;
    }
  },

  /**
   * Merge a patch into the current user's state (read-modify-write; last write
   * wins per viewer — acceptable for single-user interaction state). Upserts the
   * row.
   */
  async saveState(
    canvasId: string,
    patch: Record<string, unknown>,
  ): Promise<boolean> {
    try {
      const userId = requireUserId();
      const existing = await this.getState(canvasId);
      const merged = { ...(existing ?? {}), ...patch };
      const { error } = await supabase.schema("canvas").from("canvas_item_state").upsert(
        { canvas_id: canvasId, user_id: userId, state: merged },
        { onConflict: "canvas_id,user_id" },
      );
      if (error) {
        console.error("[canvasItemStateService.saveState] error:", error);
        return false;
      }
      return true;
    } catch (err) {
      console.error("[canvasItemStateService.saveState] error:", err);
      return false;
    }
  },
};
