import type { AgentDefinitionMessage } from "@/features/agents/types/agent-message-types";
import type {
  AgentDefinition,
  VariableDefinition,
} from "@/features/agents/types/agent-definition.types";

export type SystemAgentAiExportMode = "basics" | "with-messages" | "full-json";

export interface SystemAgentAiPayloadInput {
  agent: AgentDefinition;
  liveAgentId: string;
  currentVersionId: string | null;
  modelName: string | null;
  exportMode: SystemAgentAiExportMode;
  /** Full definition object for `full-json` mode. */
  fullDefinition?: AgentDefinition | null;
  messages?: AgentDefinitionMessage[] | null;
}

function variableDefinitionsForAi(
  variables: VariableDefinition[] | null | undefined,
): Omit<VariableDefinition, "defaultValue">[] {
  if (!variables?.length) return [];
  return variables.map(({ defaultValue: _ignored, ...rest }) => rest);
}

function buildBasicsBody(input: SystemAgentAiPayloadInput): string {
  const { agent, liveAgentId, currentVersionId, modelName } = input;
  const versionLabel =
    agent.version != null ? String(agent.version) : "unknown";
  const entityLabel = agent.agentType === "builtin" ? "System Agent" : "Agent";

  const lines: string[] = [
    `${entityLabel} details:`,
    "",
    `Agent Name: ${agent.name}`,
    `agentType: "${agent.agentType}"`,
    `Version: ${versionLabel}`,
    "",
    "This agent's permanent ID that always tracks the latest version is:",
    `Agent ID: ${liveAgentId}`,
    "",
  ];

  if (currentVersionId) {
    lines.push(
      "If you need a permanent pointer to this exact version that will be frozen, you must use:",
      "is_version=True",
      `id="${currentVersionId}"`,
      "",
    );
  }

  if (agent.modelId) {
    lines.push(`Model ID: ${agent.modelId}`);
  }
  if (modelName) {
    lines.push(`Model name: ${modelName}`);
  }

  const vars = variableDefinitionsForAi(agent.variableDefinitions);
  lines.push("", '"variableDefinitions":', JSON.stringify(vars, null, 2));

  return lines.join("\n");
}

export function buildSystemAgentAiPayload(
  input: SystemAgentAiPayloadInput,
): string {
  const { agent, exportMode, fullDefinition, messages } = input;
  const rootTag = agent.agentType === "builtin" ? "system-agent" : "agent";
  const url = typeof window !== "undefined" ? window.location.href : "";
  const route = typeof window !== "undefined" ? window.location.pathname : "";

  const contextLines = [
    `<location>AI Matrx — ${agent.agentType === "builtin" ? "System Agent" : "Agent"} View</location>`,
    url ? `<url>${url}</url>` : "",
    route ? `<route>${route}</route>` : "",
    `<copied-at>${new Date().toISOString()}</copied-at>`,
    `<export-mode>${exportMode}</export-mode>`,
  ]
    .filter(Boolean)
    .join("\n");

  const sections: string[] = [
    `<${rootTag} export="${exportMode}">`,
    "<context>",
    contextLines,
    "</context>",
    "",
    "<details>",
    buildBasicsBody(input),
    "</details>",
  ];

  if (
    (exportMode === "with-messages" || exportMode === "full-json") &&
    messages?.length
  ) {
    sections.push(
      "",
      '<messages format="json">',
      JSON.stringify(messages, null, 2),
      "</messages>",
    );
  }

  if (exportMode === "full-json" && fullDefinition) {
    sections.push(
      "",
      '<full-definition format="json">',
      JSON.stringify(fullDefinition, null, 2),
      "</full-definition>",
    );
  }

  sections.push("", `</${rootTag}>`);

  return sections.join("\n");
}
