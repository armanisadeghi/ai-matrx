import type { AgentExecutionConfig } from "@/features/agents/types/agent-execution-config.types";

/**
 * Framework-owned launch defaults for agents listed in the managed "Agents"
 * context-menu section. Shortcuts do not use this config: their persisted
 * execution definitions remain authoritative.
 */
export const MANAGED_CONTEXT_MENU_AGENT_CONFIG = {
  displayMode: "flexible-panel",
  allowChat: true,
  showVariablePanel: true,
} as const satisfies Pick<
  AgentExecutionConfig,
  "displayMode" | "allowChat" | "showVariablePanel"
>;
