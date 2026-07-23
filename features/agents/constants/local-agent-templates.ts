import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";

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
  modelId: "e2150d2f-7dd3-4fad-9d81-6e6ea41d4afd",
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
  contextSlots: [],
  category: null,
  tags: [],
  isActive: true,
  isPublic: false,
  isArchived: false,
  isFavorite: false,
  mcpServers: [],
};
