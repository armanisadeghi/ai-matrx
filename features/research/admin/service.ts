import { createClient } from "@/utils/supabase/client";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import type { Json, TablesUpdate } from "@/types/database.types";
import type { ResearchTemplate } from "../types";
import type {
  PromptBuiltinRef,
  TemplateFormData,
  AgentConfigKey,
} from "./types";
import { jsonToAgentConfigStrings } from "./types";

const supabase = createClient();

export async function fetchTemplates(): Promise<ResearchTemplate[]> {
  const { data, error } = await supabase
    .schema("research")
    .from("rs_template")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch templates: ${error.message}`);
  return (data ?? []) as ResearchTemplate[];
}

export async function fetchTemplateById(
  id: string,
): Promise<ResearchTemplate | null> {
  const { data, error } = await supabase
    .schema("research")
    .from("rs_template")
    .select("*")
    .is("deleted_at", null)
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to fetch template: ${error.message}`);
  }
  return data as ResearchTemplate;
}

export async function createTemplate(
  input: TemplateFormData,
): Promise<ResearchTemplate> {
  const { data, error } = await supabase
    .schema("research")
    .from("rs_template")
    .insert({
      name: input.name,
      description: input.description || null,
      keyword_templates:
        input.keyword_templates.length > 0 ? input.keyword_templates : null,
      default_tags: input.default_tags.length > 0 ? input.default_tags : null,
      agent_config:
        Object.keys(input.agent_config).length > 0 ? input.agent_config : null,
      autonomy_level: input.autonomy_level,
      metadata: Object.keys(input.metadata).length > 0 ? input.metadata : null,
      is_system: false,
      organization_id: await ensureOrgId(undefined),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create template: ${error.message}`);
  return data as ResearchTemplate;
}

export async function updateTemplate(
  id: string,
  input: Partial<TemplateFormData>,
): Promise<ResearchTemplate> {
  const updates: TablesUpdate<{ schema: "research" }, "rs_template"> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined)
    updates.description = input.description || null;
  if (input.keyword_templates !== undefined)
    updates.keyword_templates =
      input.keyword_templates.length > 0 ? input.keyword_templates : null;
  if (input.default_tags !== undefined)
    updates.default_tags =
      input.default_tags.length > 0 ? input.default_tags : null;
  if (input.agent_config !== undefined)
    updates.agent_config =
      Object.keys(input.agent_config).length > 0 ? input.agent_config : null;
  if (input.autonomy_level !== undefined)
    updates.autonomy_level = input.autonomy_level;
  if (input.metadata !== undefined)
    updates.metadata =
      Object.keys(input.metadata).length > 0 ? input.metadata : null;

  const { data, error } = await supabase
    .schema("research")
    .from("rs_template")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update template: ${error.message}`);
  return data as ResearchTemplate;
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase
    .schema("research")
    .from("rs_template")
    .delete()
    .eq("id", id);

  if (error) throw new Error(`Failed to delete template: ${error.message}`);
}

export async function updateTemplateAgentConfig(
  templateId: string,
  key: AgentConfigKey,
  value: string | null,
): Promise<ResearchTemplate> {
  const template = await fetchTemplateById(templateId);
  if (!template) throw new Error("Template not found");

  const updatedConfig = jsonToAgentConfigStrings(template.agent_config);

  if (value) {
    updatedConfig[key] = value;
  } else {
    delete updatedConfig[key];
  }

  return updateTemplate(templateId, {
    agent_config: updatedConfig,
  });
}

// NOTE: the builtin AGENT LIST deliberately has no fetcher here. Listing agents
// for selection goes through the canonical agent-definition slice
// (fetchAgentsListFull + selectBuiltinAgents) — THE CANONICAL-SELECTION LAW
// (common-docs/systems/agent-slots/FEATURE.md § The two selection laws).
// The by-id lookups below are name resolution, not listing.

export async function resolveBuiltinNames(
  ids: string[],
): Promise<Record<string, string>> {
  if (ids.length === 0) return {};

  // prompt_builtins migrated 1:1 to agent.definition (agent_type='builtin'), same UUIDs
  const { data, error } = await supabase
    .schema("agent")
    .from("definition")
    .select("id, name")
    .is("deleted_at", null)
    .in("id", ids);

  if (error)
    throw new Error(`Failed to resolve builtin names: ${error.message}`);

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    map[row.id] = row.name;
  }
  return map;
}

// Research-project decoupling (2026-07-21): `rs_topic.project_id` is dead —
// the topic's optional project comes from the canonical association edge.
// Admin surfaces re-key on edges via `getTopicProjectLinks` (features/research
// /service.ts); this fetch no longer selects the column.
export async function fetchResearchTopics(): Promise<
  Array<{
    id: string;
    name: string;
    status: string;
    template_id: string | null;
    agent_config: Json;
    autonomy_level: string;
    created_at: string | null;
  }>
> {
  const { data, error } = await supabase
    .schema("research")
    .from("rs_topic")
    .select(
      "id, name, status, template_id, agent_config, autonomy_level, created_at",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error)
    throw new Error(`Failed to fetch research topics: ${error.message}`);
  return data ?? [];
}
