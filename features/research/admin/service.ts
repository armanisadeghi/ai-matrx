import { createClient } from "@/utils/supabase/client";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import type { Json, TablesUpdate } from "@/types/database.types";
import type { ResearchTemplate } from "../types";
import type {
  PromptBuiltinRef,
  TemplateFormData,
  AgentConfigKey,
} from "./types";

const supabase = createClient();

export async function fetchTemplates(): Promise<ResearchTemplate[]> {
  const { data, error } = await supabase
    .schema("research")
    .from("rs_template")
    .select("*")
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

  const currentConfig = (template.agent_config ?? {}) as Record<
    string,
    unknown
  >;
  const updatedConfig = { ...currentConfig };

  if (value) {
    updatedConfig[key] = value;
  } else {
    delete updatedConfig[key];
  }

  return updateTemplate(templateId, {
    agent_config: updatedConfig as Record<string, string>,
  });
}

export async function fetchPromptBuiltins(): Promise<PromptBuiltinRef[]> {
  // prompt_builtins migrated 1:1 to agent.definition (agent_type='builtin'), same UUIDs
  const { data, error } = await supabase
    .schema("agent")
    .from("definition")
    .select("id, name, is_active")
    .eq("agent_type", "builtin")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error)
    throw new Error(`Failed to fetch prompt builtins: ${error.message}`);
  return (data ?? []) as PromptBuiltinRef[];
}

export async function fetchPromptBuiltinById(
  id: string,
): Promise<PromptBuiltinRef | null> {
  // prompt_builtins migrated 1:1 to agent.definition (agent_type='builtin'), same UUIDs
  const { data, error } = await supabase
    .schema("agent")
    .from("definition")
    .select("id, name, is_active")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to fetch prompt builtin: ${error.message}`);
  }
  return data as PromptBuiltinRef;
}

export async function resolveBuiltinNames(
  ids: string[],
): Promise<Record<string, string>> {
  if (ids.length === 0) return {};

  // prompt_builtins migrated 1:1 to agent.definition (agent_type='builtin'), same UUIDs
  const { data, error } = await supabase
    .schema("agent")
    .from("definition")
    .select("id, name")
    .in("id", ids);

  if (error)
    throw new Error(`Failed to resolve builtin names: ${error.message}`);

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    map[row.id] = row.name;
  }
  return map;
}

export async function fetchResearchTopics(): Promise<
  Array<{
    id: string;
    project_id: string;
    name: string;
    status: string;
    template_id: string | null;
    agent_config: Json;
    autonomy_level: string;
    created_at: string;
  }>
> {
  const { data, error } = await supabase
    .schema("research")
    .from("rs_topic")
    .select(
      "id, project_id, name, status, template_id, agent_config, autonomy_level, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error)
    throw new Error(`Failed to fetch research topics: ${error.message}`);
  return data ?? [];
}
