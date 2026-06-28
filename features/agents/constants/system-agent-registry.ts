/**
 * System agent registry — metadata for built-in agents (formerly prompt_builtins).
 *
 * IDs are 1:1 with `agent.definition` rows (`agent_type = 'builtin'`). The
 * legacy prompt-builtin UUIDs still work unchanged.
 *
 * This file is METADATA ONLY (id, name, description, key, context, icon).
 * Execution goes through the agent execution system (`launchAgentExecution`).
 */

export interface SystemAgentInfo {
  id: string;
  name: string;
  description: string;
  key: string;
  context: boolean;
  icon: string;
}

/** @deprecated Use `SystemAgentInfo`. Kept for callers mid-migration. */
export type PromptBuiltin = SystemAgentInfo;

export const SYSTEM_AGENTS = {
  PROMPT_APP_AUTO_CREATE: {
    id: "4b9563db-7a95-476d-b2c7-b76385d35e9c",
    name: "Prompt App Auto Creator",
    description: "Specialized for auto creating Prompt Apps",
    key: "prompt-app-auto-create",
    context: false,
    icon: "Rocket",
  },
  PROMPT_APP_AUTO_CREATE_LIGHTNING: {
    id: "aa1cf55b-a8ab-4be1-b0c2-6ab1f9347913",
    name: "Prompt App Auto Creator (Lightning)",
    description: "Specialized for auto creating Prompt Apps lightning fast",
    key: "prompt-app-auto-create-lightning",
    context: false,
    icon: "Zap",
  },
  PROMPT_APP_UI_EDITOR: {
    id: "c1c1f092-ba0d-4d6c-b352-b22fe6c48272",
    name: "Prompt App UI Editor",
    description:
      "Specialized for editing a Prompt App UI with custom instructions",
    key: "prompt-app-ui-editor",
    context: false,
    icon: "Paintbrush",
  },
  GENERIC_CODE: {
    id: "87efa869-9c11-43cf-b3a8-5b7c775ee415",
    name: "Master Code Editor",
    description: "General-purpose code editor for any programming language",
    key: "generic-code-editor",
    context: false,
    icon: "Code2",
  },
  CODE_EDITOR_DYNAMIC_CONTEXT: {
    id: "970856c5-3b9d-4034-ac9d-8d8a11fb3dba",
    name: "Code Editor",
    description: "Code editor with dynamic context version management",
    key: "code-editor-dynamic-context",
    context: true,
    icon: "Brain",
  },
  PROMPT_APP_METADATA_GENERATOR: {
    id: "a2919657-8572-441c-8355-840185f8447c",
    name: "Prompt App Metadata Generator",
    description:
      "Generate metadata for a prompt app using the prompt object. Provides everything, other than the component code.",
    key: "prompt-app-metadata-generator",
    context: false,
    icon: "FileText",
  },
  MATRIX_CUSTOM_CHAT: {
    id: "ce7c5e71-cbdc-4ed1-8dd9-a7eac930b6b8",
    name: "Matrx Custom Chat",
    description: "Custom AI chat assistant for quick conversations",
    key: "matrix-custom-chat",
    context: false,
    icon: "MessageSquare",
  },
  FULL_PROMPT_STRUCTURE_BUILDER: {
    id: "62895ef4-1f3a-499d-9af3-148944462769",
    name: "Full Prompt Structure Builder",
    description:
      "Build a full prompt structure from a current prompt or a concept.",
    key: "full-prompt-structure-builder",
    context: false,
    icon: "Brain",
  },
  TOOL_UI_COMPONENT_GENERATOR: {
    id: "51b0c1d5-84b7-46d8-aec6-2b08f9f49fff",
    name: "Tool UI Component Generator",
    description:
      "Generates custom inline/overlay React components for MCP tool result rendering in chat.",
    key: "tool-ui-component-generator",
    context: false,
    icon: "Paintbrush",
  },
} as const satisfies Record<string, SystemAgentInfo>;

/** @deprecated Use `SYSTEM_AGENTS`. Kept for callers mid-migration. */
export const PROMPT_BUILTINS = SYSTEM_AGENTS;

const keyToId = Object.fromEntries(
  Object.values(SYSTEM_AGENTS).map((agent) => [agent.key, agent.id]),
);

const idToAgent = Object.fromEntries(
  Object.values(SYSTEM_AGENTS).map((agent) => [agent.id, agent]),
);

const keyToAgent = Object.fromEntries(
  Object.values(SYSTEM_AGENTS).map((agent) => [agent.key, agent]),
);

export function getBuiltinId(key: string): string {
  const id = keyToId[key];
  if (!id) {
    throw new Error(
      `Unknown system agent key: "${key}". Valid keys: ${Object.keys(keyToId).join(", ")}`,
    );
  }
  return id;
}

export function getAgentId(key: string): string {
  return getBuiltinId(key);
}

export function getBuiltinInfoById(id: string): SystemAgentInfo | undefined {
  return idToAgent[id];
}

export function getAgentInfoById(id: string): SystemAgentInfo | undefined {
  return getBuiltinInfoById(id);
}

export function getBuiltinInfoByKey(key: string): SystemAgentInfo | undefined {
  return keyToAgent[key];
}

export function getAgentInfoByKey(key: string): SystemAgentInfo | undefined {
  return getBuiltinInfoByKey(key);
}

export function resolveBuiltinId(identifier: string): string {
  if (idToAgent[identifier]) return identifier;

  const idByKey = keyToId[identifier];
  if (idByKey) return idByKey;

  const agent = Object.values(SYSTEM_AGENTS).find(
    (entry) => entry.name === identifier,
  );
  if (agent) return agent.id;

  throw new Error(
    `Unknown system agent identifier: "${identifier}". Must be a valid UUID, key, or name.`,
  );
}
