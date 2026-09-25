"use client";

// features/podcasts/studio/runs/service.ts
//
// Direct-Supabase CRUD for pc_studio_runs (user-private via RLS). A studio run
// is the durable record of one podcast generation — created the moment Generate
// is hit and updated as the stream flows, so a creation is never lost and can be
// reopened at /podcast/studio/run/[id].

import { supabase } from "@/utils/supabase/client";
import { writeOne } from "@/utils/supabase/writeOne";
import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import type { PcStudioRun } from "@/features/podcasts/types";
import type { PodcastGenerateRequest } from "@/features/podcasts/generator/types";
import type { Database } from "@/types/database.types";

type PcStudioRunDbInsert =
  Database["podcast"]["Tables"]["pc_studio_runs"]["Insert"];

export type PcStudioRunInsert = {
  status?: PcStudioRun["status"];
  input_data_type?: string | null;
  podcast_type?: string | null;
  /** The originating request (stored verbatim as jsonb). */
  request?: PodcastGenerateRequest | Record<string, unknown>;
  title?: string;
  description?: string | null;
  show_id?: string | null;
};

export type PcStudioRunUpdate = Partial<
  Omit<PcStudioRun, "id" | "created_by" | "created_at" | "updated_at">
>;

export const studioRunsService = {
  async createRun(payload: PcStudioRunInsert): Promise<PcStudioRun> {
    const {
      data: { user },
      error: authError,
    } = await getClaimsUser(supabase);
    if (authError) {
      throw new Error(
        "Your identity could not be verified just now, so the run was not created. Try again in a moment.",
        { cause: authError },
      );
    }
    if (!user?.id) {
      throw new Error("Not authenticated");
    }

    const row: PcStudioRunDbInsert = {
      ...payload,
      created_by: user.id,
      organization_id: await ensureOrgId(undefined),
    };

    const { data, error } = await supabase
      .schema("podcast").from("pc_studio_runs")
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return data as PcStudioRun;
  },

  async updateRun(id: string, patch: PcStudioRunUpdate): Promise<void> {
    await writeOne(
      supabase
        .schema("podcast").from("pc_studio_runs")
        .update(patch)
        .eq("id", id)
        .select("id"),
      { action: "save", noun: "studio run" },
    );
  },

  async fetchRunsByUser(userId: string): Promise<PcStudioRun[]> {
    const { data, error } = await supabase
      .schema("podcast").from("pc_studio_runs")
      .select("*")
      .is("deleted_at", null)
      .eq("created_by", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as PcStudioRun[];
  },

  async fetchRunById(id: string): Promise<PcStudioRun | null> {
    // .maybeSingle (not .single) — the URL id is often a backend_run_id, not a
    // pc_studio_runs row id, so "zero rows" is an expected miss (we then fall back
    // to the durable agent_run detail). .single() turns that into a noisy 406;
    // .maybeSingle() returns null cleanly.
    const { data, error } = await supabase
      .schema("podcast").from("pc_studio_runs")
      .select("*")
      .is("deleted_at", null)
      .eq("id", id)
      .maybeSingle();
    if (error) return null;
    return data as PcStudioRun;
  },

  async deleteRun(id: string): Promise<void> {
    // Soft delete, never a hard one (owner ruling 2026-09-20; db-rules §8):
    // a studio run is the durable record of one podcast generation and can be
    // reopened, and both of its readers filter `deleted_at`.
    const { error } = await supabase
      .schema("podcast").from("pc_studio_runs")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null);
    if (error) throw error;
  },
};
