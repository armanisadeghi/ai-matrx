/**
 * surface-bound-agents.service — agents with `agx_agent_surface` rows for a
 * given surface, grouped for the context menu "Bound Agents" submenu.
 */

import { supabase } from "@/utils/supabase/client";

export interface SurfaceBoundAgentEntry {
  agentId: string;
  name: string;
  /** Binding row used for provenance (org/user scope). */
  bindingId: string;
}

export interface SurfaceBoundAgentSection {
  /** Display label, e.g. "My agents", "System", "Acme Corp". */
  label: string;
  /** Stable sort key — lower renders first. */
  sortOrder: number;
  agents: SurfaceBoundAgentEntry[];
}

type AgentRow = {
  id: string;
  name: string;
  agent_type: string;
  user_id: string | null;
  is_active: boolean;
};

type BindingRow = {
  id: string;
  agent_id: string;
  organization_id: string | null;
  user_id: string | null;
  agent: AgentRow | AgentRow[] | null;
  organization: { id: string; name: string } | { id: string; name: string }[] | null;
};

function unwrapOne<T>(value: T | T[] | null): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function dedupeAgents(entries: SurfaceBoundAgentEntry[]): SurfaceBoundAgentEntry[] {
  const seen = new Set<string>();
  const out: SurfaceBoundAgentEntry[] = [];
  for (const e of entries) {
    if (seen.has(e.agentId)) continue;
    seen.add(e.agentId);
    out.push(e);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Fetch bindings for `surfaceName` visible to the caller (RLS) and bucket
 * agents into menu sections. An agent may appear in more than one section
 * when it has bindings at different scope tiers (e.g. owned + org-scoped).
 */
export async function fetchSurfaceBoundAgentsGrouped(
  surfaceName: string,
  currentUserId: string | null,
): Promise<SurfaceBoundAgentSection[]> {
  const { data, error } = await supabase
    .from("agx_agent_surface")
    .select(
      `
      id,
      agent_id,
      organization_id,
      user_id,
      agent:agx_agent!inner (
        id,
        name,
        agent_type,
        user_id,
        is_active
      ),
      organization:organizations (
        id,
        name
      )
    `,
    )
    .eq("surface_name", surfaceName);

  if (error) throw error;

  const rows = (data ?? []) as unknown as BindingRow[];

  const mine: SurfaceBoundAgentEntry[] = [];
  const system: SurfaceBoundAgentEntry[] = [];
  const shared: SurfaceBoundAgentEntry[] = [];
  const byOrg = new Map<string, { label: string; agents: SurfaceBoundAgentEntry[] }>();

  for (const row of rows) {
    const agent = unwrapOne(row.agent);
    if (!agent || !agent.is_active) continue;

    const entry: SurfaceBoundAgentEntry = {
      agentId: agent.id,
      name: agent.name,
      bindingId: row.id,
    };

    if (agent.agent_type === "builtin") {
      system.push(entry);
      continue;
    }

    const org = unwrapOne(row.organization);
    if (row.organization_id && org) {
      const bucket = byOrg.get(row.organization_id) ?? {
        label: org.name,
        agents: [],
      };
      bucket.agents.push(entry);
      byOrg.set(row.organization_id, bucket);
    }

    const isOwner =
      currentUserId != null && agent.user_id === currentUserId;
    if (isOwner) {
      mine.push(entry);
      continue;
    }

    if (agent.user_id && agent.user_id !== currentUserId) {
      shared.push(entry);
    }
  }

  const sections: SurfaceBoundAgentSection[] = [];

  const mineDeduped = dedupeAgents(mine);
  if (mineDeduped.length > 0) {
    sections.push({
      label: "My agents",
      sortOrder: 10,
      agents: mineDeduped,
    });
  }

  const systemDeduped = dedupeAgents(system);
  if (systemDeduped.length > 0) {
    sections.push({
      label: "System",
      sortOrder: 20,
      agents: systemDeduped,
    });
  }

  const sharedDeduped = dedupeAgents(shared);
  if (sharedDeduped.length > 0) {
    sections.push({
      label: "Shared with me",
      sortOrder: 30,
      agents: sharedDeduped,
    });
  }

  const orgSections = [...byOrg.entries()]
    .map(([orgId, bucket]) => ({
      orgId,
      label: bucket.label,
      agents: dedupeAgents(bucket.agents),
    }))
    .filter((s) => s.agents.length > 0)
    .sort((a, b) => a.label.localeCompare(b.label));

  for (const org of orgSections) {
    sections.push({
      label: org.label,
      sortOrder: 100 + orgSections.indexOf(org),
      agents: org.agents,
    });
  }

  return sections.sort((a, b) => a.sortOrder - b.sortOrder);
}
