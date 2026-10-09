// features/agents/agent-creators/templates/templateService.ts
//
// THE ONE way to make an agent from a template: the `agx_create_agent_from_template`
// RPC, called straight from the browser (row security + the RPC's own checks
// decide). It replaces a Next.js route that sat between the page and the
// database and turned every refusal into "Failed to create agent from template".
//
// The copy is homed in the organization the person is working in, sent
// explicitly (D353 — the RPC used to insert none and every copy was refused).
// With none selected, `ensureOrgId` asks; closing that picker is "not now".

import { supabase } from "@/utils/supabase/client";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";

export type TemplateCopyResult = { agentId: string } | { error: string } | { cancelled: true };

export async function createAgentFromTemplate(templateId: string): Promise<TemplateCopyResult> {
  let organizationId: string;
  try {
    organizationId = await ensureOrgId(null);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Choose an organization for the new agent." };
  }
  const { data, error } = await supabase.rpc("agx_create_agent_from_template", {
    p_template_id: templateId,
    p_organization_id: organizationId,
  });
  if (error) return { error: error.message || "The agent could not be created from this template." };
  if (!data) return { error: "The template made no agent." };
  return { agentId: data };
}
