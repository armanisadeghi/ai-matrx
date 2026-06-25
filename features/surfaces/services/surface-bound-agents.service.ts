/**
 * surface-bound-agents.service — agents available in a surface's context menu.
 *
 * Two layers, merged & deduped:
 *  1. Surface-specific bindings — `agx_agent_surface` rows for the surface,
 *     bucketed by ownership (My agents / System / Shared / org).
 *  2. The platform DEFAULT contracts — agents bound to `matrx-default/*` that
 *     qualify for this surface. These honor a user's (or the system's) default
 *     agents on EVERY qualifying surface, including bare/undeclared ones, so
 *     generic agents (clean-up, "help with this", summarize) appear everywhere
 *     without per-surface wiring. Surfaced as one "Default agents" section,
 *     deduped against the surface-specific ones so nothing shows twice.
 */

import { supabase } from "@/utils/supabase/client";

export interface SurfaceBoundAgentEntry {
  agentId: string;
  name: string;
  /** Binding row used for provenance (org/user scope). */
  bindingId: string;
}

export interface SurfaceBoundAgentSection {
  /** Display label, e.g. "My agents", "System", "Acme Corp", "Default agents". */
  label: string;
  /** Stable sort key — lower renders first. */
  sortOrder: number;
  agents: SurfaceBoundAgentEntry[];
}

/**
 * The three platform DEFAULT surface contracts. Agents bound to these (via
 * `agx_agent_surface`) are honored on EVERY qualifying surface.
 *
 *  - `default`               — universal 5-value contract; qualifies everywhere.
 *  - `basic-content-display` — 2-value display contract; qualifies everywhere
 *                              (every surface has content to act on).
 *  - `basic-editor`          — 4-value editor contract; qualifies only on
 *                              EDITABLE surfaces (text_before/after are real there).
 */
export const DEFAULT_SURFACE_NAMES = {
  default: "matrx-default/default",
  basicContentDisplay: "matrx-default/basic-content-display",
  basicEditor: "matrx-default/basic-editor",
} as const;

