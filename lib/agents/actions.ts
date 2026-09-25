"use server";

import { createClient } from "@/utils/supabase/server";
import { hasAdminPower } from "@/utils/auth/adminLaneServer";
import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { redirect } from "next/navigation";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import type { Database } from "@/types/database.types";
import { stripNullish } from "@/utils/supabase/payload";
import { pgErrorToError } from "@ai-matrx/data";
import { sanitizeAgentToolIds } from "@/features/agents/redux/agent-definition/sanitize-tool-ids";
import { currentRequestLoginHref } from "@/utils/auth/server-login-href";
import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";

type AgentInsert = Omit<
  Database["agent"]["Tables"]["definition"]["Insert"],
  "id" | "created_at" | "updated_at" | "source_agent_id" | "source_snapshot_at"
>;

/**
 * Builds an agx_agent INSERT payload from a seed. Only includes fields the
 * seed actually provides — every omitted key falls back to the DB default.
 *
 * NEVER replace this with `?? null` fallbacks: most columns on agx_agent are
 * NOT NULL with defaults (custom_tools, context_policies, messages, settings,
 * tools, tags, mcp_servers, is_*, agent_type, version), and sending `null`
 * for any of them triggers a 23502 violation. See utils/supabase/payload.ts.
 */
function seedToInsertPayload(
  seed: Omit<Partial<AgentDefinition>, "id">,
  organizationId?: string,
): AgentInsert {
  const raw: Partial<AgentInsert> = {
    // The organization the person SELECTED, carried in from the caller and
    // read here — never resolved, defaulted, or left out. Omitted ONLY by
    // `createSystemAgentFromSeed`, whose tenant the DB guard forces to the
    // Matrx System org (see that function).
    organization_id: organizationId,
    name: seed.name ?? "Untitled Agent",
    description: seed.description ?? undefined,
    category: seed.category ?? undefined,
    tags: seed.tags,
    is_active: seed.isActive,
    is_archived: seed.isArchived,
    is_favorite: seed.isFavorite,
    agent_type: seed.agentType,
    model_id: seed.modelId ?? undefined,
    messages: seed.messages,
    variable_definitions: seed.variableDefinitions,
    settings: seed.settings,
    tools:
      seed.tools === undefined
        ? undefined
        : sanitizeAgentToolIds(seed.tools, "createAgentFromSeed"),
    context_policies: seed.contextPolicies,
    model_tiers: seed.modelTiers,
    output_schema: seed.outputSchema,
    custom_tools: seed.customTools,
    mcp_servers: seed.mcpServers,
  };

  return stripNullish(raw) as AgentInsert;
}

/**
 * Creates an agent from a seed (template constant) and redirects to the builder.
 * Explicitly sets user_id to satisfy RLS INSERT policy.
 *
 * 🚨 THE ORGANIZATION IS CARRIED IN, NEVER REBUILT
 * (common-docs/policies/context-is-carried-never-rebuilt.md). `agent.definition`
 * is one of the 328 tables carrying `public._stamp_org_default`, a BEFORE
 * INSERT trigger that files a row arriving with a NULL organization into the
 * WRITER'S PERSONAL organization. This action wrote no organization at all
 * until 2026-09-17, so every agent made from a template landed in the
 * creator's personal workspace instead of the organization they were working
 * in — invisible to their teammates, and no error anywhere. The caller (the
 * client half of `/agents/new/manual`) reads the selected organization from
 * the store and passes it; with nothing selected this refuses and writes
 * nothing.
 */
export async function createAgentFromSeed(
  seed: Omit<Partial<AgentDefinition>, "id">,
  organizationId: string,
) {
  const trimmedOrganizationId =
    typeof organizationId === "string" ? organizationId.trim() : "";
  if (!trimmedOrganizationId) {
    throw new Error(
      "No organization was chosen for this agent, so nothing was created. " +
        "Pick the organization you are working in from the menu under your " +
        "avatar, then try again.",
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await getClaimsUser(supabase);

  if (authError || !user) {
    redirect(await currentRequestLoginHref("/agents/new"));
  }

  const { data, error } = await supabase
    .schema("agent")
    .from("definition")
    .insert({
      ...seedToInsertPayload(seed, trimmedOrganizationId),
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) throw pgErrorToError(error);
  // agent-link-ok: this action just created the agent for this user
  redirect(`/agents/${data.id}/build`);
}

/**
 * Admin-only: creates a system ("builtin") agent from a seed and redirects
 * to the admin system-agents builder. Sets `agent_type = 'builtin'`; the
 * Matrx System org ownership that makes it globally visible (iam.has_access's
 * platform-global tier) is written here as SYSTEM_ORGANIZATION_ID. The DB
 * guard agent._enforce_builtin_system_org still forces that same org — a
 * trigger must not be the thing that CHOOSES the tenant.
 * Writes through the signed-in admin's OWN client, never the service-role
 * admin client: `platform._stamp_actor_tier` refuses a service-role write
 * (tier `code`, no actor_system) with 23514, and RLS's `platform_admin_all`
 * already lets a platform admin insert any agent.definition row. The person
 * clicking is the author, and their session stamps `human` + their id.
 */
export async function createSystemAgentFromSeed(
  seed: Omit<Partial<AgentDefinition>, "id">,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await getClaimsUser(supabase);

  if (authError || !user) {
    redirect(
      await currentRequestLoginHref("/administration/agents/system-agents"),
    );
  }

  const isAdmin = await hasAdminPower(supabase, user.id);
  if (!isAdmin) {
    throw new Error("Forbidden: admin privileges required");
  }

  const { data, error } = await supabase
    .schema("agent")
    .from("definition")
    .insert({
      ...seedToInsertPayload(seed),
      // org-fallback-deliberate: a builtin agent is platform catalog content owned by the system organization; the builtin guard forces the same id
      organization_id: SYSTEM_ORGANIZATION_ID,
      agent_type: "builtin",
      is_active: true,
      created_by: user.id,
      task_id: null,
    })
    .select("id")
    .single();

  if (error) throw pgErrorToError(error);
  redirect(`/administration/agents/system-agents/agents/${data.id}/build`);
}
