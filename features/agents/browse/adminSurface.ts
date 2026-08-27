// features/agents/browse/adminSurface.ts
//
// The `matrx-admin/system-agents` ROSTER runtime, mapped from the canonical
// entity-list controller.
//
// One UI, two surfaces — and that is correct, not a leftover. `/agents/all`
// is the user's Agents Hub (`matrx-user/agents`); the admin System Agents
// route is a different context with a different manifest, different write
// targets, and different bindings, even though the LIST it renders is now the
// same component. This module is what lets that be true without a second grid:
// it re-projects the same live controller onto the admin manifest's roster
// values, replacing the emitter that used to live inside `SystemAgentsGrid`.
//
// It emits only the roster half. The `agent_*` half stays with
// `SystemAgentSurfaceEmitter` on the agent-detail routes, exactly as before.

import type { EntityListSurfaceController } from "@/lib/entity-list/components/EntityListPage";
import {
  ADMIN_SYSTEM_AGENTS_SURFACE_NAME,
  createAdminSystemAgentsScope,
  type AdminSystemAgentRosterEntry,
} from "@/features/surfaces/manifests/admin-system-agents.manifest";
import type { AgentBrowseRow } from "./types";

function toRosterEntry(row: AgentBrowseRow): AdminSystemAgentRosterEntry {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    category: row.category ?? null,
    tags: row.tags ?? null,
    model_id: row.model_id ?? null,
    is_active: row.is_active ?? null,
    is_archived: row.is_archived ?? null,
    updated_at: row.updated_at ?? null,
  };
}

/**
 * The roster the admin is actually looking at.
 *
 * `roster_agent_ids` is the loaded page and `roster_count` its length — NOT the
 * server total. The canonical list pages server-side, so "the roster" an agent
 * can reason about is what is on screen; claiming 400 while handing over 25
 * would be the lie the value exists to avoid. The scope tabs mean an admin can
 * point this list at a non-system corpus, and the roster then honestly
 * describes what is shown.
 */
export function createAdminSystemAgentsListScope(
  list: EntityListSurfaceController<AgentBrowseRow>,
) {
  const ids = list.rows.map((row) => row.id);
  return createAdminSystemAgentsScope({
    roster_agent_ids: ids,
    roster_count: ids.length,
    roster_agents: list.rows.map(toRosterEntry),
    roster_filtered_agent_ids: ids,
    ...(list.query.search.trim()
      ? { roster_search_query: list.query.search.trim() }
      : {}),
  });
}

export const ADMIN_SYSTEM_AGENTS_LIST_SURFACE = {
  surfaceName: ADMIN_SYSTEM_AGENTS_SURFACE_NAME,
  getScope: createAdminSystemAgentsListScope,
};