/** The default-contract surfaces whose agents qualify for the current surface. */
export function qualifyingDefaultSurfaces(isEditable: boolean): string[] {
  const names: string[] = [
    DEFAULT_SURFACE_NAMES.default,
    DEFAULT_SURFACE_NAMES.basicContentDisplay,
  ];
  if (isEditable) names.push(DEFAULT_SURFACE_NAMES.basicEditor);
  return names;
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
  surface_name: string;
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

// ── De-dupe cache ──────────────────────────────────────────────────────────
// The context menu re-mounts its content on every open, so a naive fetch would
// re-hit the DB each time the user right-clicks. A result cache + an inflight-
// promise map keyed by (surface, user, editability, includeDefaults) collapse
// repeated opens to ONE network call per session. A binding mutation clears the
// whole cache (a default-surface change affects every surface's menu).
const menuAgentsCache = new Map<string, SurfaceBoundAgentSection[]>();
const menuAgentsInflight = new Map<
  string,
  Promise<SurfaceBoundAgentSection[]>
>();

function menuAgentsKey(
  surfaceName: string | null,
  userId: string | null,
  isEditable: boolean,
  includeDefaults: boolean,
): string {
  return `${surfaceName ?? "_none"}::${userId ?? "anon"}::${
    isEditable ? "e" : "_"
  }::${includeDefaults ? "d" : "_"}`;
}

/** Drop all cached menu-agent sections after a binding mutation. */
export function invalidateSurfaceBoundAgents(_surfaceName?: string): void {
  // A default-contract binding change affects every surface's menu, so the
  // safe (and cheap) move is to clear the whole cache on any mutation.
  menuAgentsCache.clear();
}

/**
 * Surface-specific + qualifying-default agents for the surface's context menu,
 * bucketed into sections. Deduped: a default agent already shown as a
 * surface-bound agent is NOT repeated.
 *
 * `surfaceName` may be null — bare/undeclared surfaces still get the default
 * contracts. Cached per `(surfaceName, user, isEditable, includeDefaults)`.
 */
export async function fetchSurfaceMenuAgentsGrouped(
  surfaceName: string | null,
  currentUserId: string | null,
  opts?: { isEditable?: boolean; includeDefaults?: boolean; force?: boolean },
): Promise<SurfaceBoundAgentSection[]> {
  const isEditable = opts?.isEditable ?? false;
  const includeDefaults = opts?.includeDefaults ?? true;
  const key = menuAgentsKey(surfaceName, currentUserId, isEditable, includeDefaults);
  if (!opts?.force) {
    const cached = menuAgentsCache.get(key);
    if (cached) return cached;
    const inflight = menuAgentsInflight.get(key);
    if (inflight) return inflight;
  }

  // Default surfaces to merge in — minus the current surface (no self-dup).
  const defaultNames = (includeDefaults ? qualifyingDefaultSurfaces(isEditable) : [])
    .filter((n) => n !== surfaceName);

  const request = fetchMenuAgentsFromDb(surfaceName, defaultNames, currentUserId)
    .then((sections) => {
      menuAgentsCache.set(key, sections);
      return sections;
    })
    .finally(() => {
      menuAgentsInflight.delete(key);
    });
  menuAgentsInflight.set(key, request);
  return request;
}

/**
 * Surface-only bound agents (no default contracts). Back-compat wrapper — the
 * menu now uses `fetchSurfaceMenuAgentsGrouped` so defaults appear everywhere.
 */
export async function fetchSurfaceBoundAgentsGrouped(
  surfaceName: string,
  currentUserId: string | null,
  opts?: { force?: boolean },
): Promise<SurfaceBoundAgentSection[]> {
  return fetchSurfaceMenuAgentsGrouped(surfaceName, currentUserId, {
    includeDefaults: false,
    force: opts?.force,
  });
}

/** Uncached DB read — wrapped by `fetchSurfaceMenuAgentsGrouped` above. */
async function fetchMenuAgentsFromDb(
  surfaceName: string | null,
  defaultNames: string[],
  currentUserId: string | null,
): Promise<SurfaceBoundAgentSection[]> {
  const allNames = [...(surfaceName ? [surfaceName] : []), ...defaultNames];
  if (allNames.length === 0) return [];

  const { data, error } = await supabase
    .from("agx_agent_surface")
    .select(
      `
      id,
      agent_id,
      surface_name,
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
    .in("surface_name", allNames);

  if (error) throw error;

  const rows = (data ?? []) as unknown as BindingRow[];
  const surfaceRows = surfaceName
    ? rows.filter((r) => r.surface_name === surfaceName)
    : [];
  const defaultRows = rows.filter((r) => r.surface_name !== surfaceName);

  const sections = bucketBindingRows(surfaceRows, currentUserId);

  // Default agents — deduped against everything already shown for the surface.
  const surfaceAgentIds = new Set<string>();
  for (const s of sections) for (const a of s.agents) surfaceAgentIds.add(a.agentId);

  const defaultEntries: SurfaceBoundAgentEntry[] = [];
  for (const row of defaultRows) {
    const agent = unwrapOne(row.agent);
    if (!agent || !agent.is_active) continue;
    if (surfaceAgentIds.has(agent.id)) continue;
    defaultEntries.push({ agentId: agent.id, name: agent.name, bindingId: row.id });
  }
  const defaultAgents = dedupeAgents(defaultEntries);
  if (defaultAgents.length > 0) {
    sections.push({ label: "Default agents", sortOrder: 500, agents: defaultAgents });
  }

  return sections.sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Bucket `agx_agent_surface` rows for ONE logical surface into menu sections
 * by ownership. An agent may appear in more than one section when it has
 * bindings at different scope tiers (e.g. owned + org-scoped).
 */
function bucketBindingRows(
  rows: BindingRow[],
  currentUserId: string | null,
): SurfaceBoundAgentSection[] {
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

    const isOwner = currentUserId != null && agent.user_id === currentUserId;
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
    sections.push({ label: "My agents", sortOrder: 10, agents: mineDeduped });
  }

  const systemDeduped = dedupeAgents(system);
  if (systemDeduped.length > 0) {
    sections.push({ label: "System", sortOrder: 20, agents: systemDeduped });
  }

  const sharedDeduped = dedupeAgents(shared);
  if (sharedDeduped.length > 0) {
    sections.push({ label: "Shared with me", sortOrder: 30, agents: sharedDeduped });
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
