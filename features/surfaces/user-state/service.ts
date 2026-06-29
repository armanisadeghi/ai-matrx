// features/surfaces/user-state/service.ts
//
// Data access for `user_surface_state` — generic per-user, per-surface UI
// state (the "Level 3" preferences store that replaces cookies for surface-
// scoped state). RLS is owner-only, so direct table access is safe; the
// browser client already carries the user's session.

"use client";

import { supabase } from "@/utils/supabase/client";
import { ensureOrgId } from "@/lib/organizations/personalOrg";

/** A surface_key → state map for one (user, feature). '_default' is the global. */
export type SurfaceStateRows = Record<string, Record<string, unknown>>;

export const DEFAULT_SURFACE_KEY = "_default";

export const surfaceUserStateService = {
  /** Load every row for one feature (small N) so the caller can resolve locally. */
  async loadFeature(feature: string): Promise<SurfaceStateRows> {
    const { data, error } = await supabase
      .schema("users").from("user_surface_state")
      .select("surface_key, state")
      .eq("feature", feature);
    if (error) throw new Error(`surfaceUserState.loadFeature(${feature}): ${error.message}`);
    const rows: SurfaceStateRows = {};
    for (const r of data ?? []) {
      rows[r.surface_key] = (r.state as Record<string, unknown>) ?? {};
    }
    return rows;
  },

  /** Upsert one (feature, surface_key) row. */
  async save(
    userId: string,
    feature: string,
    surfaceKey: string,
    state: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await supabase
      .schema("users").from("user_surface_state")
      .upsert(
        {
          user_id: userId,
          organization_id: await ensureOrgId(undefined),
          feature,
          surface_key: surfaceKey,
          state: state as never,
        },
        { onConflict: "user_id,feature,surface_key" },
      );
    if (error) throw new Error(`surfaceUserState.save(${feature}/${surfaceKey}): ${error.message}`);
  },
};
