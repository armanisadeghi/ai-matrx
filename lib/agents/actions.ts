"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { checkIsSuperAdmin } from "@/utils/supabase/userSessionData";
import { redirect } from "next/navigation";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import type { Database } from "@/types/database.types";
import { stripNullish } from "@/utils/supabase/payload";
import { pgErrorToError } from "@/utils/supabase/pg-error";

type AgentInsert = Omit<
  Database["public"]["Tables"]["agx_agent"]["Insert"],
  "id" | "created_at" | "updated_at" | "source_agent_id" | "source_snapshot_at"
>;

/**
 * Builds an agx_agent INSERT payload from a seed. Only includes fields the
 * seed actually provides — every omitted key falls back to the DB default.
 *
 * NEVER replace this with `?? null` fallbacks: most columns on agx_agent are
 * NOT NULL with defaults (custom_tools, context_slots, messages, settings,
 * tools, tags, mcp_servers, is_*, agent_type, version), and sending `null`
 * for any of them triggers a 23502 violation. See utils/supabase/payload.ts.
 */
function seedToInsertPayload(
  seed: Omit<Partial<AgentDefinition>, "id">,
): AgentInsert {
  const raw: Partial<AgentInsert> = {
    name: seed.name ?? "Untitled Agent",
    description: seed.description ?? undefined,
    category: seed.category ?? undefined,
    tags: seed.tags,
    is_active: seed.isActive,
    is_public: seed.isPublic,
    is_archived: seed.isArchived,
    is_favorite: seed.isFavorite,
    agent_type: seed.agentType,
    model_id: seed.modelId ?? undefined,
    messages: seed.messages as unknown as AgentInsert["messages"],
    variable_definitions:
      seed.variableDefinitions as unknown as AgentInsert["variable_definitions"],
    settings: seed.settings as unknown as AgentInsert["settings"],
    tools: seed.tools,
    context_slots: seed.contextSlots as unknown as AgentInsert["context_slots"],
    model_tiers: seed.modelTiers as unknown as AgentInsert["model_tiers"],
    output_schema: seed.outputSchema as unknown as AgentInsert["output_schema"],
    custom_tools: seed.customTools as unknown as AgentInsert["custom_tools"],
    mcp_servers: seed.mcpServers,
  };

  return stripNullish(raw) as AgentInsert;
}

/**
 * Creates an agent from a seed (template constant) and redirects to the builder.
 * Explicitly sets user_id to satisfy RLS INSERT policy.
 */
export async function createAgentFromSeed(
  seed: Omit<Partial<AgentDefinition>, "id">,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("agx_agent")
    .insert({ ...seedToInsertPayload(seed), user_id: user.id })
    .select("id")
    .single();

  if (error) throw pgErrorToError(error);
  redirect(`/agents/${data.id}/build`);
}

/**
 * Admin-only: creates a system ("builtin") agent from a seed and redirects
 * to the admin system-agents builder. Sets `agent_type = 'builtin'` with all
 * scope columns null so the row is globally visible. Uses the admin client
 * to bypass RLS since `user_id = null` would otherwise fail the INSERT policy.
 */
export async function createSystemAgentFromSeed(
  seed: Omit<Partial<AgentDefinition>, "id">,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  const isAdmin = await checkIsSuperAdmin(supabase, user.id);
  if (!isAdmin) {
    throw new Error("Forbidden: admin privileges required");
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("agx_agent")
    .insert({
      ...seedToInsertPayload(seed),
      agent_type: "builtin",
      is_public: true,
      is_active: true,
      user_id: null,
      organization_id: null,
      project_id: null,
      task_id: null,
    })
    .select("id")
    .single();

  if (error) throw pgErrorToError(error);
  redirect(`/administration/system-agents/agents/${data.id}/build`);
}
