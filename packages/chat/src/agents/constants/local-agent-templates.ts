import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import { DEFAULT_AGENT_MODEL_ID } from "@/features/agents/constants/blank-agent";

/**
 * A DEMONSTRATION TEMPLATE, and nothing a person gets by default.
 *
 * This is a worked example of a variable-driven agent (a city/what/format
 * prompt). It is reachable only from an honestly-labelled template choice —
 * never from "Create Manually", which now creates `BLANK_AGENT_SEED`. Handing
 * this to somebody who asked for a blank agent made their agent do the demo's
 * job instead of theirs.
 */
export const TEMPLATE_DATA: Omit<Partial<AgentDefinition>, "id"> = {
  agentType: "user",
  name: "New Agent Template",
  description: null,
  messages: [
    {
      role: "system",
      content: [
        {
          text: "You're a very helpful assistant.\n\nMake sure you understand the user's request and then generate a {{response_format}} response.",
          type: "text",
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          text: "Do you know about {{city}}?\n\nI'm looking for {{what}} there.\n\nPlease provide a {{response_format}} response.",
          type: "text",
        },
      ],
    },
  ],
  variableDefinitions: [
    {
      name: "city",
      helpText: "What city are you interested in?",
      required: true,
      defaultValue: "New York City",
    },
    {
      name: "response_format",
      helpText: "What format would you like your response to be in?",
      required: true,
      defaultValue: "a very concise and well-structured",
      customComponent: {
        type: "radio",
        options: [
          "a very detailed",
          "a very concise and well-structured",
          "a well-structured table",
        ],
        allowOther: true,
      },
    },
    {
      name: "what",
      helpText: "What would you like to learn more about in this city?",
      required: true,
      defaultValue: "Luxury Shopping",
    },
  ],
  modelId: DEFAULT_AGENT_MODEL_ID,
  settings: {
    stream: true,
    reasoning_effort: "minimal",
    reasoning_summary: "always",
  },
  // Keep the starter tool-free. Catalog tools can be added in the builder;
  // pinning a registry UUID here makes agent creation fail if that tool is
  // retired or removed.
  tools: [],
  customTools: [],
  contextPolicies: [],
  category: null,
  tags: [],
  isActive: true,
  isArchived: false,
  isFavorite: false,
  mcpServers: [],
};
