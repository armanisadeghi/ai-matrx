/**
 * canvasItemStateService — per-viewer interactive state for artifacts that use
 * GENERIC persistence (no dedicated domain table).
 *
 * Reads/writes `canvas_item_state(canvas_id, viewer_id, state)` for the current
 * viewer. The key is `viewer_id`, NEVER `created_by`: this is a component table, so
 * the database rewrites `created_by` to the canvas item's OWNER (db-rules §6d-1) —
 * keyed on it, every viewer shared the owner's one row. Custom-table types (flashcards, quiz, tasks) do NOT use this — they
 * persist through their feature's service via a custom adapter.
 */

import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { isOrganizationRequiredError } from "@/lib/organizations/organizationRequiredError";

export const canvasItemStateService = {
  /** Current user's saved state for an artifact, or null if none. */
  async getState(canvasId: string): Promise<Record<string, unknown> | null> {
    try {
      const userId = requireUserId();
      const { data, error } = await supabase
        .schema("canvas").from("canvas_item_state")
        .select("state")
        .is("deleted_at", null)
        .eq("canvas_id", canvasId)
        .eq("viewer_id", userId)
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
        {
          canvas_id: canvasId,
          viewer_id: userId,
          // The lifetime key remains one row per canvas/viewer. A new save after an
          // archive revives that same identity instead of updating an invisible row.
          deleted_at: null,
          organization_id: await ensureOrgId(undefined),
          state: merged,
        },
        { onConflict: "canvas_id,viewer_id" },
      );
      if (error) {
        console.error("[canvasItemStateService.saveState] error:", error);
        return false;
      }
      return true;
    } catch (err) {
      // The org refusal is fixable by the person — never a silent `false`.
      // Law: common-docs/policies/context-is-carried-never-rebuilt.md.
      if (isOrganizationRequiredError(err)) throw err;
      console.error("[canvasItemStateService.saveState] error:", err);
      return false;
    }
  },
};
