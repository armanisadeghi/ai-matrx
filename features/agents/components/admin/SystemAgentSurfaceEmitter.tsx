"use client";

/**
 * Surface emitter for the SYSTEM AGENTS ADMIN detail routes
 * (`matrx-admin/system-agents`).
 *
 * Mounted by `app/(admin)/administration/agents/system-agents/agents/[id]/
 * layout.tsx` so every detail sub-route (view, build, run, versions,
 * shortcuts, apps, widgets, surfaces) emits the open agent's scope to the
 * header Agents chrome.
 *
 * Why a dedicated component instead of wrapping `AgentViewContent`: that
 * component is SHARED with the user-facing `/agents/[id]` route, which has its
 * own `matrx-user` surfaces. Wrapping it would make the user route claim the
 * admin surface. This wrapper lives only on the admin route.
 *
 * SECURITY: emits authored agent-definition metadata only. No secrets, API
 * keys, tokens, connection strings, or credential material are read or placed
 * in the scope — see the manifest header for the standing rule.
 */

import type { ReactNode } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_SYSTEM_AGENTS_SURFACE_NAME,
  createAdminSystemAgentsScope,
} from "@/features/surfaces/manifests/admin-system-agents.manifest";

export function SystemAgentSurfaceEmitter({
  agentId,
  children,
}: {
  agentId: string;
  children: ReactNode;
}) {
  const agent = useAppSelector((s) => selectAgentById(s, agentId));

  // Built at trigger time (Run), not on mount — reads whatever the Redux
  // record holds at that instant.
  const getSurfaceScope = () => {
    if (!agent) {
      return createAdminSystemAgentsScope({
        agent_id: agentId,
        selection: window.getSelection()?.toString() || undefined,
      });
    }
    return createAdminSystemAgentsScope({
      agent_id: agent.id,
      agent_name: agent.name || undefined,
      agent_description: agent.description || undefined,
      agent_category: agent.category || undefined,
      agent_tags: agent.tags ?? undefined,
      agent_type: agent.agentType || undefined,
      agent_is_system: agent.agentType === "builtin",
      agent_is_active: agent.isActive ?? undefined,
      agent_is_archived: agent.isArchived ?? undefined,
      agent_is_public: agent.isPublic ?? undefined,
      agent_updated_at: agent.updatedAt || undefined,
      agent_summary: {
        id: agent.id,
        name: agent.name,
        description: agent.description ?? null,
        category: agent.category ?? null,
        tags: agent.tags ?? null,
        agent_type: agent.agentType ?? null,
        is_active: agent.isActive ?? null,
        is_archived: agent.isArchived ?? null,
        is_public: agent.isPublic ?? null,
        updated_at: agent.updatedAt ?? null,
      },
      agent_model_id: agent.modelId || undefined,
      agent_model_tiers: agent.modelTiers ?? undefined,
      agent_messages: agent.messages ?? undefined,
      agent_variable_definitions: agent.variableDefinitions ?? undefined,
      agent_context_slots: agent.contextSlots ?? undefined,
      agent_tools: agent.tools ?? undefined,
      agent_custom_tools: agent.customTools ?? undefined,
      agent_mcp_servers: agent.mcpServers ?? undefined,
      agent_settings: agent.settings ?? undefined,
      agent_output_schema: agent.outputSchema ?? undefined,
      agent_ui_gates: agent.uiGates ?? undefined,
      agent_skill_config: agent.skillConfig ?? undefined,
      agent_version: agent.version ?? undefined,
      agent_change_note: agent.changeNote || undefined,
      agent_changed_at: agent.changedAt || undefined,
      agent_source_agent_id: agent.sourceAgentId || undefined,
      agent_source_snapshot_at: agent.sourceSnapshotAt || undefined,
      selection: window.getSelection()?.toString() || undefined,
    });
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_SYSTEM_AGENTS_SURFACE_NAME}
      getScope={getSurfaceScope}
      isEditable={false}
    >
      {children}
    </SurfaceRuntimeProvider>
  );
}
