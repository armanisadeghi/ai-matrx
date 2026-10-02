/**
 * Normalize ManagedAgentOptions into a single canonical shape that the
 * execution pipeline consumes. All presentation/behavior config lives
 * in `opts.config` (a Partial<AgentExecutionConfig>), and all runtime
 * per-call data lives in `opts.runtime` (AgentExecutionRuntime).
 */

import type { ManagedAgentOptions } from "../types/instance.types";
import {
  resolveExecutionConfig,
  type AgentExecutionConfig,
  type AgentExecutionRuntime,
} from "../types/agent-execution-config.types";

export interface NormalizedManagedOptions {
  identity: {
    surfaceKey: string;
    sourceFeature: ManagedAgentOptions["sourceFeature"];
    agentId?: string;
    shortcutId?: string;
    manual?: ManagedAgentOptions["manual"];
  };
  /** Fully-resolved config (all defaults filled in). */
  config: AgentExecutionConfig;
  /** Runtime payload (all fields optional). */
  runtime: AgentExecutionRuntime;
  flags: {
    ready?: boolean;
    isEphemeral?: boolean;
    apiEndpointMode?: ManagedAgentOptions["apiEndpointMode"];
    jsonExtraction?: ManagedAgentOptions["jsonExtraction"];
    showAutoClearToggle?: boolean;
    autoClearConversation?: boolean;
  };
}

export function normalizeManagedOptions(
  opts: ManagedAgentOptions,
): NormalizedManagedOptions {
  const config = resolveExecutionConfig(opts.config ?? null);
  const runtime: AgentExecutionRuntime = { ...(opts.runtime ?? {}) };

  return {
    identity: {
      surfaceKey: opts.surfaceKey,
      sourceFeature: opts.sourceFeature,
      agentId: opts.agentId,
      shortcutId: opts.shortcutId,
      manual: opts.manual,
    },
    config,
    runtime,
    flags: {
      ready: opts.ready,
      isEphemeral: opts.isEphemeral,
      apiEndpointMode: opts.apiEndpointMode,
      jsonExtraction: opts.jsonExtraction,
      showAutoClearToggle: opts.showAutoClearToggle,
      autoClearConversation: opts.autoClearConversation,
    },
  };
}
