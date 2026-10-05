// features/templates/agentWrites.ts — the guarded writes a template install makes to a copied agent.
//
// Moved from the retired kits installer (Kits → Template merge, 2026-10-05): read the copy, write
// it through `guardedUpdate` (not_found / conflict are named failures), and name it with the next
// free name in its organization.

import { guardedUpdate, readAllRows } from "@ai-matrx/data/db";
import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";

export class InstallError extends Error {}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export interface AgentRow {
  id: string;
  version: number;
  tags: string[] | null;
  tools: string[] | null;
  variable_definitions: Json | null;
}

async function readAgentRow(agentId: string): Promise<AgentRow> {
  const { data, error } = await supabase
    .schema("agent")
    .from("definition")
    .select("id, version, tags, tools, variable_definitions")
    .eq("id", agentId)
    .maybeSingle();
  if (error) throw new InstallError(`The copied agent could not be read: ${error.message}`);
  if (!data) throw new InstallError("The copied agent is missing or not readable.");
  return data as AgentRow;
}

/** One guarded write to the copied agent. `not_found` / `conflict` are named failures, never a silent no-op. */
export async function writeAgent(
  agentId: string,
  what: string,
  build: (
    current: AgentRow,
  ) => Partial<{ name: string; description: string; tags: string[]; tools: string[]; variable_definitions: Json; deleted_at: string }>,
): Promise<void> {
  const base = await readAgentRow(agentId);
  const result = await guardedUpdate<AgentRow>({
    expectedVersion: base.version,
    applyUpdate: ({ expectedVersion, nextVersion }) =>
      supabase
        .schema("agent")
        .from("definition")
        .update({ ...build(base), version: nextVersion })
        .eq("id", agentId)
        .eq("version", expectedVersion)
        .select("id, version, tags, tools, variable_definitions")
        .maybeSingle(),
    fetchCurrent: () =>
      supabase
        .schema("agent")
        .from("definition")
        .select("id, version, tags, tools, variable_definitions")
        .eq("id", agentId)
        .maybeSingle(),
  });
  if (result.status === "not_found") {
    throw new InstallError(`Could not ${what}: the copied agent was not found, or you may not edit it.`);
  }
  if (result.status === "conflict") {
    throw new InstallError(`Could not ${what}: the agent changed meanwhile. Finish install to retry.`);
  }
}

/**
 * `base`, or `base 2`, `base 3`, … — the first name no other live agent in the
 * organization uses (case-insensitive, as `agent._refuse_duplicate_agent_name` compares).
 */
export async function nextFreeAgentName(organizationId: string, base: string, selfId: string): Promise<string> {
  const rows = await readAllRows<{ id: string; name: string }>(
    ({ from, to }) =>
      supabase
        .schema("agent")
        .from("definition")
        .select("id, name", { count: "exact" })
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .ilike("name", `${base.replace(/[%_\\]/g, (c) => `\\${c}`)}%`)
        .order("id", { ascending: true })
        .range(from, to),
    { label: "agent.definition names (template install)" },
  );
  const taken = new Set(rows.filter((r) => r.id !== selfId).map((r) => r.name.trim().toLowerCase()));
  if (!taken.has(base.trim().toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * Names a freshly copied agent `base` (or the next free `base 2`, …) in one guarded
 * write, together with whatever else `build` sets. The database refuses a second
 * agent with the same name in one organization; if another write took the chosen
 * name meanwhile, the name the refusal offers is used instead. Returns the name kept.
 * Used by the template agent copy (`agentCopy.ts`).
 */
export async function nameCopiedAgent(
  agentId: string,
  organizationId: string,
  base: string,
  build: (current: AgentRow) => Partial<{ description: string; tags: string[] }> = () => ({}),
): Promise<string> {
  let name = await nextFreeAgentName(organizationId, base, agentId);
  for (let attempt = 0; ; attempt++) {
    try {
      await writeAgent(agentId, "rename the copied agent", (cur) => ({ ...build(cur), name }));
      return name;
    } catch (err) {
      const e = isRecord(err) ? err : {};
      const offered = e.code === "23505" && e.hint === "agent_name_taken" && typeof e.details === "string" ? e.details : null;
      if (!offered || attempt >= 3) throw err;
      name = offered;
    }
  }
}
