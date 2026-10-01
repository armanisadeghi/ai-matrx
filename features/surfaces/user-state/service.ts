// features/surfaces/user-state/service.ts
//
// Data access for `user_surface_state` — generic per-user, per-surface UI
// state (the "Level 3" preferences store that replaces cookies for surface-
// scoped state). RLS is owner-only, so direct table access is safe; the
// browser client already carries the user's session.

"use client";

import { mergeJsonColumn } from "@ai-matrx/data/db";
import { supabase } from "@/utils/supabase/client";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { withOrganizationRefusalShown } from "@/lib/organizations/organizationRefusalToast";

/** A surface_key → state map for one (user, feature). '_default' is the global. */
export type SurfaceStateRows = Record<string, Record<string, unknown>>;

export const DEFAULT_SURFACE_KEY = "_default";

const ROW_COLUMNS = "id, version, state, deleted_at";

type StateRow = {
  id: string;
  version: number;
  state: unknown;
  deleted_at: string | null;
};

/** A state column read as a plain object; an archived row holds nothing the server reads. */
function liveState(row: StateRow): Record<string, unknown> {
  if (row.deleted_at) return {};
  const v = row.state;
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Postgres unique violation: another writer created the row first. */
const UNIQUE_VIOLATION = "23505";

export const surfaceUserStateService = {
  /**
   * Load the SIGNED-IN PERSON's rows for one feature (small N) so the caller
   * can resolve locally. Always filtered by `user_id`: row security lets an
   * organization's members read each other's rows, so a feature-only read
   * loaded another member's preferences (their context rules, colliding on
   * surface_key) — a screen that disagreed with what the server reads.
   */
  async loadFeature(userId: string, feature: string): Promise<SurfaceStateRows> {
    const { data, error } = await supabase
      .schema("users").from("user_surface_state")
      .select("surface_key, state")
      .eq("user_id", userId)
      .eq("feature", feature)
      // Only live rows — exactly what the server reads (aidream
      // context_rules: deleted_at IS NULL). An archived row shown here would
      // be a rule the screen promises and the server never applies.
      .is("deleted_at", null);
    if (error) throw new Error(`surfaceUserState.loadFeature(${feature}): ${error.message}`);
    const rows: SurfaceStateRows = {};
    for (const r of data ?? []) {
      rows[r.surface_key] = (r.state as Record<string, unknown>) ?? {};
    }
    return rows;
  },

  /**
   * Merge a change INTO one (feature, surface_key) row on the server — never a
   * whole-row overwrite from this tab's copy. `merge` receives the row's
   * CURRENT saved state (re-read on every attempt) and returns the next one,
   * so two tabs changing different keys both land (a whole-row upsert from a
   * tab loaded earlier erased the other tab's rule). Resolves to the state the
   * server now holds.
   *
   * An existing row needs no organization. Creating the row does: it goes
   * through the same hold-and-set gate a send uses (`ensureOrganizationContext`
   * — with nothing selected the person is asked, then the save continues;
   * closing the picker throws `OrganizationSelectionCancelled`).
   */
  async mergeState(
    userId: string,
    feature: string,
    surfaceKey: string,
    merge: (current: Record<string, unknown>) => Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const table = () => supabase.schema("users").from("user_surface_state");
    const fetchCurrent = () =>
      table()
        .select(ROW_COLUMNS)
        .eq("user_id", userId)
        .eq("feature", feature)
        .eq("surface_key", surfaceKey)
        .maybeSingle<StateRow>();

    for (let attempt = 0; attempt < 2; attempt++) {
      const { data: existing, error: readError } = await fetchCurrent();
      if (readError) throw new Error(`surfaceUserState.mergeState(${feature}/${surfaceKey}): ${readError.message}`);

      if (existing) {
        const result = await mergeJsonColumn<StateRow>({
          fetchCurrent,
          readColumn: (row) => liveState(row),
          merge,
          applyUpdate: ({ value, expectedVersion, nextVersion }) =>
            table()
              // A save is the person's current choice: it revives an archived
              // row rather than writing into one the server ignores.
              .update({ state: value as never, deleted_at: null, version: nextVersion })
              .eq("id", existing.id)
              .eq("version", expectedVersion)
              .select(ROW_COLUMNS)
              .maybeSingle<StateRow>(),
        });
        if (result.status === "saved") return liveState(result.row);
        if (result.status === "not_found") continue;
        if (result.status === "conflict") {
          throw new Error(`surfaceUserState.mergeState(${feature}/${surfaceKey}): every attempt lost to a concurrent write`);
        }
        throw new Error(
          `surfaceUserState.mergeState(${feature}/${surfaceKey}): ${
            result.error instanceof Error ? result.error.message : String(result.error)
          }`,
        );
      }

      const { ensureOrganizationContext } = await import("@/lib/organization/organization-gate");
      const { data: created, error: insertError } = await table()
        .insert({
          user_id: userId,
          // org-filter: write-target — the organization the person is working in; no list reads it
          organization_id: await ensureOrganizationContext(),
          feature,
          surface_key: surfaceKey,
          state: merge({}) as never,
        })
        .select(ROW_COLUMNS)
        .single<StateRow>();
      if (!insertError && created) return liveState(created);
      // Another tab created the row a moment ago: merge into it instead.
      if (insertError?.code === UNIQUE_VIOLATION) continue;
      throw new Error(`surfaceUserState.mergeState(${feature}/${surfaceKey}): ${insertError?.message ?? "no row returned"}`);
    }
    throw new Error(`surfaceUserState.mergeState(${feature}/${surfaceKey}): the row kept changing under the write`);
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
          // A surface's remembered layout is still the person's data, and a
          // save that silently stops happening is how they lose it on the
          // next visit. Say it once, with the remedy.
          organization_id: await withOrganizationRefusalShown(
            "saved",
            // org-filter: write-target writes into the organization the person is working in; no list reads it
            () => ensureOrgId(undefined),
            { subject: "Your layout for this screen" },
          ),
          feature,
          surface_key: surfaceKey,
          state: state as never,
          // A save is the person's current choice: it revives an archived row
          // rather than writing into one the server ignores.
          deleted_at: null,
        },
        { onConflict: "user_id,feature,surface_key" },
      );
    if (error) throw new Error(`surfaceUserState.save(${feature}/${surfaceKey}): ${error.message}`);
  },
};
