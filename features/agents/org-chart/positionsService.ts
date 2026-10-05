// features/agents/org-chart/positionsService.ts
//
// Positions (agent.position): named seats on the org chart — "SEO Lead" — that a
// person may fill and agents may sit under. The one read/write path for the
// table. Every write names its organization explicitly (no resolver picks one).

"use client";

import { supabase } from "@/utils/supabase/client";
import { readAllRows } from "@ai-matrx/data/db";
import { requireUserId } from "@/utils/auth/getUserId";

export interface OrgPosition {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  filledByUserId: string | null;
  hrJobTitleId: string | null;
}

interface PositionRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  filled_by_user_id: string | null;
  hr_job_title_id: string | null;
}

const COLUMNS = "id, organization_id, name, description, filled_by_user_id, hr_job_title_id";

const fromRow = (r: PositionRow): OrgPosition => ({
  id: r.id,
  organizationId: r.organization_id,
  name: r.name,
  description: r.description,
  filledByUserId: r.filled_by_user_id,
  hrJobTitleId: r.hr_job_title_id,
});

const table = () => supabase.schema("agent").from("position");

export const positionsService = {
  /** Every live position the viewer can see (the whole list — never capped at 1000). */
  async list(): Promise<OrgPosition[]> {
    const rows = await readAllRows<PositionRow>(
      ({ from, to }) =>
        table().select(COLUMNS, { count: "exact" }).is("deleted_at", null).order("id", { ascending: true }).range(from, to),
      { label: "agent.position org chart" },
    );
    return rows.map(fromRow);
  },

  async create(input: {
    organizationId: string;
    name: string;
    description?: string | null;
    filledByUserId?: string | null;
  }): Promise<OrgPosition> {
    const { data, error } = await table()
      .insert({
        organization_id: input.organizationId,
        created_by: requireUserId(),
        name: input.name.trim(),
        description: input.description?.trim() || null,
        filled_by_user_id: input.filledByUserId ?? null,
      })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return fromRow(data as PositionRow);
  },

  async update(
    id: string,
    patch: { name?: string; description?: string | null; filledByUserId?: string | null },
  ): Promise<OrgPosition> {
    const { data, error } = await table()
      .update({
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
        ...(patch.filledByUserId !== undefined ? { filled_by_user_id: patch.filledByUserId } : {}),
      })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return fromRow(data as PositionRow);
  },

  /** Soft delete (Trash). Its links stay; restore brings it back whole. */
  async remove(id: string): Promise<void> {
    const { error } = await table().update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);
  },

  async restore(id: string): Promise<void> {
    const { error } = await table().update({ deleted_at: null }).eq("id", id);
    if (error) throw new Error(error.message);
  },
};
