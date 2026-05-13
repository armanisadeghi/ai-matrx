"use client";

import { createClient } from "@/utils/supabase/client";
import {
  isValueMappingMap,
  type ValueMappingMap,
} from "@/features/tool-registry/surfaces/types";

const sb = () => createClient();

export interface AgentSurfaceBinding {
  id: string;
  agentId: string;
  surfaceName: string;
  /** Scope tier — exactly one of these is non-null (or all null for global). */
  userId: string | null;
  organizationId: string | null;
  projectId: string | null;
  taskId: string | null;
  /** JSONB column. Type-guarded at read time so callers see a real ValueMappingMap. */
  valueMappings: ValueMappingMap;
  createdAt: string;
}

interface RawBindingRow {
  id: string;
  agent_id: string;
  surface_name: string;
  user_id: string | null;
  organization_id: string | null;
  project_id: string | null;
  task_id: string | null;
  value_mappings: unknown;
  created_at: string;
}

function fromRow(row: RawBindingRow): AgentSurfaceBinding {
  return {
    id: row.id,
    agentId: row.agent_id,
    surfaceName: row.surface_name,
    userId: row.user_id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    taskId: row.task_id,
    valueMappings: isValueMappingMap(row.value_mappings)
      ? (row.value_mappings as ValueMappingMap)
      : {},
    createdAt: row.created_at,
  };
}

/** List all bindings for an agent that the caller can see (RLS-gated). */
export async function listAgentSurfaceBindings(
  agentId: string,
): Promise<AgentSurfaceBinding[]> {
  const { data, error } = await sb()
    .from("agx_agent_surface")
    .select(
      "id, agent_id, surface_name, user_id, organization_id, project_id, task_id, value_mappings, created_at",
    )
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as RawBindingRow[]).map(fromRow);
}

export interface ScopeInput {
  userId?: string | null;
  organizationId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
}

/** Upsert a binding for (agent, surface, scope). Creates if missing. */
export async function upsertAgentSurfaceBinding(args: {
  agentId: string;
  surfaceName: string;
  scope: ScopeInput;
  valueMappings: ValueMappingMap;
}): Promise<AgentSurfaceBinding> {
  const { agentId, surfaceName, scope, valueMappings } = args;

  // Find existing row matching the same (agent, surface, scope) — the partial
  // unique indexes guarantee at most one match per tier.
  const existing = await findBinding(agentId, surfaceName, scope);

  if (existing) {
    const { data, error } = await sb()
      .from("agx_agent_surface")
      .update({ value_mappings: valueMappings })
      .eq("id", existing.id)
      .select(
        "id, agent_id, surface_name, user_id, organization_id, project_id, task_id, value_mappings, created_at",
      )
      .single();
    if (error) throw error;
    return fromRow(data as unknown as RawBindingRow);
  }

  const { data, error } = await sb()
    .from("agx_agent_surface")
    .insert({
      agent_id: agentId,
      surface_name: surfaceName,
      user_id: scope.userId ?? null,
      organization_id: scope.organizationId ?? null,
      project_id: scope.projectId ?? null,
      task_id: scope.taskId ?? null,
      value_mappings: valueMappings,
    })
    .select(
      "id, agent_id, surface_name, user_id, organization_id, project_id, task_id, value_mappings, created_at",
    )
    .single();
  if (error) throw error;
  return fromRow(data as unknown as RawBindingRow);
}

async function findBinding(
  agentId: string,
  surfaceName: string,
  scope: ScopeInput,
): Promise<AgentSurfaceBinding | null> {
  let query = sb()
    .from("agx_agent_surface")
    .select(
      "id, agent_id, surface_name, user_id, organization_id, project_id, task_id, value_mappings, created_at",
    )
    .eq("agent_id", agentId)
    .eq("surface_name", surfaceName);

  query =
    scope.userId !== undefined && scope.userId !== null
      ? query.eq("user_id", scope.userId)
      : query.is("user_id", null);
  query =
    scope.organizationId !== undefined && scope.organizationId !== null
      ? query.eq("organization_id", scope.organizationId)
      : query.is("organization_id", null);
  query =
    scope.projectId !== undefined && scope.projectId !== null
      ? query.eq("project_id", scope.projectId)
      : query.is("project_id", null);
  query =
    scope.taskId !== undefined && scope.taskId !== null
      ? query.eq("task_id", scope.taskId)
      : query.is("task_id", null);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return fromRow(data as unknown as RawBindingRow);
}

export async function deleteAgentSurfaceBinding(id: string): Promise<void> {
  const { error } = await sb().from("agx_agent_surface").delete().eq("id", id);
  if (error) throw error;
}
