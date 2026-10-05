// features/agents/org-chart/positionsService.ts
//
// Positions (agent.position): named seats on the org chart — "SEO Lead" — that a
// person may fill and agents may sit under. The one read/write path for the
// table. Every write names its organization explicitly (no resolver picks one).

"use client";

import { mandateDisplayName } from "@/features/mandates/mandate-words";
import { supabase } from "@/utils/supabase/client";
import { readAllRows } from "@ai-matrx/data/db";
import { storedMandateKey, type AnyMandateKey } from "@ai-matrx/agents/mandates";
import { requireUserId } from "@/utils/auth/getUserId";

export interface OrgPosition {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  filledByUserId: string | null;
  hrJobTitleId: string | null;
  /** The job this seat is for (`mandate.definition`), once it has been defined. */
  mandateId: string | null;
}

interface PositionRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  filled_by_user_id: string | null;
  hr_job_title_id: string | null;
  mandate_id: string | null;
}

const COLUMNS = "id, organization_id, name, description, filled_by_user_id, hr_job_title_id, mandate_id";

const fromRow = (r: PositionRow): OrgPosition => ({
  id: r.id,
  organizationId: r.organization_id,
  name: r.name,
  description: r.description,
  filledByUserId: r.filled_by_user_id,
  hrJobTitleId: r.hr_job_title_id,
  mandateId: r.mandate_id,
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
    patch: { name?: string; description?: string | null; filledByUserId?: string | null; mandateId?: string | null },
  ): Promise<OrgPosition> {
    const { data, error } = await table()
      .update({
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
        ...(patch.filledByUserId !== undefined ? { filled_by_user_id: patch.filledByUserId } : {}),
        ...(patch.mandateId !== undefined ? { mandate_id: patch.mandateId } : {}),
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

// ── the job behind a seat ────────────────────────────────────────────────

/** Where a seat stands on the ladder: noted → job defined → an agent holds it. */
export interface SeatJob {
  mandateId: string;
  mandateKey: AnyMandateKey;
  label: string;
  /** The agent that does the job: the job's own Holder, else a live binding's. */
  holderAgentId: string | null;
  /** Removed or switched off: the seat points at a job that does not run. */
  retired: boolean;
}

/** The jobs behind these seats. Reads `mandate.definition` + live agent bindings. */
export async function readSeatJobs(mandateIds: readonly string[]): Promise<Map<string, SeatJob>> {
  const out = new Map<string, SeatJob>();
  if (mandateIds.length === 0) return out;
  const ids = [...new Set(mandateIds)];
  const defs = await readAllRows<{
    id: string;
    mandate_key: string;
    label: string | null;
    // Quoted: these two are READ-shape fields of a select, not a write payload
    // (default-holder-has-one-road flags the bare `column:` form).
    "default_holder_type": string | null;
    "default_holder_id": string | null;
    is_enabled: boolean;
    deleted_at: string | null;
  }>(
    ({ from, to }) =>
      supabase
        .schema("mandate")
        .from("definition")
        .select("id, mandate_key, label, default_holder_type, default_holder_id, is_enabled, deleted_at", { count: "exact" })
        .in("id", ids)
        .order("id", { ascending: true })
        .range(from, to),
    { label: "mandate.definition (org chart seats)" },
  );
  const bindings = await readAllRows<{ id: string; mandate_id: string; holder_type: string; holder_id: string | null }>(
    ({ from, to }) =>
      supabase
        .schema("mandate")
        .from("binding")
        .select("id, mandate_id, holder_type, holder_id", { count: "exact" })
        .in("mandate_id", ids)
        .is("deleted_at", null)
        .eq("holder_type", "agent")
        .order("id", { ascending: true })
        .range(from, to),
    { label: "mandate.binding (org chart seats)" },
  );
  const boundAgent = new Map<string, string>();
  for (const b of bindings) if (b.holder_id && !boundAgent.has(b.mandate_id)) boundAgent.set(b.mandate_id, b.holder_id);
  for (const d of defs) {
    out.set(d.id, {
      mandateId: d.id,
      mandateKey: storedMandateKey(d.mandate_key),
      label: mandateDisplayName(d.mandate_key, d.label),
      holderAgentId:
        (d.default_holder_type === "agent" ? d.default_holder_id : null) ?? boundAgent.get(d.id) ?? null,
      retired: Boolean(d.deleted_at) || !d.is_enabled,
    });
  }
  return out;
}
