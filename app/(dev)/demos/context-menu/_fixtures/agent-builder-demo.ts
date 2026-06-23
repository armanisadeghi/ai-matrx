import type { AgentBuilderScopeInput } from "@/features/agents/agent-context/buildAgentBuilderContextData";

/** Stable placeholder agent for context-menu demos. */
export const DEMO_AGENT_ID = "00000000-0000-4000-8000-000000000001";

export const DEMO_AGENT_BUILDER_SCOPE: AgentBuilderScopeInput = {
  agent_id: DEMO_AGENT_ID,
  agent_name: "Demo Support Agent",
  agent_description: "Placeholder agent for context-menu testing.",
  agent_type: "user",
  agent_version: 1,
  agent_tags: ["demo", "support"],
  agent_model_id: "gpt-4o",
  agent_tools: ["web_search"],
  agent_custom_tools: [],
  agent_mcp_servers: [],
  agent_context_slots: [],
  agent_variable_definitions: [],
  agent_output_schema: { type: "object", properties: {} },
  agent_settings: { temperature: 0.7 },
  agent_json: JSON.stringify(
    {
      id: DEMO_AGENT_ID,
      name: "Demo Support Agent",
      type: "user",
      version: 1,
    },
    null,
    2,
  ),
  is_dirty: false,
};

export const DEMO_AGENT_FIELD_INITIAL = `You are a helpful support agent for Acme Corp.
Answer concisely. Cite sources when available.
Never fabricate policy details.`;

export const DEMO_AGENT_FOCUSED_FIELD = "system_instruction";
